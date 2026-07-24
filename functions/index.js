/**
 * Cloud Functions — server-side push notifications for Mojammaa SGS.
 *
 * Why server-side: the hardened Firestore rules forbid a teacher (or any
 * client) from reading another user's `users/{uid}` doc, so clients cannot
 * read recipients' Expo push tokens. The Admin SDK bypasses security rules,
 * so this function — triggered on every new `messages` doc — resolves the
 * recipients, reads their tokens, and calls the Expo Push API. Clients only
 * write the message; in-app delivery still happens via the Firestore listener.
 */

const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const logger = require('firebase-functions/logger')
const { claimEmailSlot, claimGlobalSlot } = require('./resetThrottle')
const { computeClassStats, statsDocId } = require('./classStats')
const { computeSchoolStats } = require('./schoolStats')
const {
  calculateCollegeEvaluation,
  normalizeText: normalizeSubjectText,
  subjectEntry,
} = require('./collegeEvaluation')
const { gradeProgress, gradeProgressStudents } = require('./gradeProgress')
const drill = require('./statsDrilldown')
const { buildSlotDocs } = require('./emploiDuTempsSync')
const {
  TransportTransitionError,
  reportTransportTripDelay,
  transitionTransportTrip,
} = require('./transportTransitions')
const {
  affectedGuardianUids,
  rebuildGuardianAccess,
} = require('./guardianAccess')
const {
  PrayerClassSessionError,
  startPrayerClassSession: startPrayerClassSessionTransaction,
} = require('./prayerClassSessions')

initializeApp()
const db = getFirestore()

// Firestore DB is in eur3 → colocate the function in Europe to match the
// existing deployment and avoid cross-region hops.
setGlobalOptions({ maxInstances: 10, region: 'europe-west1' })

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const EXPO_PUSH_TOKEN_RE = /^(Expo|Exponent)PushToken\[[^\]]+\]$/
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function isValidExpoPushToken(token) {
  return typeof token === 'string' && EXPO_PUSH_TOKEN_RE.test(token)
}

/** Resolve the set of recipient UIDs for a message document. */
async function resolveRecipientUids(data) {
  const uids = new Set()

  // New format
  if (data.toType === 'user' && Array.isArray(data.toIds)) {
    data.toIds.forEach((u) => u && uids.add(u))
  } else if (data.toType === 'all') {
    const snap = await db.collection('users').get()
    snap.forEach((d) => uids.add(d.id))
  } else if (data.toType === 'parents') {
    const snap = await db.collection('users').where('role', '==', 'parent').get()
    snap.forEach((d) => uids.add(d.id))
    // Le rôle professionnel reste intact pour un professeur/chauffeur qui a
    // des enfants. `guardianAccess` matérialise ces liens sans dupliquer le
    // compte ni exposer les élèves dans le message.
    const guardians = await db.collection('guardianAccess').get()
    guardians.forEach((d) => uids.add(d.id))
  } else if (data.toType === 'teachers') {
    const snap = await db.collection('users').where('role', '==', 'professeur').get()
    snap.forEach((d) => uids.add(d.id))
  }

  // Legacy `toId` string format — honoré UNIQUEMENT si le doc n'a pas le
  // nouveau format (2026-07-11) : un doc mixte toType+toId élargissait le
  // fan-out push (toId:'all' → toute l'école). Les règles interdisent
  // désormais le mélange à la création ; ceci est la défense en profondeur.
  if (data.toType == null && !Array.isArray(data.toIds) && typeof data.toId === 'string') {
    if (data.toId === 'all') {
      const snap = await db.collection('users').get()
      snap.forEach((d) => uids.add(d.id))
    } else if (data.toId === 'parents' || data.toId === 'teachers') {
      const role = data.toId === 'parents' ? 'parent' : 'professeur'
      const snap = await db.collection('users').where('role', '==', role).get()
      snap.forEach((d) => uids.add(d.id))
    } else if (data.toId !== 'admin') {
      uids.add(data.toId) // a direct UID
    }
  }

  // Never notify the sender of their own message.
  if (data.fromId) uids.delete(data.fromId)
  return [...uids]
}

/** Read Expo push tokens for a list of UIDs (Admin SDK → bypasses rules). */
async function tokensForUids(uids) {
  const tokens = new Set()
  let invalid = 0
  // getAll is efficient and avoids the `in`-query 10-item limit.
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((u) => db.collection('users').doc(u))
    const docs = await db.getAll(...refs)
    docs.forEach((d) => {
      const tok = d.exists ? d.get('expoPushToken') : null
      if (!tok) return
      if (isValidExpoPushToken(tok)) tokens.add(tok)
      else invalid++
    })
  }
  return { tokens: [...tokens], invalid }
}

/** Token + langue préférée, sans exposer ces valeurs dans les logs. */
async function pushTargetsForUids(uids) {
  const byToken = new Map()
  let invalid = 0
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => db.collection('users').doc(uid))
    const docs = await db.getAll(...refs)
    docs.forEach((docSnap) => {
      const token = docSnap.exists ? docSnap.get('expoPushToken') : null
      if (!token) return
      if (!isValidExpoPushToken(token)) {
        invalid++
        return
      }
      const requested = docSnap.get('notificationLanguage')
      const language = ['fr', 'en', 'ar'].includes(requested) ? requested : 'fr'
      byToken.set(token, { token, language })
    })
  }
  return { targets: [...byToken.values()], invalid }
}

function summarizeExpoTicketError(ticket) {
  return {
    message: ticket?.message || null,
    error: ticket?.details?.error || null,
  }
}

/** Send to the Expo Push API in batches of 100. Returns ticket counts. */
async function sendExpoPush(messages) {
  let sent = 0
  let errors = 0
  const ticketIds = []
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        errors += chunk.length
        logger.warn('Expo push non-OK', { status: res.status, json })
        continue
      }

      const tickets = Array.isArray(json?.data) ? json.data : []
      if (tickets.length === 0 && chunk.length > 0) {
        errors += chunk.length
        logger.warn('Expo push response missing tickets', { json })
        continue
      }

      const ticketErrors = []
      tickets.forEach((ticket) => {
        if (ticket?.status === 'ok') {
          sent++
          if (typeof ticket.id === 'string') ticketIds.push(ticket.id)
        }
        else {
          errors++
          ticketErrors.push(summarizeExpoTicketError(ticket))
        }
      })
      if (ticketErrors.length > 0) {
        logger.warn('Expo push ticket errors', {
          count: ticketErrors.length,
          sample: ticketErrors.slice(0, 3),
        })
      }
    } catch (e) {
      errors += chunk.length
      logger.error('Expo push failed', e)
    }
  }
  return { sent, errors, ticketIds }
}

/**
 * Envoie une notification Smart Pickup sans identifiant, nom, classe, trajet
 * ou zone dans le contenu visible ni dans les logs. Les identifiants utiles à
 * l'autorisation restent exclusivement dans Firestore.
 */
async function sendPrivacySafePushToUids(uids, notification, eventKind) {
  const recipients = [...new Set(
    uids.filter((uid) => typeof uid === 'string' && uid.length > 0),
  )]
  if (recipients.length === 0) return

  const { targets, invalid: invalidTokens } = await pushTargetsForUids(recipients)
  if (targets.length === 0) {
    logger.info('Smart Pickup push skipped (no valid token)', {
      eventKind,
      recipients: recipients.length,
      invalidTokens,
    })
    return
  }

  const messages = targets.map(({ token, language }) => {
    const copy = notification.copies[language] || notification.copies.fr
    return {
      to: token,
      sound: 'default',
      title: copy.title,
      body: copy.body,
      priority: 'high',
      channelId: 'default',
      // Ne pas envoyer requestId/tripId/eleveId : l'écran recharge sa vue
      // autorisée depuis Firestore après ouverture de l'application.
      data: notification.data,
    }
  })
  const result = await sendExpoPush(messages)
  logger.info('Smart Pickup push processed', {
    eventKind,
    recipients: recipients.length,
    tokens: targets.length,
    invalidTokens,
    sent: result.sent,
    errors: result.errors,
  })
}

const PICKUP_PUSH_COPY = Object.freeze({
  called: {
    fr: { title: 'Sortie scolaire', body: "Votre enfant a été appelé. Suivez l'état dans Mojammaa." },
    en: { title: 'School pickup', body: 'Your child has been called. Follow the status in Mojammaa.' },
    ar: { title: 'الخروج المدرسي', body: 'تم استدعاء طفلكم. تابعوا الحالة في تطبيق Mojammaa.' },
  },
  ready: {
    fr: { title: 'Sortie scolaire', body: 'Votre enfant est prêt dans la zone de remise.' },
    en: { title: 'School pickup', body: 'Your child is ready in the pickup area.' },
    ar: { title: 'الخروج المدرسي', body: 'طفلكم جاهز في منطقة التسليم.' },
  },
  completed: {
    fr: { title: 'Sortie scolaire', body: 'La remise de votre enfant a été confirmée.' },
    en: { title: 'School pickup', body: 'Your child handoff has been confirmed.' },
    ar: { title: 'الخروج المدرسي', body: 'تم تأكيد تسليم طفلكم.' },
  },
})

const PASSENGER_PUSH_COPY = Object.freeze({
  boarded: {
    fr: { title: 'Transport scolaire', body: 'La montée de votre enfant dans le véhicule a été confirmée.' },
    en: { title: 'School transport', body: 'Your child boarding the vehicle has been confirmed.' },
    ar: { title: 'النقل المدرسي', body: 'تم تأكيد صعود طفلكم إلى مركبة النقل المدرسي.' },
  },
  dropped_off: {
    fr: { title: 'Transport scolaire', body: 'La descente de votre enfant a été confirmée.' },
    en: { title: 'School transport', body: 'Your child drop-off has been confirmed.' },
    ar: { title: 'النقل المدرسي', body: 'تم تأكيد نزول طفلكم من مركبة النقل المدرسي.' },
  },
})

/** Retourne le parent de l'élève sans recopier parentUid dans les trajets. */
async function parentUidForEleve(eleveId) {
  if (typeof eleveId !== 'string' || eleveId.length === 0) return null
  const snap = await db.collection('eleves').doc(eleveId).get()
  const parentUid = snap.exists ? snap.get('parentUid') : null
  return typeof parentUid === 'string' && parentUid.length > 0 ? parentUid : null
}

