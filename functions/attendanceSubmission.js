const { createHash } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')
const { attendanceVersion, lessonKey, sessionCode } = require('./lib/attendanceProtocol')
const { moroccoParts } = require('./lib/moroccoTime')
const fail = (code, message) => { throw Object.assign(new Error(message || code), { code }) }
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function validateLesson(uid, input, user, schedule, now) {
  if (!uid) fail('unauthenticated')
  if (user?.role !== 'professeur') fail('permission-denied')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date || '') || typeof input.lessonKey !== 'string') fail('invalid-argument')
  const date = new Date(`${input.date}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) fail('invalid-argument')
  const values = moroccoParts(now)
  const today = `${values.year}-${values.month}-${values.day}`
  if (input.date > today || now.getTime() - date.getTime() > 7 * 86400_000) fail('failed-precondition', 'attendance-expired')
  const matches = (schedule?.weeklySlots || []).filter(slot => lessonKey(slot) === input.lessonKey)
  const slot = matches.length === 1 ? matches[0] : null
  const classes = Array.isArray(user.classes) ? user.classes : []
  if (!slot || ![...classes, user.classe].includes(slot.classe)
    || slot.day !== dayNames[date.getUTCDay()] || !sessionCode(slot)) fail('permission-denied', 'attendance-scope-changed')
  if (input.date === today && `${values.hour}:${values.minute}` < slot.startTime) fail('failed-precondition', 'attendance-not-started')
  return { slot, seance: sessionCode(slot) }
}

// Journée marquée « cours annulés » dans le calendrier de l'école : aucun
// appel ne peut y être chargé ni enregistré (audit 2026-09-28, F10). Vérifié
// APRÈS validateLesson : un prof hors classe reste refusé pour ce motif-là.
function assertLessonDayOpen(calendar) {
  if (calendar.exists && calendar.get('annuleCours') === true) fail('failed-precondition', 'attendance-day-cancelled')
}

async function loadAttendance(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  const [user, schedule] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`schedules/${uid}`).get()])
  const { slot, seance } = validateLesson(uid, input, user.data(), schedule.data(), now)
  assertLessonDayOpen(await db.doc(`joursScolaires/${input.date}`).get())
  const [children, records] = await Promise.all([
    db.collection('eleves').where('classe', '==', slot.classe).get(),
    db.collection('absences').where('classe', '==', slot.classe).where('date', '==', input.date).where('seance', '==', seance).get(),
  ])
  const byChild = new Map(records.docs.map(d => [d.get('eleveId'), d.data()]))
  return { slot, seance, students: children.docs.filter(d => d.get('active') !== false).map(d => {
    const record = byChild.get(d.id)
    return { id: d.id, nom: d.get('nom') || '', prenom: d.get('prenom') || '',
      status: record?.statut || 'present', baseVersion: attendanceVersion(record) }
  }).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')) }
}

async function submitAttendance(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input?.operationId || '') || !Array.isArray(input.rows)
    || !input.rows.length || input.rows.length > 150
    || input.rows.some(r => !r || typeof r.id !== 'string' || !r.id || r.id.includes('/')
      || !['present', 'absent', 'retard'].includes(r.status) || typeof r.baseVersion !== 'string')
    || new Set(input.rows.map(r => r.id)).size !== input.rows.length) fail('invalid-argument')
  const operationRef = db.collection('attendanceOperations').doc(`${uid}_${input.operationId}`)
  const fingerprint = createHash('sha256').update(JSON.stringify({ date: input.date, lessonKey: input.lessonKey, rows: input.rows })).digest('hex')
  return db.runTransaction(async tx => {
    const [user, schedule, previous] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`schedules/${uid}`)), tx.get(operationRef),
    ])
    // Authorization is rechecked even when replaying a completed operation.
    if (user.get('role') !== 'professeur') fail('permission-denied')
    if (previous.exists) {
      if (previous.get('fingerprint') !== fingerprint) fail('already-exists', 'operation-payload-changed')
      return { saved: true, replayed: true, versions: previous.get('versions') }
    }
    const { slot, seance } = validateLesson(uid, input, user.data(), schedule.data(), now)
    // Relu dans la transaction : un brouillon hors ligne préparé avant
    // l'annulation de la journée est refusé lui aussi.
    assertLessonDayOpen(await tx.get(db.doc(`joursScolaires/${input.date}`)))
    const children = await tx.get(db.collection('eleves').where('classe', '==', slot.classe))
    const active = children.docs.filter(d => d.get('active') !== false)
    if (active.length !== input.rows.length || active.some(d => !input.rows.some(r => r.id === d.id))) fail('failed-precondition', 'attendance-roster-changed')
    const refs = input.rows.map(r => db.collection('absences').doc(`${r.id}_${input.date}_${seance}`))
    const records = await tx.getAll(...refs)
    if (records.some((r, i) => attendanceVersion(r.exists ? r.data() : null) !== input.rows[i].baseVersion)) {
      fail('failed-precondition', 'attendance-conflict')
    }
    const requests = await tx.get(db.collection('absenceRequests').where('classe', '==', slot.classe).where('date', '==', input.date))
    const year = Number(input.date.slice(0, 4)), month = Number(input.date.slice(5, 7))
    const start = month >= 9 ? year : year - 1
    const versions = {}
    input.rows.forEach((row, i) => {
      const child = active.find(d => d.id === row.id)
      const declaration = requests.docs.find(d => d.get('eleveId') === row.id && d.get('status') !== 'declined')
      const justifiedBy = row.status === 'absent' ? declaration : null
      const values = {
        eleveId: row.id, eleveNom: child.get('nom') || '', elevePrenom: child.get('prenom') || '',
        classe: slot.classe, date: input.date, seance, statut: row.status, professorId: uid,
        createdAt: now, updatedAt: now, attendanceVersion: input.operationId,
        academicYear: `${start}-${start + 1}`, semestre: month >= 9 || month <= 1 ? 'S1' : 'S2', monthKey: input.date.slice(0, 7),
        ...(justifiedBy ? { justified: true, raison: justifiedBy.get('reason') || '', justificationRequestId: justifiedBy.id } : {}),
      }
      // Seule une déclaration active justifie une absence. Sans elle (refusée,
      // retirée, élève présent ou en retard), l'ancienne justification est
      // effacée : l'écriture fusionnée la conservait (audit 2026-09-28, F11).
      const { justified: _j, raison: _r, justificationRequestId: _k, ...unjustified } = records[i].data() || {}
      versions[row.id] = attendanceVersion(justifiedBy ? { ...records[i].data(), ...values } : { ...unjustified, ...values })
      tx.set(refs[i], justifiedBy ? values : { ...values, ...JUSTIFICATION_CLEARED }, { merge: true })
      if (row.status === 'absent' && declaration?.get('status') === 'pending') {
        tx.update(declaration.ref, { status: 'approved', decidedBy: uid, decidedAt: now })
      }
    })
    tx.create(operationRef, { uid, fingerprint, createdAt: now, count: input.rows.length, versions })
    return { saved: true, replayed: false, versions }
  })
}
const JUSTIFICATION_CLEARED = Object.freeze({
  justified: FieldValue.delete(), raison: FieldValue.delete(), justificationRequestId: FieldValue.delete(),
})

/**
 * Une déclaration refusée ou retirée ne justifie plus rien : retire la
 * justification automatique des absences de l'élève ce jour-là, sauf si une
 * autre déclaration active la couvre encore (F11). Appelé par le trigger
 * absenceRequests ; la justification ne vient que des déclarations.
 */
async function clearStaleJustification(db, { eleveId, date }, now = new Date()) {
  if (typeof eleveId !== 'string' || !eleveId || eleveId.includes('/')
    || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0
  return db.runTransaction(async tx => {
    const [requests, records] = await Promise.all([
      tx.get(db.collection('absenceRequests').where('eleveId', '==', eleveId).where('date', '==', date)),
      tx.get(db.collection('absences').where('eleveId', '==', eleveId).where('date', '==', date)),
    ])
    if (requests.docs.some(d => d.get('status') !== 'declined')) return 0
    const stale = records.docs.filter(d => d.get('justified') === true)
    stale.forEach(d => tx.update(d.ref, { ...JUSTIFICATION_CLEARED, updatedAt: now }))
    return stale.length
  })
}

module.exports = { loadAttendance, submitAttendance, validateLesson, clearStaleJustification }
