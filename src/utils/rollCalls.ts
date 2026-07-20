import { dayName, parseHM, type WeekDay } from './courseSchedule'
import { resolveScheduleSessionCode } from './scheduleSession'

const DAY_ALIASES: Record<string, WeekDay> = {
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
}

export type RollCallTiming = 'current' | 'past' | 'upcoming' | 'unknown'

export interface RollCallSlot {
  id: string
  classeId?: string | null
  classe?: string | null
  day?: string | null
  jour?: string | null
  startTime?: string | null
  endTime?: string | null
  durationMin?: number | null
  seance?: string | null
  matiere?: string | null
  salle?: string | null
  professeurNom?: string | null
  teacherUid?: string | null
}

export interface RollCallSession {
  id: string
  classe: string
  seance: string
  day: WeekDay
  startTime: string
  endTime?: string | null
  durationMin?: number | null
  matiere?: string | null
  salle?: string | null
  professeurNom?: string | null
  timing: RollCallTiming
  done: boolean
}

export function rollCallSessionKey(classe: string, seance: string): string {
  return `${classe.trim()}|${seance.trim()}`
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeDay(value?: string | null): WeekDay | null {
  if (!value) return null
  return DAY_ALIASES[normalizeToken(value)] ?? null
}

function seanceForSlot(slot: RollCallSlot): string | null {
  const start = slot.startTime?.trim() || ''
  return resolveScheduleSessionCode({ seance: slot.seance, startTime: start })
    ?? (start || null)
}

function timingForSlot(slot: RollCallSlot, now: Date): RollCallTiming {
  const start = parseHM(slot.startTime)
  if (Number.isNaN(start)) return 'unknown'

  const explicitEnd = parseHM(slot.endTime)
  const duration = typeof slot.durationMin === 'number' && slot.durationMin > 0
    ? slot.durationMin
    : 60
  const end = Number.isNaN(explicitEnd) ? start + duration : explicitEnd
  const current = now.getHours() * 60 + now.getMinutes()

  if (current >= start && current < end) return 'current'
  if (current >= end) return 'past'
  return 'upcoming'
}

export function buildTodayRollCallSessions(
  slots: RollCallSlot[],
  completedKeys: Set<string>,
  now = new Date(),
): RollCallSession[] {
  const today = dayName(now)
  const sessions: RollCallSession[] = []

  slots.forEach(slot => {
    const day = normalizeDay(slot.day || slot.jour)
    const classe = (slot.classeId || slot.classe || '').trim()
    if (day !== today || !classe) return
    const seance = seanceForSlot(slot)
    if (!seance) return
    sessions.push({
      id: slot.id,
      classe,
      seance,
      day,
      startTime: slot.startTime || '',
      endTime: slot.endTime,
      durationMin: slot.durationMin,
      matiere: slot.matiere,
      salle: slot.salle,
      professeurNom: slot.professeurNom,
      timing: timingForSlot(slot, now),
      done: completedKeys.has(rollCallSessionKey(classe, seance)),
    })
  })

  return sessions.sort((a, b) => {
    const startDiff = parseHM(a.startTime) - parseHM(b.startTime)
    if (!Number.isNaN(startDiff) && startDiff !== 0) return startDiff
    const classDiff = a.classe.localeCompare(b.classe, undefined, { numeric: true })
    if (classDiff !== 0) return classDiff
    return a.seance.localeCompare(b.seance, undefined, { numeric: true })
  })
}

export function isDueRollCall(session: RollCallSession): boolean {
  return session.timing === 'current' || session.timing === 'past' || session.timing === 'unknown'
}

export function summarizeRollCallSessions(sessions: RollCallSession[]) {
  const dueSessions = sessions.filter(isDueRollCall)
  const missingSessions = dueSessions.filter(session => !session.done)
  const missingClasses = [...new Set(missingSessions.map(session => session.classe))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return {
    callsDone: dueSessions.filter(session => session.done).length,
    callsExpected: dueSessions.length,
    dueSessions,
    missingSessions,
    missingClasses,
  }
}