/** Parents uniques des passagers d'un trajet, résolus depuis `eleves`. */
async function parentUidsForTrip(tripId) {
  const passengerSnap = await db
    .collection('transportTrips')
    .doc(tripId)
    .collection('passengers')
    .get()
  const eleveIds = [...new Set(
    passengerSnap.docs
      .map((passenger) => passenger.get('eleveId'))
      .filter((eleveId) => typeof eleveId === 'string' && eleveId.length > 0),
  )]

  const parentUids = new Set()
  for (let i = 0; i < eleveIds.length; i += 100) {
    const refs = eleveIds
      .slice(i, i + 100)
      .map((eleveId) => db.collection('eleves').doc(eleveId))
    const eleves = await db.getAll(...refs)
    eleves.forEach((eleve) => {
      const parentUid = eleve.exists ? eleve.get('parentUid') : null
      if (typeof parentUid === 'string' && parentUid.length > 0) parentUids.add(parentUid)
    })
  }
  return [...parentUids]
}

// ── Smart Pickup / transport : notifications privées ─────────────────────
// Aucun trigger ne journalise parentUid, eleveId, tripId ou requestId.
exports.onPickupRequestWritten = onDocumentWritten('pickupRequests/{requestId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after = event.data?.after?.exists ? event.data.after.data() : null
  if (!after || before?.status === after.status) return

  const copy = PICKUP_PUSH_COPY[after.status]
  if (!copy) return
  const current = await event.data.after.ref.get()
  if (!current.exists || current.get('status') !== after.status) return
  const parentUid = await parentUidForEleve(after.eleveId)
  if (!parentUid) return
  await sendPrivacySafePushToUids(
    [parentUid],
    { copies: copy, data: { type: 'pickup_status', status: after.status } },
    `pickup_${after.status}`,
  )
})

exports.onTransportPassengerWritten = onDocumentWritten(
  'transportTrips/{tripId}/passengers/{passengerId}',
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null
    const after = event.data?.after?.exists ? event.data.after.data() : null
    if (!after || before?.status === after.status) return

    const copy = PASSENGER_PUSH_COPY[after.status]
    if (!copy) return
    const current = await event.data.after.ref.get()
    if (!current.exists || current.get('status') !== after.status) return
    const parentUid = await parentUidForEleve(after.eleveId)
    if (!parentUid) return
    await sendPrivacySafePushToUids(
      [parentUid],
      { copies: copy, data: { type: 'transport_passenger_status', status: after.status } },
      `passenger_${after.status}`,
    )
  },
)

exports.onTransportTripWritten = onDocumentWritten('transportTrips/{tripId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after = event.data?.after?.exists ? event.data.after.data() : null
  if (!after) return

  const previousDelay = Number(before?.delayMinutes || 0)
  const rawDelay = Number(after.delayMinutes || 0)
  if (!Number.isFinite(rawDelay)) return
  const delayMinutes = Math.max(0, Math.round(rawDelay))
  if (delayMinutes === previousDelay) return
  if (delayMinutes <= 0) return

  // Les triggers peuvent arriver dans le désordre : seul l'événement qui
  // correspond encore à la révision courante est autorisé à notifier.
  const current = await event.data.after.ref.get()
  const afterRevision = Number(after.delayRevision || 0)
  if (!current.exists
      || Number(current.get('delayRevision') || 0) !== afterRevision
      || Number(current.get('delayMinutes') || 0) !== delayMinutes) return

  const parentUids = await parentUidsForTrip(event.params.tripId)
  await sendPrivacySafePushToUids(
    parentUids,
    {
      copies: {
        fr: { title: 'Transport scolaire', body: `Un retard d'environ ${delayMinutes} min est signalé.` },
        en: { title: 'School transport', body: `A delay of about ${delayMinutes} min has been reported.` },
        ar: { title: 'النقل المدرسي', body: `تم الإبلاغ عن تأخر يقدر بحوالي ${delayMinutes} دقيقة.` },
      },
      data: { type: 'transport_delay', delayMinutes: Math.round(delayMinutes) },
    },
    'transport_delay',
  )
})

// Capacité parent additive pour les comptes professeur/chauffeur. La source
// d'autorité reste `eleves.parentUid`; ce document ne sert qu'aux règles qui
// doivent prouver un droit de classe sans pouvoir exécuter de requête.
exports.onEleveGuardianAccessWritten = onDocumentWritten('eleves/{eleveId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after = event.data?.after?.exists ? event.data.after.data() : null
  const uids = affectedGuardianUids(before, after)
  if (uids.length === 0) return

  const results = await Promise.all(
    uids.map((uid) => rebuildGuardianAccess(db, uid, FieldValue)),
  )
  logger.info('Guardian access rebuilt', {
    guardians: uids.length,
    active: results.filter((result) => result.active).length,
  })
})

async function fetchExpoPushReceipts(ids) {
  const receipts = {}
  let requestErrors = 0
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: chunk }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        requestErrors += chunk.length
        logger.warn('Expo receipt non-OK', { status: res.status, json })
        continue
      }
      if (json?.data && typeof json.data === 'object') Object.assign(receipts, json.data)
    } catch (e) {
      requestErrors += chunk.length
      logger.error('Expo receipt fetch failed', e)
    }
  }
  return { receipts, requestErrors }
}

function summarizeExpoReceipts(ticketIds, receipts) {
  const summary = { ok: 0, error: 0, missing: 0 }
  const errors = []
  ticketIds.forEach((id) => {
    const receipt = receipts[id]
    if (!receipt) {
      summary.missing++
    } else if (receipt.status === 'ok') {
      summary.ok++
    } else {
      summary.error++
      errors.push({
        id,
        message: receipt.message || null,
        error: receipt.details?.error || null,
      })
    }
  })
  return { summary, errors }
}

// Name MUST stay `onMessageCreated` and region `europe-west1` to REPLACE the
// pre-existing deployed function — not create a duplicate that double-sends.
exports.onMessageCreated = onDocumentCreated('messages/{messageId}', async (event) => {
  const snap = event.data
  if (!snap) return
  const data = snap.data() || {}

  // Filet de sécurité période (voir stampPeriodFields) — un message sans
  // academicYear serait invisible dans toutes les boîtes de réception.
  await stampPeriodFields(snap, data.createdAt)

  const uids = await resolveRecipientUids(data)
  if (uids.length === 0) {
    await snap.ref.set({ push: { sent: 0, recipients: 0, at: new Date() } }, { merge: true })
    return
  }

  const { tokens, invalid: invalidTokens } = await tokensForUids(uids)
  const title = (data.priority === 'urgent' ? '🚨 ' : '') + (data.subject || data.subjectAr || 'Nouveau message')
  const targetWorkspace = data.toType === 'parents' || data.toId === 'parents'
    ? 'parent'
    : undefined
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: data.body || data.bodyAr || "Ouvrez l'application pour le detail.",
    // priority high : réveille l'appareil même en Doze (sinon FCM « normal »
    // peut retenir la notif jusqu'à la prochaine ouverture de l'app).
    // channelId : canal Android créé par l'app (importance MAX).
    priority: 'high',
    channelId: 'default',
    data: {
      messageId: event.params.messageId,
      type: data.category || 'announcement',
      ...(targetWorkspace ? { workspace: targetWorkspace } : {}),
    },
  }))

  const pushResult = await sendExpoPush(messages)
  const receiptReadyAt = pushResult.ticketIds.length > 0
    ? new Date(Date.now() + RECEIPT_CHECK_DELAY_MS)
    : null
  logger.info('push processed', {
    messageId: event.params.messageId,
    recipients: uids.length,
    tokens: tokens.length,
    invalidTokens,
    sent: pushResult.sent,
    errors: pushResult.errors,
    ticketIds: pushResult.ticketIds.length,
  })

  // Record outcome for observability (does not re-trigger onCreate).
  await snap.ref.set({
    push: {
      sent: pushResult.sent,
      errors: pushResult.errors,
      recipients: uids.length,
      tokens: tokens.length,
      invalidTokens,
      ticketIds: pushResult.ticketIds,
      receiptReadyAt,
      at: new Date(),
    },
  }, { merge: true })
})

// Expo tickets only mean "accepted by Expo". Receipts reveal provider errors
// such as InvalidCredentials, MismatchSenderId, or DeviceNotRegistered.
exports.checkPushReceipts = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Africa/Casablanca' },
  async () => {
    const snap = await db
      .collection('messages')
      .where('push.receiptReadyAt', '<=', new Date())
      .limit(50)
      .get()

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {}
      const push = data.push || {}
      const ticketIds = Array.isArray(push.ticketIds)
        ? push.ticketIds.filter((id) => typeof id === 'string')
        : []
      if (ticketIds.length === 0) {
        await docSnap.ref.set({ push: { receiptReadyAt: null } }, { merge: true })
        continue
      }

      const { receipts, requestErrors } = await fetchExpoPushReceipts(ticketIds)
      const { summary, errors } = summarizeExpoReceipts(ticketIds, receipts)
      if (requestErrors > 0) summary.requestErrors = requestErrors

      const pushAt = typeof push.at?.toDate === 'function' ? push.at.toDate() : null
      const tooOld = pushAt ? Date.now() - pushAt.getTime() > RECEIPT_MAX_AGE_MS : false
      const receiptReadyAt = summary.missing > 0 && !tooOld
        ? new Date(Date.now() + RECEIPT_CHECK_DELAY_MS)
        : null

      await docSnap.ref.set({
        push: {
          receipts: summary,
          receiptErrors: errors.slice(0, 10),
          receiptCheckedAt: new Date(),
          receiptReadyAt,
        },
      }, { merge: true })

      if (summary.error > 0 || requestErrors > 0) {
        logger.warn('push receipt errors', {
          messageId: docSnap.id,
          receipts: summary,
          sample: errors.slice(0, 3),
        })
      } else {
        logger.info('push receipts checked', { messageId: docSnap.id, receipts: summary })
      }
    }
  },
)

