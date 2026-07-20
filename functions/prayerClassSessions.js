'use strict'

const { FieldValue } = require('firebase-admin/firestore')

const CASABLANCA_TIME_ZONE = 'Africa/Casablanca'
const ACTIVE_STATUSES = new Set(['going', 'praying'])

const DAY_ALIASES = Object.freeze({
  sunday: 'sunday',
  dimanche: 'sunday',
  dim: 'sunday',
  monday: 'monday',
  lundi: 'monday',
  lun: 'monday',
  tuesday: 'tuesday',
  mardi: 'tuesday',
  mar: 'tuesday',
  wednesday: 'wednesday',
  mercredi: 'wednesday',
  mer: 'wednesday',
  thursday: 'thursday',
  jeudi: 'thursday',
  jeu: 'thursday',
  friday: 'friday',
  vendredi: 'friday',
  ven: 'friday',
  saturday: 'saturday',
  samedi: 'saturday',
  sam: 'saturday',
})

const CASABLANCA_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CASABLANCA_TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

class PrayerClassSessionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PrayerClassSessionError'
    this.code = code
  }
}

function normalizeToken(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : ''
}

function normalizeClasse(value) {
  if (typeof value !== 'string') {
    throw new PrayerClassSessionError('invalid-argument', 'Invalid class.')
  }
  const classe = value.trim()
  if (classe.length === 0 || classe.length > 80 || classe.includes('/')) {
    throw new PrayerClassSessionError('invalid-argument', 'Invalid class.')
  }
  return classe
}

function parseHHMM(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** Date, jour et minute métier, toujours calculés à Casablanca. */
function casablancaClock(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new PrayerClassSessionError('internal', 'Server clock unavailable.')
  }
  const parts = Object.fromEntries(
    CASABLANCA_FORMATTER.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  if (!parts.year || !parts.month || !parts.day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new PrayerClassSessionError('internal', 'Server clock unavailable.')
  }
  return {
    serviceDate: `${parts.year}-${parts.month}-${parts.day}`,
    day: normalizeToken(parts.weekday),
    minuteOfDay: hour * 60 + minute,
  }
}

function normalizedSlotDay(slot) {
  return DAY_ALIASES[normalizeToken(slot && (slot.day || slot.jour))] || null
}

function slotEndMinute(slot, startMinute) {
  const explicitEnd = parseHHMM(slot && slot.endTime)
  if (explicitEnd != null && explicitEnd > startMinute) return explicitEnd

  const duration = slot && slot.durationMin
  if (!Number.isFinite(duration) || duration <= 0 || duration > 12 * 60) return null
  const end = startMinute + Math.round(duration)
  return end <= 24 * 60 ? end : null
}

/**
 * Trouve le créneau réellement en cours. `seance` n'intervient jamais dans
 * cette décision : S1…S6 restent les périodes globales de l'établissement.
 */
function findCurrentClassSlot(weeklySlots, classe, clock) {
  if (!Array.isArray(weeklySlots)) return null
  const matches = weeklySlots.filter((slot) => {
    if (normalizedSlotDay(slot) !== clock.day) return false
    const start = parseHHMM(slot.startTime)
    if (start == null) return false
    const end = slotEndMinute(slot, start)
    return end != null && clock.minuteOfDay >= start && clock.minuteOfDay < end
  })
  if (matches.length !== 1) return null

  const slotClasse = typeof matches[0]?.classe === 'string' ? matches[0].classe.trim() : ''
  return slotClasse === classe ? matches[0] : null
}

function teacherProfileHasClass(profile, classe) {
  if (!profile || profile.role !== 'professeur') return false
  const classes = Array.isArray(profile.classes)
    ? profile.classes.filter((value) => typeof value === 'string').map((value) => value.trim())
    : []
  const legacyClasse = typeof profile.classe === 'string' ? profile.classe.trim() : ''
  return classes.includes(classe) || legacyClasse === classe
}

function prayerSessionId(serviceDate, classe) {
  return `${serviceDate}_${classe}`
}

/**
 * Démarrage serveur sécurisé du déplacement d'une classe vers la prière.
 *
 * Les trois preuves (rôle, classe du profil, créneau en cours) sont relues
 * dans la transaction. La date et les horodatages ne viennent jamais du
 * client. Un retry sur une session active est idempotent ; une session déjà
 * revenue reste terminale.
 */
async function startPrayerClassSession(db, { uid, classe: requestedClasse, now = new Date() }) {
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new PrayerClassSessionError('unauthenticated', 'Sign in required.')
  }
  const classe = normalizeClasse(requestedClasse)
  const clock = casablancaClock(now)
  const sessionId = prayerSessionId(clock.serviceDate, classe)
  const userRef = db.collection('users').doc(uid)
  const scheduleRef = db.collection('schedules').doc(uid)
  const sessionRef = db.collection('prayerClassSessions').doc(sessionId)

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef)
    const scheduleSnap = await transaction.get(scheduleRef)
    const sessionSnap = await transaction.get(sessionRef)
    const profile = userSnap.exists ? userSnap.data() : null

    if (!profile || profile.role !== 'professeur') {
      throw new PrayerClassSessionError('permission-denied', 'Teacher access required.')
    }
    if (!teacherProfileHasClass(profile, classe)) {
      throw new PrayerClassSessionError('permission-denied', 'Class access denied.')
    }

    if (sessionSnap.exists) {
      const existing = sessionSnap.data() || {}
      if (existing.serviceDate !== clock.serviceDate || existing.classe !== classe) {
        throw new PrayerClassSessionError('failed-precondition', 'Prayer session is inconsistent.')
      }
      if (ACTIVE_STATUSES.has(existing.status)) {
        return {
          changed: false,
          id: sessionId,
          serviceDate: clock.serviceDate,
          classe,
          status: existing.status,
        }
      }
      if (existing.status === 'returned') {
        throw new PrayerClassSessionError('failed-precondition', 'Prayer session is already closed.')
      }
      throw new PrayerClassSessionError('failed-precondition', 'Prayer session has an invalid status.')
    }

    // Le créneau en cours est une précondition de CRÉATION. Une session déjà
    // active est renvoyée avant ce contrôle pour qu'un retry réseau reste
    // idempotent même si la minute de fin du cours vient de passer.
    const schedule = scheduleSnap.exists ? scheduleSnap.data() : null
    const currentSlot = findCurrentClassSlot(schedule?.weeklySlots, classe, clock)
    if (!currentSlot) {
      throw new PrayerClassSessionError(
        'failed-precondition',
        'The teacher does not currently have this class.',
      )
    }

    transaction.create(sessionRef, {
      serviceDate: clock.serviceDate,
      classe,
      status: 'going',
      startedAt: FieldValue.serverTimestamp(),
      startedByUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return {
      changed: true,
      id: sessionId,
      serviceDate: clock.serviceDate,
      classe,
      status: 'going',
    }
  })
}

module.exports = {
  CASABLANCA_TIME_ZONE,
  PrayerClassSessionError,
  casablancaClock,
  findCurrentClassSlot,
  prayerSessionId,
  startPrayerClassSession,
  teacherProfileHasClass,
}
