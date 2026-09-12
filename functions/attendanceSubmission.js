const { createHash } = require('node:crypto')
const { attendanceVersion, lessonKey, sessionCode } = require('./lib/attendanceProtocol')
const fail = (code, message) => { throw Object.assign(new Error(message || code), { code }) }
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function validateLesson(uid, input, user, schedule, now) {
  if (!uid) fail('unauthenticated')
  if (user?.role !== 'professeur') fail('permission-denied')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date || '') || typeof input.lessonKey !== 'string') fail('invalid-argument')
  const date = new Date(`${input.date}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) fail('invalid-argument')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]))
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

async function loadAttendance(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  const [user, schedule] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`schedules/${uid}`).get()])
  const { slot, seance } = validateLesson(uid, input, user.data(), schedule.data(), now)
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
      const values = {
        eleveId: row.id, eleveNom: child.get('nom') || '', elevePrenom: child.get('prenom') || '',
        classe: slot.classe, date: input.date, seance, statut: row.status, professorId: uid,
        createdAt: now, updatedAt: now, attendanceVersion: input.operationId,
        academicYear: `${start}-${start + 1}`, semestre: month >= 9 || month <= 1 ? 'S1' : 'S2', monthKey: input.date.slice(0, 7),
        ...(row.status === 'absent' && declaration ? { justified: true, raison: declaration.get('reason') || '' } : {}),
      }
      versions[row.id] = attendanceVersion({ ...records[i].data(), ...values })
      tx.set(refs[i], values, { merge: true })
      if (row.status === 'absent' && declaration?.get('status') === 'pending') {
        tx.update(declaration.ref, { status: 'approved', decidedBy: uid, decidedAt: now })
      }
    })
    tx.create(operationRef, { uid, fingerprint, createdAt: now, count: input.rows.length, versions })
    return { saved: true, replayed: false, versions }
  })
}
module.exports = { loadAttendance, submitAttendance, validateLesson }