// ── classStats : agrégats anonymes par (année scolaire, classe, semestre) ──
//
// Pourquoi : l'écran Notes parent affiche moyenne de classe + rang. Avant, il
// lisait TOUTES les notes brutes de la classe (trou de confidentialité — un
// parent voyait les notes des autres enfants). Ce trigger maintient un agrégat
// anonyme dans classStats/{academicYear}__{classe}__{semestre} ; le client ne lit plus que ça,
// ce qui permettra de durcir la règle de lecture sur `notes`.

/** Recalcule (full recompute, idempotent) l'agrégat d'une période de classe. */
async function refreshClassStats(academicYear, classe, semestre) {
  if (!academicYear || !classe || !semestre) return
  const snap = await db
    .collection('notes')
    .where('academicYear', '==', academicYear)
    .where('classe', '==', classe)
    .where('semestre', '==', semestre)
    .get()
  const stats = computeClassStats(snap.docs.map((d) => d.data()))
  const ref = db.collection('classStats').doc(statsDocId(academicYear, classe, semestre))
  if (stats.notesCount === 0) {
    await ref.delete()
    return
  }
  await ref.set({ academicYear, classe, semestre, ...stats, updatedAt: new Date() })
}

// ── classStatsDirty : coalescing du recalcul (voir onNoteWritten plus bas) ──
//
// Pourquoi : refreshClassStats() relit TOUT le groupe (classe, semestre) à
// chaque appel. Le déclencher en direct depuis onNoteWritten fait un import
// de N notes dans le même groupe coûter ~N × taille_du_groupe lectures
// (quadratique) — un import de 900 notes a généré plusieurs millions de
// lectures Firestore facturées en juillet 2026. onNoteWritten ne marque
// désormais qu'un flag "dirty" (une petite écriture, pas de lecture) ;
// flushClassStatsDirty (planifiée) fait UN SEUL refreshClassStats par
// groupe touché, toutes les 2 minutes, peu importe le nombre d'écritures
// reçues entretemps. Compromis : classStats a jusqu'à ~2 min de retard
// après une note modifiée (imperceptible pour une moyenne de classe).
async function markClassStatsDirty(academicYear, classe, semestre) {
  if (!academicYear || !classe || !semestre) return
  await db.collection('classStatsDirty').doc(statsDocId(academicYear, classe, semestre)).set(
    { academicYear, classe, semestre, touchedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

// ── directory/staff : annuaire du personnel pour les clients parents ───────
//
// Pourquoi : les rules interdisent à un parent de lire users/ (données
// sensibles : emails, push tokens). Pour que le parent puisse ÉCRIRE à un
// prof ou à l'administration (compose), on publie un annuaire minimal
// (uid + nom + matière/classes — rien de sensible) maintenu par ce trigger.

async function refreshDirectory() {
  const snap = await db.collection('users').get()
  const teachers = []
  const admins = []
  snap.forEach((d) => {
    const u = d.data() || {}
    if (u.role === 'professeur') {
      teachers.push({
        uid: d.id,
        nom: u.nom || '',
        prenom: u.prenom || '',
        matiere: u.matiere || '',
        classes: Array.isArray(u.classes) ? u.classes : (u.classe ? [u.classe] : []),
      })
    } else if (u.role === 'admin') {
      admins.push({ uid: d.id, nom: u.nom || '', prenom: u.prenom || '' })
    }
  })
  const byName = (a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
  teachers.sort(byName)
  admins.sort(byName)
  await db.collection('directory').doc('staff').set({ teachers, admins, updatedAt: new Date() })
}

exports.onUserWritten = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after = event.data?.after?.exists ? event.data.after.data() : null

  // Offboarding (#2b) : supprimer users/{uid} doit aussi supprimer définitivement
  // le compte Firebase Auth, sinon l'email reste "pris" et bloque toute recréation
  // (auth/email-already-in-use). Le garde onSnapshot côté client déconnecte déjà
  // en cours de session ; ceci empêche toute reconnexion ultérieure.
  if (before && !after) {
    const uid = event.params.uid
    try {
      await getAuth().deleteUser(uid)
      logger.info('auth account deleted after user doc deletion', { uid })
    } catch (e) {
      // Compte Auth déjà absent (supprimé séparément) : rien à faire.
      if (e?.code === 'auth/user-not-found') logger.info('no auth account to delete', { uid })
      else logger.error('failed to delete auth account', { uid, error: e?.message })
    }
  }

  // users/{uid} est réécrit à CHAQUE login (expoPushToken) : ne recalculer
  // que si un champ visible dans l'annuaire a réellement changé.
  const pick = (u) => (u ? JSON.stringify([u.role, u.nom, u.prenom, u.matiere, u.classes, u.classe]) : '')
  if (pick(before) === pick(after)) return
  await refreshDirectory()
  logger.info('directory/staff refreshed')
})

exports.onNoteWritten = onDocumentWritten('notes/{noteId}', async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null
  const after = event.data?.after?.exists ? event.data.after.data() : null

  // Note écrite par un client sans les champs de période : tamponner d'abord
  // (une note saisie en direct appartient à la période courante). La
  // ré-écriture redéclenche ce trigger avec les champs présents, qui marquera
  // alors le bon groupe dirty.
  if (event.data?.after?.exists && await stampPeriodFields(event.data.after, null)) return

  // Schéma v2 : les composantes sont la source canonique et `note` reste un
  // résumé matérialisé pour les anciens clients. Le serveur recalcule ce résumé
  // afin qu'un client modifié ne puisse pas envoyer une note incohérente avec
  // C1/C2/C3 et les activités intégrées.
  if (event.data?.after?.exists && Number(after?.schemaVersion) === 2) {
    const evaluated = calculateCollegeEvaluation(after)
    const desiredCalculation = {
      status: evaluated.note == null ? 'empty' : evaluated.complete ? 'complete' : 'provisional',
      completed: evaluated.componentsEntered,
      expected: evaluated.componentsExpected,
      completionRate: evaluated.completionRate,
    }
    const currentCalculation = after.calculation && typeof after.calculation === 'object'
      ? {
        status: after.calculation.status,
        completed: after.calculation.completed,
        expected: after.calculation.expected,
        completionRate: after.calculation.completionRate,
      }
      : null
    const derivedMatches = after.note === evaluated.note
      && after.evaluationPolicyVersion === evaluated.policyVersion
      && after.controlesCount === evaluated.controlsEntered
      && after.controlesExpected === evaluated.controlsExpected
      && JSON.stringify(currentCalculation) === JSON.stringify(desiredCalculation)
    if (!derivedMatches) {
      await event.data.after.ref.set({
        gradeSource: 'structured',
        evaluationPolicyVersion: evaluated.policyVersion,
        note: evaluated.note,
        controlesCount: evaluated.controlsEntered,
        controlesExpected: evaluated.controlsExpected,
        calculation: { ...desiredCalculation, computedAt: FieldValue.serverTimestamp() },
      }, { merge: true })
      return
    }
  }

  // Champs qui influencent réellement computeClassStats() (cf. classStats.js) :
  // le reste (eleveNom, codeMassar, demo, importedBy, importedAt, updatedAt…)
  // n'a aucun effet sur l'agrégat — ignorer ces écritures évite de marquer
  // "dirty" pour rien (ex: un script qui ne fait que retoucher updatedAt).
  const pick = (n) => (n ? JSON.stringify([
    n.note, n.controles, n.evaluations, n.activitesIntegrees, n.schemaVersion,
    n.evaluationPolicyVersion, n.bareme, n.cycle, n.academicYear, n.classe, n.semestre,
    n.matiereLabel, n.matiere, n.eleveId,
  ]) : '')
  if (pick(before) === pick(after)) return

  // Une note déplacée de période/classe impacte DEUX agrégats (ancien + nouveau).
  const pairs = new Map()
  for (const d of [before, after]) {
    if (d && d.academicYear && d.classe && d.semestre) {
      pairs.set(`${d.academicYear}|${d.classe}|${d.semestre}`, [d.academicYear, d.classe, d.semestre])
    }
  }
  for (const [academicYear, classe, semestre] of pairs.values()) {
    await markClassStatsDirty(academicYear, classe, semestre)
  }
})

// Coalescing : traite chaque groupe (classe, semestre) marqué dirty AU PLUS
// UNE FOIS par passage, peu importe combien d'écritures de notes l'ont
// touché entretemps. Un import massif de N notes dans le même groupe ne
// coûte donc plus qu'UN SEUL refreshClassStats (pas N).
exports.flushClassStatsDirty = onSchedule(
  { schedule: 'every 2 minutes', timeZone: 'Africa/Casablanca' },
  async () => {
    const dirtySnap = await db.collection('classStatsDirty').get()
    if (dirtySnap.empty) return
    for (const doc of dirtySnap.docs) {
      const { academicYear, classe, semestre } = doc.data()
      await refreshClassStats(academicYear, classe, semestre)
      await doc.ref.delete()
    }
    logger.info('classStats flushed', { groups: dirtySnap.size })
  },
)

// ── Filets de sécurité période (clients pas encore à jour) ──────────────────
//
// Les clients à jour écrivent academicYear/semestre/monthKey eux-mêmes ; ces
// triggers ne patchent QUE les docs où les champs manquent. Dérivations
// identiques à scripts/backfillAcademicPeriods.js : date métier d'abord
// (date d'absence, échéance de devoir), date de création sinon.
exports.onAbsenceCreated = onDocumentCreated('absences/{absenceId}', async (event) => {
  if (!event.data) return
  const data = event.data.data() || {}
  await stampPeriodFields(event.data, data.date || data.createdAt)
})

exports.onDevoirCreated = onDocumentCreated('devoirs/{devoirId}', async (event) => {
  if (!event.data) return
  const data = event.data.data() || {}
  await stampPeriodFields(event.data, data.dateLimite || data.createdAt)
})

exports.onRessourceCreated = onDocumentCreated('ressources/{ressourceId}', async (event) => {
  if (!event.data) return
  const data = event.data.data() || {}
  await stampPeriodFields(event.data, data.createdAt)
})

// ── onScheduleWritten : emploiDuTemps toujours synchro avec schedules ───────
//
// Avant : un admin éditait schedules/{teacherUid} puis devait lancer À LA MAIN
// `node scripts/syncEmploiDuTemps.js --commit` pour que la vue par classe
// (emploiDuTemps, lue par parents/profs/admin mobile) se mette à jour — un
// oubli = EDT mobile périmé. Ce trigger fait le rebuild CIBLÉ (ce prof
// seulement) automatiquement à chaque écriture, y compris suppression du
// doc (weeklySlots vidé → tous les créneaux de ce prof disparaissent).
exports.onScheduleWritten = onDocumentWritten('schedules/{teacherUid}', async (event) => {
  const teacherUid = event.params.teacherUid
  const after = event.data?.after?.exists ? event.data.after.data() : null

  const old = await db.collection('emploiDuTemps').where('teacherUid', '==', teacherUid).get()
  const batch = db.batch()
  old.forEach((d) => batch.delete(d.ref))

  let slotsCount = 0
  if (after) {
    const teacherDoc = await db.collection('users').doc(teacherUid).get()
    const t = teacherDoc.exists ? teacherDoc.data() : {}
    const teacherInfo = {
      matiere: t.matiere || null,
      professeurNom: `${t.prenom || ''} ${t.nom || ''}`.trim() || null,
    }
    const docs = buildSlotDocs(teacherUid, after.weeklySlots || [], teacherInfo)
    docs.forEach((d) => batch.set(db.collection('emploiDuTemps').doc(d.id), {
      ...d.body,
      updatedAt: FieldValue.serverTimestamp(),
    }))
    slotsCount = docs.length
  }

  await batch.commit()
  logger.info('emploiDuTemps synced', { teacherUid, slots: slotsCount })
})

// ── weeklyDigest : récapitulatif hebdo par parent ───────────────────────────
//
// Vendredi 16h (heure de Casablanca) : un message bilingue par parent avec
// les nouvelles notes / absences / devoirs à venir de SES enfants. Les
// parents sans activité ne reçoivent rien. Le push part via onMessageCreated.
// Test manuel : node scripts/runWeeklyDigest.js (dry-run par défaut).
const { buildWeeklyDigests, sendWeeklyDigests } = require('./digest')

exports.weeklyDigest = onSchedule(
  { schedule: 'every friday 16:00', timeZone: 'Africa/Casablanca' },
  async () => {
    const digests = await buildWeeklyDigests(db)
    const sent = await sendWeeklyDigests(db, digests)
    logger.info('weeklyDigest done', { parents: digests.length, sent })
  },
)

// ── stats/summary : agrégat complet du tableau de bord admin ────────────────
//
// Pourquoi : l'écran Statistiques scannait 5 collections entières (notes,
// absences… non bornées) à chaque ouverture → lent dès que les données
// grossissent. On pré-calcule tout côté serveur dans UN document `stats/summary`
// que le client lit en une lecture. Le recalcul est déclenché explicitement
// par un admin (pull-to-refresh), jamais en arrière-plan quand personne ne
// consulte les statistiques.

function academicPeriodOf(year, month) {
  const schoolYearStart = month >= 9 ? year : year - 1
  return {
    academicYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
  }
}

// Accepte une date métier ('YYYY-MM-DD'), un Timestamp Firestore ou une Date.
// Mêmes dérivations que src/utils/academicPeriod.ts et le script de backfill.
function academicPeriodForValue(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    return m ? academicPeriodOf(Number(m[1]), Number(m[2])) : null
  }
  const date = value && typeof value.toDate === 'function' ? value.toDate() : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit',
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  return academicPeriodOf(year, month)
}

