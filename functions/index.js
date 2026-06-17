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
const { getFirestore, FieldPath } = require('firebase-admin/firestore')
const logger = require('firebase-functions/logger')
const { computeClassStats, statsDocId } = require('./classStats')
const { computeSchoolStats } = require('./schoolStats')

initializeApp()
const db = getFirestore()

// Firestore DB is in eur3 → colocate the function in Europe to match the
// existing deployment and avoid cross-region hops.
setGlobalOptions({ maxInstances: 10, region: 'europe-west1' })

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

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
  const tokens = []
  // getAll is efficient and avoids the `in`-query 10-item limit.
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((u) => db.collection('users').doc(u))
    const docs = await db.getAll(...refs)
    docs.forEach((d) => {
      const tok = d.exists ? d.get('expoPushToken') : null
      if (typeof tok === 'string' && tok.startsWith('ExponentPushToken')) tokens.push(tok)
    })
  }
  return tokens
}

/** Send to the Expo Push API in batches of 100. Returns count accepted. */
async function sendExpoPush(messages) {
  let sent = 0
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })
      const json = await res.json().catch(() => null)
      if (res.ok) sent += chunk.length
      else logger.warn('Expo push non-OK', { status: res.status, json })
    } catch (e) {
      logger.error('Expo push failed', e)
    }
  }
  return sent
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

  const tokens = await tokensForUids(uids)
  const title = (data.priority === 'urgent' ? '🚨 ' : '') + (data.subject || '')
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: data.body || '',
    data: { messageId: event.params.messageId, type: data.category || 'announcement' },
  }))

  const sent = await sendExpoPush(messages)
  logger.info('push processed', { messageId: event.params.messageId, recipients: uids.length, tokens: tokens.length, sent })

  // Record outcome for observability (does not re-trigger onCreate).
  await snap.ref.set({ push: { sent, recipients: uids.length, tokens: tokens.length, at: new Date() } }, { merge: true })
})

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
