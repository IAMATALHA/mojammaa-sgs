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
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const logger = require('firebase-functions/logger')
const { computeClassStats, statsDocId } = require('./classStats')
const { computeSchoolStats } = require('./schoolStats')
const { buildSlotDocs } = require('./emploiDuTempsSync')

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
  } else if (data.toType === 'teachers') {
    const snap = await db.collection('users').where('role', '==', 'professeur').get()
    snap.forEach((d) => uids.add(d.id))
  }

  // Legacy `toId` string format
  if (typeof data.toId === 'string') {
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

  const uids = await resolveRecipientUids(data)
  if (uids.length === 0) {
    await snap.ref.set({ push: { sent: 0, recipients: 0, at: new Date() } }, { merge: true })
    return
  }

  const { tokens, invalid: invalidTokens } = await tokensForUids(uids)
  const title = (data.priority === 'urgent' ? '🚨 ' : '') + (data.subject || data.subjectAr || 'Nouveau message')
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
    data: { messageId: event.params.messageId, type: data.category || 'announcement' },
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

// ── classStats : agrégats anonymes par (classe, semestre) ──────────────────
//
// Pourquoi : l'écran Notes parent affiche moyenne de classe + rang. Avant, il
// lisait TOUTES les notes brutes de la classe (trou de confidentialité — un
// parent voyait les notes des autres enfants). Ce trigger maintient un agrégat
// anonyme dans classStats/{classe}_{semestre} ; le client ne lit plus que ça,
// ce qui permettra de durcir la règle de lecture sur `notes`.

/** Recalcule (full recompute, idempotent) l'agrégat d'une (classe, semestre). */
async function refreshClassStats(classe, semestre) {
  if (!classe || !semestre) return
  const snap = await db
    .collection('notes')
    .where('classe', '==', classe)
    .where('semestre', '==', semestre)
    .get()
  const stats = computeClassStats(snap.docs.map((d) => d.data()))
  const ref = db.collection('classStats').doc(statsDocId(classe, semestre))
  if (stats.notesCount === 0) {
    await ref.delete()
    return
  }
  await ref.set({ classe, semestre, ...stats, updatedAt: new Date() })
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

  // Offboarding (#2b) : supprimer users/{uid} ne révoque PAS la session Firebase
  // Auth — le mot de passe resterait valide et le compte pourrait se reconnecter.
  // À la suppression du doc, on DÉSACTIVE le compte Auth (révocation immédiate du
  // credential). `disabled` plutôt que delete : réversible et auditable, et il
  // suffit à bloquer toute connexion. Le garde onSnapshot côté client déconnecte
  // déjà en cours de session ; ceci ferme la reconnexion ultérieure.
  if (before && !after) {
    const uid = event.params.uid
    try {
      await getAuth().updateUser(uid, { disabled: true })
      logger.info('auth account disabled after user doc deletion', { uid })
    } catch (e) {
      // Compte Auth déjà absent (supprimé séparément) : rien à révoquer.
      if (e?.code === 'auth/user-not-found') logger.info('no auth account to disable', { uid })
      else logger.error('failed to disable auth account', { uid, error: e?.message })
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

  // Une note déplacée de classe/semestre impacte DEUX agrégats (ancien + nouveau).
  const pairs = new Map()
  for (const d of [before, after]) {
    if (d && d.classe && d.semestre) pairs.set(`${d.classe}|${d.semestre}`, [d.classe, d.semestre])
  }
  for (const [classe, semestre] of pairs.values()) {
    await refreshClassStats(classe, semestre)
    logger.info('classStats refreshed', { classe, semestre })
  }
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
// que le client lit en une lecture. Recalcul planifié (toutes les 30 min) +
// callable à la demande (pull-to-refresh / amorçage initial).

/** Recalcule l'agrégat complet depuis les 5 collections et l'écrit (Admin SDK). */
async function refreshSchoolStats() {
  const [eleves, users, notes, absences, devoirs] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('users').get(),
    db.collection('notes').get(),
    db.collection('absences').get(),
    db.collection('devoirs').get(),
  ])
  const toRows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const summary = computeSchoolStats({
    eleves: toRows(eleves),
    users: toRows(users),
    notes: toRows(notes),
    absences: toRows(absences),
    devoirs: toRows(devoirs),
  })
  await db.collection('stats').doc('summary').set({ ...summary, updatedAt: new Date() })
  return summary
}

exports.aggregateSchoolStats = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'Africa/Casablanca' },
  async () => {
    const s = await refreshSchoolStats()
    logger.info('stats/summary refreshed (scheduled)', { eleves: s.totalEleves, classes: s.totalClasses })
  },
)

// Recalcul à la demande — réservé aux admins (pull-to-refresh + amorçage).
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