function currentAcademicPeriod() {
  return academicPeriodForValue(new Date())
}

// Complète academicYear/semestre/monthKey manquants sur un doc écrit par un
// client pas encore à jour (OTA en attente ou runtime < 1.0.14). Sans ce
// filet, le doc est invisible pour toutes les requêtes filtrées par période
// et absent des agrégats — silencieusement. Retourne true si un patch a été écrit.
const PERIOD_FIELDS = ['academicYear', 'semestre', 'monthKey']
async function stampPeriodFields(snap, dateValue) {
  const data = snap.data() || {}
  const missing = PERIOD_FIELDS.filter((field) => typeof data[field] !== 'string' || !data[field])
  if (missing.length === 0) return false
  const period = academicPeriodForValue(dateValue) || currentAcademicPeriod()
  const patch = {}
  for (const field of missing) patch[field] = period[field]
  await snap.ref.set(patch, { merge: true })
  // L'ID d'un document `notes` peut contenir le code Massar. Ne jamais
  // journaliser `snap.ref.path` : la collection suffit au diagnostic et les
  // champs de période permettent de corréler le comportement sans PII.
  logger.info('period fields stamped', { collection: snap.ref.parent.id, ...patch })
  return true
}

/** Recalcule les statistiques de la période active et les écrit (Admin SDK). */
async function refreshSchoolStats() {
  const period = currentAcademicPeriod()
  const [eleves, users, notes, absences, devoirs, coefDoc] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('users').get(),
    db.collection('notes').where('academicYear', '==', period.academicYear).where('semestre', '==', period.semestre).get(),
    db.collection('absences').where('academicYear', '==', period.academicYear).where('monthKey', '==', period.monthKey).get(),
    // Devoirs : année entière, pas le mois de création — activeHomework se
    // calcule sur dateLimite (un devoir créé fin juin dû début juillet doit compter).
    db.collection('devoirs').where('academicYear', '==', period.academicYear).get(),
    db.collection('settings').doc('coefficients').get(),
  ])
  const toRows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const summary = computeSchoolStats({
    eleves: toRows(eleves),
    users: toRows(users),
    notes: toRows(notes),
    absences: toRows(absences),
    devoirs: toRows(devoirs),
    coefficients: coefDoc.exists ? coefDoc.data() : null,
  })
  await db.collection('stats').doc('summary').set({ ...summary, ...period, updatedAt: new Date() })
  return summary
}

const STATS_PERIODS = new Set(['semaine', 'mois', 'S1', 'S2', 'annee'])
const STATS_CYCLES = new Set(['prescolaire', 'primaire', 'college'])

function statsFilterText(value, maxLength = 100) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function cycleFromStudent(data) {
  const explicit = statsFilterText(data.cycle).toLowerCase()
  if (STATS_CYCLES.has(explicit)) return explicit
  const niveau = statsFilterText(data.niveau).toUpperCase()
  if (niveau.includes('APIC')) return 'college'
  if (niveau.includes('AEP')) return 'primaire'
  return 'prescolaire'
}

function casablancaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((row) => row.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function shiftISODate(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days, 12))
  return date.toISOString().slice(0, 10)
}

// A1/F1 — les notes n'ont AUCUNE date pedagogique : `createdAt` est la date de
// saisie (un prof qui saisit trois mois de controles un dimanche les horodate
// tous ce dimanche-la), et DATA_MODEL ne declare aucun `dateEvaluation`. Leur
// seule granularite fiable est le semestre.
//
// Avant, `semaine` et `mois` posaient `semestre: null`, ce qui laissait passer
// TOUTES les notes de l'annee : le hero affichait « Cette semaine » a cote
// d'une moyenne annuelle. Desormais ces deux periodes retombent sur le semestre
// EN COURS, et `notesPeriod` dit explicitement ce que la moyenne couvre.
// `annee` reste volontairement sans semestre : les deux semestres y sont agreges.
function statsDateRange(periodName) {
  const today = casablancaToday()
  const academic = academicPeriodForValue(today)
  const startYear = Number(academic.academicYear.slice(0, 4))
  const currentSemestre = academic.semestre === 'S1' || academic.semestre === 'S2' ? academic.semestre : 'S1'
  if (periodName === 'semaine') {
    return { ...academic, from: shiftISODate(today, -7), to: today, semestre: currentSemestre, notesPeriod: currentSemestre }
  }
  if (periodName === 'mois') {
    return { ...academic, from: `${today.slice(0, 7)}-01`, to: today, semestre: currentSemestre, notesPeriod: currentSemestre }
  }
  if (periodName === 'S1') {
    return { ...academic, from: `${startYear}-09-01`, to: `${startYear + 1}-01-31`, semestre: 'S1', notesPeriod: 'S1' }
  }
  if (periodName === 'S2') {
    return { ...academic, from: `${startYear + 1}-02-01`, to: `${startYear + 1}-07-10`, semestre: 'S2', notesPeriod: 'S2' }
  }
  return { ...academic, from: `${startYear}-09-01`, to: today, semestre: null, notesPeriod: 'annee' }
}

function statsRowInScope(row, scopeIds, scopeClasses, knownStudentIds) {
  const eleveId = statsFilterText(row.eleveId)
  if (eleveId && scopeIds.has(eleveId)) return true
  if (eleveId && knownStudentIds.has(eleveId)) return false
  return scopeClasses.has(statsFilterText(row.classe) || statsFilterText(row.classeId))
}

// Firestore plafonne `in` a 30 valeurs. Les devoirs d'un perimetre-classe se
// comptent en dizaines sur l'annee : une a deux requetes au lieu d'un scan.
const SUBMISSIONS_IN_CHUNK = 30

async function submissionsForDevoirs(devoirIds) {
  const ids = [...new Set(devoirIds.filter(Boolean))]
  if (ids.length === 0) return []
  const chunks = []
  for (let i = 0; i < ids.length; i += SUBMISSIONS_IN_CHUNK) {
    chunks.push(ids.slice(i, i + SUBMISSIONS_IN_CHUNK))
  }
  const snaps = await Promise.all(
    chunks.map((chunk) => db.collection('homeworkSubmissions').where('homeworkId', 'in', chunk).get()),
  )
  return snaps.flatMap((snap) => snap.docs.map((row) => ({ id: row.id, ...row.data() })))
}

/**
 * Resolution du perimetre — SOURCE UNIQUE pour le hero et pour tous les
 * drill-downs. Toute la garantie « le total du detail est le chiffre de la
 * tuile » repose la-dessus : il n'existe qu'un seul chemin qui traduit
 * (periode, cycle, niveau, classe, matiere) en jeux de documents.
 */
