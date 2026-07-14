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

  // Champs qui influencent réellement computeClassStats() (cf. classStats.js) :
  // le reste (eleveNom, codeMassar, demo, importedBy, importedAt, updatedAt…)
  // n'a aucun effet sur l'agrégat — ignorer ces écritures évite de marquer
  // "dirty" pour rien (ex: un script qui ne fait que retoucher updatedAt).
  const pick = (n) => (n ? JSON.stringify([
    n.note, n.controles, n.bareme, n.cycle, n.academicYear, n.classe, n.semestre,
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
  logger.info('period fields stamped', { path: snap.ref.path, ...patch })
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