async function resolveScope(filters) {
  const periodName = STATS_PERIODS.has(filters.period) ? filters.period : 'mois'
  const cycle = STATS_CYCLES.has(filters.cycle) ? filters.cycle : ''
  const niveau = statsFilterText(filters.niveau)
  const classe = statsFilterText(filters.classe)
  const matiere = statsFilterText(filters.matiere)
  const range = statsDateRange(periodName)

  const [elevesSnap, usersSnap, notesSnap, absencesSnap, devoirsSnap, coefDoc] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('users').get(),
    db.collection('notes').where('academicYear', '==', range.academicYear).get(),
    db.collection('absences').where('date', '>=', range.from).where('date', '<=', range.to).get(),
    db.collection('devoirs').where('academicYear', '==', range.academicYear).get(),
    db.collection('settings').doc('coefficients').get(),
  ])
  const toRows = (snap) => snap.docs.map((row) => ({ id: row.id, ...row.data() }))
  const allStudentRows = toRows(elevesSnap)
  const allEleves = allStudentRows
    .filter((row) => row.active !== false)
    .map((row) => ({ ...row, cycle: cycleFromStudent(row) }))
  const allNotes = toRows(notesSnap)
  // Inclure les archives dans l'ensemble "connu" empêche une ancienne note
  // de retomber dans le scope via sa classe historique.
  const knownStudentIds = new Set(allStudentRows.map((row) => row.id))

  const cycleEleves = allEleves.filter((row) => !cycle || row.cycle === cycle)
  const niveauOptions = [...new Set(cycleEleves.map((row) => statsFilterText(row.niveau)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  const levelEleves = cycleEleves.filter((row) => !niveau || statsFilterText(row.niveau) === niveau)
  const classeOptions = [...new Set(levelEleves.map((row) => statsFilterText(row.classe)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  const scopeEleves = levelEleves.filter((row) => !classe || statsFilterText(row.classe) === classe)
  const scopeIds = new Set(scopeEleves.map((row) => row.id))
  const scopeClasses = new Set(scopeEleves.map((row) => statsFilterText(row.classe)).filter(Boolean))

  const scopedNotes = allNotes.filter((row) => statsRowInScope(row, scopeIds, scopeClasses, knownStudentIds))
  const selectedSubjectEntry = subjectEntry(matiere)
  const noteSubjectValues = (row) => [
    statsFilterText(row.matiere),
    statsFilterText(row.subject),
    statsFilterText(row.matiereLabel),
  ].filter(Boolean)
  const subjectMatches = (row) => {
    if (!matiere) return true
    const requested = normalizeSubjectText(matiere)
    return noteSubjectValues(row).some((value) => {
      if (normalizeSubjectText(value) === requested) return true
      const entry = subjectEntry(value)
      return selectedSubjectEntry && entry && entry.key === selectedSubjectEntry.key
    })
  }
  const subjectMap = new Map()
  scopedNotes.forEach((row) => {
    const key = statsFilterText(row.matiere) || statsFilterText(row.subject) || statsFilterText(row.matiereLabel)
    if (key) {
      const entry = subjectEntry(key)
        || subjectEntry(row.matiereLabel)
        || subjectEntry(row.subject)
      subjectMap.set(key, entry?.canonical || statsFilterText(row.matiereLabel) || statsFilterText(row.subject) || key)
    }
  })
  const subjectOptions = [...subjectMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  const selectedNotes = scopedNotes.filter(subjectMatches)

  const selectedAbsences = toRows(absencesSnap).filter((row) =>
    statsRowInScope(row, scopeIds, scopeClasses, knownStudentIds))
  const selectedDevoirs = toRows(devoirsSnap).filter((row) => {
    const due = statsFilterText(row.dateLimite)
    const rowClass = statsFilterText(row.classeId) || statsFilterText(row.classe)
    // La métrique et son drill-down décrivent les devoirs DONT L'ÉCHÉANCE
    // tombe dans la période. Conserver les devoirs échus est indispensable :
    // leurs non-rendus alimentent précisément la file « À suivre ».
    return scopeClasses.has(rowClass)
      && due >= range.from
      && due <= range.to
  })
  // A6 — avant, `homeworkSubmissions` etait lue INTEGRALEMENT a chaque
  // changement de filtre, puis jetee a 95 %. La collection croit en
  // eleves x devoirs x annees et ne porte pas `academicYear` (DATA_MODEL), donc
  // on ne peut pas la borner par l'annee : on part des devoirs deja reduits au
  // perimetre et on ne lit que leurs soumissions.
  const selectedSubmissions = await submissionsForDevoirs(selectedDevoirs.map((row) => row.id))

  const cacheBase = {
    eleves: scopeEleves,
    users: toRows(usersSnap),
    notes: selectedNotes,
    // A3 — le suivi d'un eleve est global : `scopedNotes` ignore le filtre
    // matiere, sinon « A suivre » changerait en selectionnant une matiere.
    followUpNotes: scopedNotes,
    absences: selectedAbsences,
    devoirs: selectedDevoirs,
    homeworkSubmissions: selectedSubmissions,
    coefficients: coefDoc.exists ? coefDoc.data() : null,
  }

  return {
    cacheBase,
    computeOptions: {
      semestre: range.semestre,
      periodAttendance: true,
      homeworkAlreadyScoped: true,
      // Une période historique doit montrer ses sept derniers jours, pas les
      // sept jours du calendrier actuel (qui produiraient une fausse série à 0).
      trendStartDate: range.from,
      trendEndDate: range.to < casablancaToday() ? range.to : casablancaToday(),
    },
    scopeEleves,
    elevesSnap,
    range,
    options: {
      niveaux: niveauOptions,
      classes: classeOptions,
      matieres: subjectOptions,
    },
    // A4 — c'est CET objet qui doit piloter l'affichage du perimetre, pas le
    // state local du client : le serveur clampe (periode inconnue -> « mois »),
    // et une pastille dessinee depuis le state mentirait sur le calcul reel.
    applied: {
      period: periodName,
      academicYear: range.academicYear,
      cycle,
      niveau,
      classe,
      matiere,
      notesPeriod: range.notesPeriod,
      from: range.from,
      to: range.to,
    },
  }
}

const PROGRESSION_OUTCOMES = new Set(['improved', 'stable', 'declined'])

async function filteredSchoolStats(filters) {
  const scope = await resolveScope(filters)
  return {
    data: computeSchoolStats(scope.cacheBase, scope.computeOptions),
    options: scope.options,
    applied: scope.applied,
  }
}

// Un seul recalcul planifié par jour, juste avant l'ouverture de l'école
// (8h30–16h) : l'admin trouve des stats fraîches le matin sans dépendre du
// pull-to-refresh, et on ne paie aucun scan pour une école fermée. Le scan
// est borné à la période active (~quelques milliers de lectures).
exports.aggregateSchoolStats = onSchedule(
  { schedule: '30 7 * * *', timeZone: 'Africa/Casablanca' },
  async () => {
    const s = await refreshSchoolStats()
    logger.info('stats/summary refreshed (scheduled)', { eleves: s.totalEleves, classes: s.totalClasses })
  },
)

// Recalcul à la demande — réservé aux admins (pull-to-refresh + amorçage
// exceptionnel si stats/summary n'existe pas encore).
exports.recomputeSchoolStats = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const me = await db.collection('users').doc(uid).get()
  if (!me.exists || me.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }
  const s = await refreshSchoolStats()
  logger.info('stats/summary refreshed (on-demand)', { by: uid, eleves: s.totalEleves })
  return { ok: true, updatedAt: Date.now(), totalEleves: s.totalEleves, totalClasses: s.totalClasses }
})

// Rapport filtré de l'app admin. Les données nominatives restent côté serveur :
// le téléphone ne reçoit que les agrégats et les valeurs des listes de filtres.
exports.getFilteredSchoolStats = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const me = await db.collection('users').doc(uid).get()
  if (!me.exists || me.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }

  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const result = await filteredSchoolStats({
    period: statsFilterText(raw.period, 10),
    cycle: statsFilterText(raw.cycle, 20),
    niveau: statsFilterText(raw.niveau),
    classe: statsFilterText(raw.classe),
    matiere: statsFilterText(raw.matiere),
  })
  logger.info('filtered school stats computed', {
    by: uid,
    period: result.applied.period,
    students: result.data.totalEleves,
    classes: result.data.totalClasses,
  })
  return result
})

// ── Drill-downs statistiques (admin only, seuls endpoints nominatifs) ────
//
// Chacun repart de `resolveScope`, la même fonction que le hero, puis de
// `computeSchoolStats` avec le même cache. Le total renvoyé est donc le chiffre
// de la tuile par construction — aucun recalcul parallèle ne peut dériver.
//
// Les logs ne portent JAMAIS d'identifiant d'élève : l'ID d'un élève est son
// code Massar. On ne journalise que l'uid appelant, le segment et des volumes.

/**
 * Liste d'élèves du périmètre, tous segments confondus.
 *
 * Un seul endpoint pour « les élèves », « à suivre », « les récidivistes »,
 * « une bande de notes » et « sous / au-dessus du seuil » : tous renvoient le
 * même objet élève dans le même périmètre. Les fusionner donne un seul gate
 * admin, une seule projection PII et un seul point d'audit.
 */
exports.getStatsStudents = onCall(async (request) => {
  const uid = await drill.requireAdmin(db, request)

  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const scopeInput = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}
  const segment = drill.STUDENT_SEGMENTS.has(raw.segment) ? raw.segment : 'all'
  const limit = drill.boundedLimit(raw.limit)
  const rawProgression = raw.progression && typeof raw.progression === 'object'
    ? raw.progression
    : {}
  const progressionSelection = segment === 'progression'
    ? {
      matiere: statsFilterText(rawProgression.matiere),
      semestre: statsFilterText(rawProgression.semestre, 2),
      fromSlot: statsFilterText(rawProgression.fromSlot),
      toSlot: statsFilterText(rawProgression.toSlot),
      outcome: statsFilterText(rawProgression.outcome, 10),
    }
    : null
  if (progressionSelection && (
    !progressionSelection.matiere
    || !['S1', 'S2'].includes(progressionSelection.semestre)
    || !progressionSelection.fromSlot
    || !progressionSelection.toSlot
    || !PROGRESSION_OUTCOMES.has(progressionSelection.outcome)
  )) {
    throw new HttpsError('invalid-argument', 'Valid progression transition required.')
  }

  const scope = await resolveScope({
    period: statsFilterText(scopeInput.period, 10),
    cycle: statsFilterText(scopeInput.cycle, 20),
    niveau: statsFilterText(scopeInput.niveau),
    classe: statsFilterText(scopeInput.classe),
    matiere: statsFilterText(scopeInput.matiere),
  })
  if (progressionSelection && (
    !drill.progressionMatchesScope(
      progressionSelection,
      scope.applied.matiere,
      scope.computeOptions.semestre,
    )
  )) {
    throw new HttpsError(
      'invalid-argument',
      'Progression transition must match the applied subject and semester.',
    )
  }

  // `includeFollowUpStudents` n'est demandé que pour le segment qui en a besoin :
  // les autres n'ont aucune raison de matérialiser une liste nominative.
  const needsFollowUp = segment === 'followup'
  const data = computeSchoolStats(scope.cacheBase, {
    ...scope.computeOptions,
    includeFollowUpStudents: needsFollowUp,
    includeStudentIndex: true,
  })
  // Dès qu'une matière est sélectionnée, `data` porte sa moyenne. Le segment
  // (bande, seuil, progression...) reste bien sélectionné avec cette moyenne,
  // mais la ligne affiche deux mesures non ambiguës : moyenne GÉNÉRALE puis
  // moyenne de la matière. Sans filtre matière, `data` est déjà global.
  const needsOverallAverage = Boolean(scope.applied.matiere)
  const overallData = needsOverallAverage
    ? computeSchoolStats({
      ...scope.cacheBase,
      notes: scope.cacheBase.followUpNotes,
    }, {
      ...scope.computeOptions,
      includeStudentIndex: true,
    })
    : data

  const averageById = new Map(
    (data.studentAveragesById || []).map((row) => [row.eleveId, row.average]),
  )
  const overallAverageById = new Map(
    (overallData.studentAveragesById || []).map((row) => [row.eleveId, row.average]),
  )
  const followUpById = new Map(
    (data.followUpStudents || []).map((row) => [row.eleveId, row]),
  )
  const recidivistIds = new Set(data.recidivistIds || [])
  const progressionById = progressionSelection
    ? gradeProgressStudents(scope.cacheBase.notes, progressionSelection)
    : new Map()

  const band = drill.GRADE_BANDS.has(raw.band) ? raw.band : null
  const side = raw.side === 'passing' ? 'passing' : 'below'

  const selected = scope.scopeEleves.filter((eleve) => {
    const average = averageById.has(eleve.id) ? averageById.get(eleve.id) : null
    if (segment === 'followup') return followUpById.has(eleve.id)
    if (segment === 'recidivists') return recidivistIds.has(eleve.id)
    if (segment === 'band') return band != null && drill.bandOf(average) === band
    if (segment === 'progression') return progressionById.has(eleve.id)
    if (segment === 'threshold') {
      if (average == null) return false
      return side === 'passing' ? average >= 10 : average < 10
    }
    return true
  })

  const docById = new Map(scope.elevesSnap.docs.map((doc) => [doc.id, doc]))
  const rows = selected
    .map((eleve) => {
      const doc = docById.get(eleve.id)
      if (!doc) return null
      const scopeAverage = averageById.has(eleve.id) ? averageById.get(eleve.id) : null
      const average = needsOverallAverage
        ? (overallAverageById.has(eleve.id) ? overallAverageById.get(eleve.id) : null)
        : scopeAverage
      const followUp = followUpById.get(eleve.id)
      const progression = progressionById.get(eleve.id)
      return {
        student: drill.projectStudent(doc, average),
        subjectAverage: needsOverallAverage ? scopeAverage : undefined,
        priority: followUp ? followUp.priority : undefined,
        score: followUp ? followUp.score : 0,
        reasons: followUp ? followUp.reasons : undefined,
        metrics: followUp ? followUp.metrics : undefined,
        progression,
      }
    })
    .filter(Boolean)

  drill.sortStudents(rows, segment)
  const { page, nextCursor } = drill.paginate(rows, raw.cursor, limit)

  logger.info('stats drilldown students', {
    by: uid,
    segment,
    period: scope.applied.period,
    returned: page.length,
    total: rows.length,
  })

  return {
    students: page.map((row) => ({
      ...row.student,
      ...(row.subjectAverage != null ? { subjectAverage: row.subjectAverage } : {}),
      ...(row.reasons ? { reasons: row.reasons, metrics: row.metrics, priority: row.priority } : {}),
      ...(row.progression ? { progression: row.progression } : {}),
    })),
    total: rows.length,
    nextCursor,
    applied: scope.applied,
  }
})

/**
 * Analyse d'assiduité — écran statistique, distinct de l'outil opérationnel
 * « absences du jour ». Même taux, même période, même périmètre que la tuile.
 */
exports.getStatsAttendanceDetails = onCall(async (request) => {
  const uid = await drill.requireAdmin(db, request)

  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const scopeInput = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}
  const tab = drill.ATTENDANCE_TABS.has(raw.tab) ? raw.tab : 'resume'
  const limit = drill.boundedLimit(raw.limit)

  const scope = await resolveScope({
    period: statsFilterText(scopeInput.period, 10),
    cycle: statsFilterText(scopeInput.cycle, 20),
    niveau: statsFilterText(scopeInput.niveau),
    classe: statsFilterText(scopeInput.classe),
    matiere: statsFilterText(scopeInput.matiere),
  })
  const data = computeSchoolStats(scope.cacheBase, scope.computeOptions)

  const docById = new Map(scope.elevesSnap.docs.map((doc) => [doc.id, doc]))
  const wanted = tab === 'retards' ? 'retard' : 'absent'
  const rows = tab === 'resume'
    ? []
    : scope.cacheBase.absences
      .filter((row) => {
        const statut = String(row.statut || '')
        return wanted === 'retard' ? (statut === 'retard' || statut === 'late') : statut === 'absent'
      })
      .map((row) => {
        const doc = docById.get(String(row.eleveId || ''))
        if (!doc) return null
        return {
          id: String(row.id || ''),
          date: String(row.date || ''),
          student: drill.projectStudent(doc, null),
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.date.localeCompare(a.date))
        || a.student.classe.localeCompare(b.student.classe, 'fr'))

  const { page, nextCursor } = drill.paginate(rows, raw.cursor, limit)

  logger.info('stats drilldown attendance', {
    by: uid,
    tab,
    period: scope.applied.period,
    returned: page.length,
  })

  return {
    presenceRate: data.presenceRate,
    attendanceCount: data.attendanceCount,
    absenceRecords: data.absenceRecords,
    lateRecords: data.lateRecords,
    trend: data.absenceTrend,
    byClass: data.classStats.map((row) => ({
      name: row.name,
      presenceRate: row.presenceRate,
      attendanceCount: row.attendanceCount,
      studentCount: row.studentCount,
    })),
    rows: page,
    total: rows.length,
    nextCursor,
    applied: scope.applied,
  }
})

/**
 * Analyse des résultats — destination unique de la tuile « Moyenne ».
 *
 * Contrairement à l'ancien écran qui relisait Firestore côté téléphone, cette
 * callable repart de `resolveScope`, exactement comme le hero. Cycle, niveau,
 * classe, matière et période ne peuvent donc plus diverger après le tap.
 */
exports.getStatsGradeDetails = onCall(async (request) => {
  const uid = await drill.requireAdmin(db, request)
  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const scopeInput = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}
  const requestedSubject = statsFilterText(raw.matiere) || statsFilterText(scopeInput.matiere)
  const requestedClass = statsFilterText(raw.classe) || statsFilterText(scopeInput.classe)
  const scope = await resolveScope({
    period: statsFilterText(scopeInput.period, 10),
    cycle: statsFilterText(scopeInput.cycle, 20),
    niveau: statsFilterText(scopeInput.niveau),
    classe: requestedClass,
    matiere: requestedSubject,
  })
  const data = computeSchoolStats(scope.cacheBase, {
    ...scope.computeOptions,
    includeStudentIndex: true,
  })

  const averageById = new Map(
    (data.studentAveragesById || []).map((row) => [row.eleveId, row.average]),
  )
  const docById = new Map(scope.elevesSnap.docs.map((doc) => [doc.id, doc]))
  const allWeakStudents = scope.scopeEleves
    .filter((eleve) => (averageById.get(eleve.id) ?? 20) < 10)
    .map((eleve) => {
      const doc = docById.get(eleve.id)
      return doc ? drill.projectStudent(doc, averageById.get(eleve.id)) : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.average - b.average)
      || a.classe.localeCompare(b.classe, 'fr')
      || a.nom.localeCompare(b.nom, 'fr'))
  // Aperçu nominatif volontairement court. Le compteur reste exhaustif et le
  // client ouvre getStatsStudents(segment=threshold) pour la liste paginée.
  const weakStudents = allWeakStudents.slice(0, 12)

  const scopedClassNames = new Set(
    scope.scopeEleves.map((row) => statsFilterText(row.classe)).filter(Boolean),
  )
  const requestedSubjectEntry = subjectEntry(requestedSubject)
  const teacherSubjectMatches = (row) => {
    if (!requestedSubject) return true
    const teacherSubject = statsFilterText(row.matiere)
    if (normalizeSubjectText(teacherSubject) === normalizeSubjectText(requestedSubject)) return true
    const teacherEntry = subjectEntry(teacherSubject)
    return requestedSubjectEntry && teacherEntry && teacherEntry.key === requestedSubjectEntry.key
  }
  const teachers = scope.cacheBase.users
    .filter((row) => String(row.role || '') === 'professeur')
    .filter(teacherSubjectMatches)
    .filter((row) => {
      // Une vue cycle/niveau ne doit jamais faire remonter les professeurs
      // d'autres classes. La projection reste strictement minimale, sans email.
      const classes = [
        statsFilterText(row.classe),
        ...(Array.isArray(row.classes) ? row.classes.map((value) => statsFilterText(value)) : []),
      ].filter(Boolean)
      if (scopedClassNames.size === 0) return false
      return classes.some((className) => scopedClassNames.has(className))
    })
    .map((row) => ({
      id: row.id,
      nom: String(row.nom || ''),
      prenom: String(row.prenom || ''),
      matiere: String(row.matiere || ''),
      classes: [
        statsFilterText(row.classe),
        ...(Array.isArray(row.classes) ? row.classes.map((value) => statsFilterText(value)) : []),
      ]
        .filter((className) => className && scopedClassNames.has(className))
        .filter((className, index, rows) => rows.indexOf(className) === index),
    }))
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))

  const progression = gradeProgress(
    scope.cacheBase.notes,
    scope.computeOptions.semestre,
  )

  logger.info('stats drilldown grades', {
    by: uid,
    period: scope.applied.period,
    subjects: data.subjectStats.length,
    classes: data.classStats.length,
    structuredSeries: progression.length,
  })

  return {
    summary: {
      average: data.avgNote,
      successRate: data.successRate,
      belowThreshold: allWeakStudents.length,
      gradedStudents: data.gradedStudents,
      notesCount: data.notesCount,
      // S1→S2 n'est pas présenté comme une « progression » : ces deux
      // agrégats ne garantissent pas une cohorte appariée et arrivent trop tard
      // pour l'intervention pédagogique. Les transitions C1→C2→C3 ci-dessous
      // sont, elles, appariées élève par élève.
      s1: null,
      s2: null,
    },
    classes: data.classStats,
    subjects: data.subjectStats,
    weakStudents,
    teachers,
    progression,
    applied: scope.applied,
  }
})

/**
 * Dossier élève 360° — l'endpoint le plus sensible du lot : un élève, toutes
 * ses métriques. Strictement admin, projection minimale, aucun log nominatif.
 */
exports.getStatsStudentFile = onCall(async (request) => {
  const uid = await drill.requireAdmin(db, request)

  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const eleveId = statsFilterText(raw.eleveId, 64)
  if (!eleveId) throw new HttpsError('invalid-argument', 'Student id required.')
  const scopeInput = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}

  const scope = await resolveScope({
    period: statsFilterText(scopeInput.period, 10),
    cycle: statsFilterText(scopeInput.cycle, 20),
    niveau: statsFilterText(scopeInput.niveau),
    classe: statsFilterText(scopeInput.classe),
    matiere: statsFilterText(scopeInput.matiere),
  })

  const inScope = scope.scopeEleves.some((row) => row.id === eleveId)
  const doc = inScope ? scope.elevesSnap.docs.find((row) => row.id === eleveId) : null
  // Un élève hors périmètre ou archivé est traité comme inexistant : on ne
  // confirme pas l'existence d'un ID qu'on refuse de servir.
  if (!doc || doc.get('active') === false) {
    throw new HttpsError('not-found', 'Student not found in scope.')
  }

  const data = computeSchoolStats(scope.cacheBase, {
    ...scope.computeOptions,
    includeStudentIndex: true,
  })
  const overallData = computeSchoolStats({
    ...scope.cacheBase,
    notes: scope.cacheBase.followUpNotes,
  }, {
    ...scope.computeOptions,
    includeFollowUpStudents: true,
    includeStudentIndex: true,
  })
  const scopeAverage = (data.studentAveragesById || []).find((row) => row.eleveId === eleveId)
  const overallAverage = (overallData.studentAveragesById || []).find((row) => row.eleveId === eleveId)
  const followUp = (overallData.followUpStudents || []).find((row) => row.eleveId === eleveId)

  // Notes de l'élève, agrégées PAR MATIÈRE. Les composantes C1/C2/C3 ne sortent
  // que par cette callable admin-only ; elles ne sont jamais ajoutées au hero.
  const bySubjectMap = new Map()
  scope.cacheBase.followUpNotes
    .filter((row) => String(row.eleveId || '') === eleveId)
    .filter((row) => !scope.computeOptions.semestre
      || String(row.semestre || '') === scope.computeOptions.semestre)
    .forEach((row) => {
      const key = statsFilterText(row.matiereLabel) || statsFilterText(row.matiere) || statsFilterText(row.subject)
      if (!key) return
      const evaluation = calculateCollegeEvaluation(row)
      const value = Number(evaluation.note)
      const bareme = Number(row.bareme) === 10 || String(row.cycle || '') === 'primaire'
        || /aep/i.test(String(row.classe || '')) ? 10 : 20
      if (!Number.isFinite(value) || value < 0 || value > bareme) return
      const value20 = value * (20 / bareme)
      const canonicalKey = evaluation.canonicalSubject || key
      const current = bySubjectMap.get(canonicalKey) || {
        matiere: canonicalKey,
        sum: 0,
        count: 0,
        semesters: [],
      }
      const comparableSteps = evaluation.progression?.comparableSteps || []
      const latestComparable = comparableSteps[comparableSteps.length - 1] || null
      current.sum += value20
      current.count++
      current.semesters.push({
        semestre: String(row.semestre || ''),
        note: Math.round(value20 * 10) / 10,
        status: evaluation.policyVersion
          ? (evaluation.complete ? 'complete' : 'provisional')
          : 'legacy',
        completionRate: evaluation.completionRate,
        formula: evaluation.formula,
        integratedWeight: evaluation.integratedWeight,
        formulaLabel: evaluation.formulaLabel,
        controls: (evaluation.controls || []).map((control) => ({
          slot: control.slot,
          label: control.label,
          note: Math.round((control.note * (20 / bareme)) * 10) / 10,
        })),
        integratedActivitiesNote: evaluation.integratedActivitiesNote == null
          ? null
          : Math.round((evaluation.integratedActivitiesNote * (20 / bareme)) * 10) / 10,
        latestDelta: evaluation.progression?.latestDelta == null
          ? null
          : Math.round((evaluation.progression.latestDelta * (20 / bareme)) * 10) / 10,
        latestFromLabel: latestComparable?.fromLabel || null,
        latestToLabel: latestComparable?.toLabel || null,
      })
      bySubjectMap.set(canonicalKey, current)
    })
  const bySubject = [...bySubjectMap.values()]
    .map((row) => ({
      matiere: row.matiere,
      average: Math.round((row.sum / row.count) * 10) / 10,
      notesCount: row.count,
      semesters: row.semesters.sort((a, b) => a.semestre.localeCompare(b.semestre)),
    }))
    .sort((a, b) => a.average - b.average)

  const absencesOfStudent = scope.cacheBase.absences
    .filter((row) => String(row.eleveId || '') === eleveId)
  const absentDates = new Set(
    absencesOfStudent.filter((row) => String(row.statut) === 'absent').map((row) => String(row.date)),
  )
  const observedDates = new Set(absencesOfStudent.map((row) => String(row.date)).filter(Boolean))

  // Comportement (mérites + avertissements) — informatif, borné à la période.
  // Requête par eleveId seul (index simple) puis filtre date en mémoire : un
  // élève a peu de comportements, pas besoin d'index composite.
  const behaviorSnap = await db.collection('comportements').where('eleveId', '==', eleveId).get()
  const behavior = behaviorSnap.docs
    .map((d) => d.data())
    .filter((row) => {
      const date = statsFilterText(row.date)
      return date >= scope.range.from && date <= scope.range.to
    })
    .map((row) => ({
      kind: statsFilterText(row.kind),
      reason: statsFilterText(row.reason),
      comment: statsFilterText(row.comment, 300),
      date: statsFilterText(row.date),
      teacher: statsFilterText(row.teacherNom),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  logger.info('stats drilldown student file', {
    by: uid,
    period: scope.applied.period,
    subjects: bySubject.length,
    flagged: followUp ? followUp.reasons.length : 0,
    behavior: behavior.length,
  })

  return {
    student: {
      ...drill.projectStudent(doc, overallAverage ? overallAverage.average : null),
      ...(scope.applied.matiere && scopeAverage
        ? { subjectAverage: scopeAverage.average }
        : {}),
    },
    bySubject,
    attendance: {
      absentDays: absentDates.size,
      observedDays: observedDates.size,
      lateCount: absencesOfStudent.filter((row) => {
        const statut = String(row.statut)
        return statut === 'retard' || statut === 'late'
      }).length,
    },
    followUp: followUp
      ? { reasons: followUp.reasons, metrics: followUp.metrics, priority: followUp.priority }
      : null,
    behavior,
    applied: scope.applied,
  }
})

/**
 * Devoirs du perimetre — 4e drill-down.
 *
 * Meme perimetre et meme bornage que la tuile : `resolveScope` a deja reduit
 * les devoirs a ceux dont l'echeance tombe dans la periode ET dont la classe
 * appartient au perimetre. Le compteur affiche et la liste renvoyee sortent
 * donc du meme tableau, pas de deux requetes qui pourraient diverger.
 *
 * Les soumissions sont deja chargees par lots de 30 sur `homeworkId` : on ne
 * relit rien, on agrege ce que le perimetre a produit.
 */
exports.getStatsHomework = onCall(async (request) => {
  const uid = await drill.requireAdmin(db, request)

  const raw = request.data && typeof request.data === 'object' ? request.data : {}
  const scopeInput = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}
  const limit = drill.boundedLimit(raw.limit)

  const scope = await resolveScope({
    period: statsFilterText(scopeInput.period, 10),
    cycle: statsFilterText(scopeInput.cycle, 20),
    niveau: statsFilterText(scopeInput.niveau),
    classe: statsFilterText(scopeInput.classe),
    matiere: statsFilterText(scopeInput.matiere),
  })

  // Soumissions regroupees par devoir pour compter les rendus sans jamais
  // exposer QUI a rendu : cet ecran parle de devoirs, pas d'eleves.
  const submittedByHomework = new Map()
  scope.cacheBase.homeworkSubmissions.forEach((row) => {
    const homeworkId = statsFilterText(row.homeworkId)
    if (!homeworkId) return
    const status = String(row.status || '').toLowerCase()
    const current = submittedByHomework.get(homeworkId) || { total: 0, done: 0 }
    current.total++
    if (status === 'submitted' || status === 'submitted_late' || status === 'graded') current.done++
    submittedByHomework.set(homeworkId, current)
  })

  const rows = scope.cacheBase.devoirs
    .map((devoir) => {
      const counts = submittedByHomework.get(devoir.id) || { total: 0, done: 0 }
      return {
        id: devoir.id,
        titre: String(devoir.titre || devoir.title || ''),
        classe: statsFilterText(devoir.classeId) || statsFilterText(devoir.classe),
        matiere: statsFilterText(devoir.matiereLabel) || statsFilterText(devoir.matiere),
        dateLimite: statsFilterText(devoir.dateLimite),
        submissions: counts.total,
        submitted: counts.done,
      }
    })
    // Tri deterministe : echeance la plus proche d'abord, puis id pour departager,
    // sinon deux pages successives pourraient sauter une ligne.
    .sort((a, b) => a.dateLimite.localeCompare(b.dateLimite) || a.id.localeCompare(b.id))

  const { page, nextCursor } = drill.paginate(rows, raw.cursor, limit)

  logger.info('stats drilldown homework', {
    by: uid,
    period: scope.applied.period,
    returned: page.length,
    total: rows.length,
  })

  return {
    homework: page,
    total: rows.length,
    nextCursor,
    applied: scope.applied,
  }
})

// ── Transport scolaire : transitions d'état transactionnelles ────────────
// Les clients Firestore peuvent modifier le retard/ETA, mais jamais le statut
// d'une tournée. Cette callable relit identité, assignation et passagers dans
// UNE transaction, puis pose elle-même les horodatages serveur.
exports.updateTransportTripStatus = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  try {
    return await transitionTransportTrip(db, {
      uid,
      tripId: request.data && request.data.tripId,
      nextStatus: request.data && request.data.nextStatus,
    })
  } catch (error) {
    if (error instanceof TransportTransitionError) {
      throw new HttpsError(error.code, error.message)
    }
    logger.error('transport trip transition failed', {
      code: error && error.code ? String(error.code) : 'unknown',
    })
    throw new HttpsError('internal', 'Trip transition failed.')
  }
})

exports.reportTransportTripDelay = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  try {
    return await reportTransportTripDelay(db, {
      uid,
      tripId: request.data && request.data.tripId,
      delayMinutes: request.data && request.data.delayMinutes,
      reason: request.data && request.data.reason,
    })
  } catch (error) {
    if (error instanceof TransportTransitionError) {
      throw new HttpsError(error.code, error.message)
    }
    logger.error('transport delay report failed', {
      code: error && error.code ? String(error.code) : 'unknown',
    })
    throw new HttpsError('internal', 'Delay report failed.')
  }
})

// ── Prière : départ autorisé uniquement pendant le cours du professeur ──
// Le client ne fournit que la classe. Le serveur relit rôle, classes et EDT,
// puis dérive lui-même la date Africa/Casablanca et les horodatages.
exports.startPrayerClassSession = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  try {
    return await startPrayerClassSessionTransaction(db, {
      uid,
      classe: request.data && request.data.classe,
    })
  } catch (error) {
    if (error instanceof PrayerClassSessionError) {
      throw new HttpsError(error.code, error.message)
    }
    logger.error('prayer class session start failed', {
      code: error && error.code ? String(error.code) : 'unknown',
    })
    throw new HttpsError('internal', 'Prayer class session start failed.')
  }
})

// ─────────────────────────────────────────────────────────────────────────
// Reset de mot de passe brandé — contourne la page générique Firebase.
//
// Le project est bloqué par Google pour personnaliser le "action URL"
// (Console + API renvoient EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED, testé et
// confirmé). Contournement : on génère le lien nous-mêmes via Admin SDK
// (generatePasswordResetLink), on en extrait le oobCode, et on reconstruit
// une URL vers NOTRE page (mojammaa-sgs.web.app/reset-password — même
// mécanisme confirmPasswordReset/verifyPasswordResetCode, seul le domaine
// change), puis on envoie nous-mêmes l'email (brandé) via Gmail au lieu de
// laisser Firebase envoyer son email générique par défaut.
// ─────────────────────────────────────────────────────────────────────────
const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const SENDER = 'Mojammaa Al Maarifa <contact@mojammaa.com>'
const RESET_PAGE_URL = 'https://mojammaa.com/reset-password'
const RESET_COOLDOWN_MS = 60 * 1000
// Plafond global glissant (durci 2026-07-12) : borne le nombre TOTAL d'envois
// tous emails confondus, pour qu'un attaquant ne puisse pas contourner le
// cooldown par-email en faisant tourner des adresses différentes et vider le
// quota Resend / spammer. 120/h couvre très largement l'usage légitime d'une
// école (~136 familles, resets initiés un par un depuis l'écran de connexion).
const RESET_GLOBAL_WINDOW_MS = 60 * 60 * 1000
const RESET_GLOBAL_MAX = 120

function brandedResetEmailHtml(link) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1a1a1a">
    <h2 style="margin:0 0 4px">Mojammaa Al Maarifa</h2>
    <p style="color:#666;margin:0 0 20px">Préscolaire · Primaire · Collège</p>
    <p>Bonjour,</p>
    <p>Une demande de réinitialisation de mot de passe a été faite pour votre compte
       <b>Mojammaa Connect</b>. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${link}" style="background:#1D3557;color:#fff;text-decoration:none;
         padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">
        Réinitialiser mon mot de passe
      </a>
    </p>
    <p style="font-size:13px;color:#666">Ce lien est à usage unique et expire après un délai.
       Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
    <p style="font-size:12px;word-break:break-all;color:#1D3557">${link}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p dir="rtl" style="font-size:13px;color:#444">
      مرحباً، تم تلقي طلب لإعادة تعيين كلمة مرور حسابكم على تطبيق <b>Mojammaa Connect</b>.
      اضغطوا على الزر أعلاه لتعيين كلمة مرور جديدة. إذا لم تكونوا أنتم من طلب ذلك، تجاهلوا هذا البريد.
    </p>
  </div>`
}

exports.sendBrandedPasswordReset = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    const email = String((request.data && request.data.email) || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Email invalide.')
    }

    // Anti-spam TRANSACTIONNEL (durci 2026-07-12). L'ancien schéma
    // get → (send) → set laissait passer des requêtes PARALLÈLES (toutes
    // lisaient "pas de cooldown" avant que la première n'écrive) et ne bornait
    // rien globalement (attaquant cyclant les emails → quota Resend vidé).
    //
    // 1) Cooldown PAR EMAIL réservé atomiquement AVANT tout envoi : deux appels
    //    concurrents pour le même email ⇒ un seul gagne la transaction
    //    (anti email-bomb d'une victime). Fail-closed : si la suite échoue, ce
    //    compte est juste bloqué 1 min.
    const claimedEmail = await claimEmailSlot(db, email, RESET_COOLDOWN_MS)
    if (!claimedEmail) {
      // Ne révèle rien : même réponse que le cas "succès" côté client.
      logger.info('Password reset throttled (per-email cooldown)', { email })
      return { ok: true }
    }

    const auth = getAuth()
    let link
    try {
      link = await auth.generatePasswordResetLink(email)
    } catch (err) {
      // Email inconnu → ne pas révéler que le compte n'existe pas (même
      // comportement que sendPasswordResetEmail avec emailPrivacyConfig).
      // Note : le Admin SDK renvoie 'auth/internal-error' (pas
      // 'auth/user-not-found') pour ce cas précis — vérifié en local.
      // On avale aussi ce cas générique : le pire scénario côté UX est un
      // silence (comme un vrai email inconnu), jamais une fuite d'info.
      if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/internal-error')) {
        logger.info('Password reset link generation failed (treated as unknown email)', { email, code: err.code })
        return { ok: true }
      }
      logger.error('generatePasswordResetLink failed', { email, error: String(err) })
      throw new HttpsError('internal', "Erreur lors de la génération du lien.")
    }

    // 2) Plafond GLOBAL glissant — décompté ICI (email valide connu), donc des
    //    sondes d'emails inconnus ne peuvent PAS épuiser le budget et bloquer
    //    les resets légitimes. Borne le quota Resend contre un spam de masse.
    const underGlobalCap = await claimGlobalSlot(db, RESET_GLOBAL_WINDOW_MS, RESET_GLOBAL_MAX)
    if (!underGlobalCap) {
      logger.warn('Password reset global cap hit — send suppressed', { email })
      return { ok: true }
    }

    const oobCode = new URL(link).searchParams.get('oobCode')
    const brandedLink = `${RESET_PAGE_URL}?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER,
        to: [email],
        subject: 'Réinitialisation de mot de passe — Mojammaa Al Maarifa',
        html: brandedResetEmailHtml(brandedLink),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('Resend send failed', { email, status: res.status, body })
      throw new HttpsError('internal', "Erreur lors de l'envoi de l'email.")
    }
    // Cooldown déjà réservé dans la transaction ci-dessus (avant l'envoi).
    logger.info('Branded password reset email sent', { email })
    return { ok: true }
  },
)

// ── Localisation de connexion (ville/pays) ────────────────────────────────
// Le client ne peut pas connaître/prouver sa propre IP publique, et
// firestore.rules interdit d'écrire lastLoginLocation depuis le client (seul
// l'Admin SDK ici le peut) — sinon un utilisateur pourrait se falsifier une
// localisation. On lit l'IP réelle côté serveur (rawRequest.ip, résolue par
// le proxy de confiance Cloud Functions) et on la résout via un service tiers
// (ipapi.co) : best effort, ne doit jamais faire échouer la connexion.
function isPrivateIp(ip) {
  if (!ip) return true
  const v = ip.replace('::ffff:', '')
  return v === '127.0.0.1' || v === '::1'
    || v.startsWith('10.') || v.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(v)
}

exports.recordLoginLocation = onCall(async (request) => {
  const uid = request.auth && request.auth.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')

  const ip = request.rawRequest && request.rawRequest.ip
  if (isPrivateIp(ip)) return { ok: false }

  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`ipapi.co HTTP ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.reason || 'ipapi.co error')

    await db.collection('users').doc(uid).set({
      lastLoginLocation: {
        city: data.city || null,
        country: data.country_name || null,
        countryCode: data.country_code || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true })
    return { ok: true }
  } catch (error) {
    logger.warn('recordLoginLocation failed', { uid, error: String(error) })
    return { ok: false }
  }
})
