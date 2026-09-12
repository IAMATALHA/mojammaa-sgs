const { lessonKey, sessionCode } = require('./lib/attendanceProtocol')
const fail = code => { throw Object.assign(new Error(code), { code }) }
const chunks = (list, size = 10) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))
const currentClasses = user => [...new Set([...(user.classes || []), user.classe].filter(Boolean))]

async function getDashboardActions(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  const user = (await db.doc(`users/${uid}`).get()).data(), mode = input?.mode
  if (!user || !['parent', 'teacher', 'admin'].includes(mode)
    || (mode === 'teacher' && user.role !== 'professeur') || (mode === 'admin' && user.role !== 'admin')) fail('permission-denied')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`, clock = `${parts.hour}:${parts.minute}`
  const yearStart = `${Number(parts.month) >= 9 ? parts.year : Number(parts.year) - 1}-09-01`
  const actions = []
  let permittedChildren = null
  if (mode === 'parent') {
    const children = (await db.collection('eleves').where('parentUid', '==', uid).get()).docs.filter(doc => doc.get('active') !== false)
    permittedChildren = new Set(children.map(doc => doc.id))
    let missingHomework = 0, unjustified = 0
    await Promise.all(chunks(children).map(async group => {
      const records = await db.collection('absences').where('eleveId', 'in', group.map(doc => doc.id))
        .where('date', '>=', yearStart).where('date', '<=', today).get()
      unjustified += records.docs.filter(doc => doc.get('statut') === 'absent' && !doc.get('justified')).length
    }))
    const classes = [...new Set(children.map(doc => doc.get('classe')).filter(Boolean))]
    await Promise.all(chunks(classes).map(async group => {
      const homework = await db.collection('devoirs').where('classeId', 'in', group).where('dateLimite', '>=', yearStart).where('dateLimite', '<=', today).get()
      const pairs = homework.docs.flatMap(work => children.filter(child => child.get('classe') === work.get('classeId')).map(child => ({ work, child })))
      for (const batch of chunks(pairs, 100)) {
        const submissions = await db.getAll(...batch.map(({ work, child }) => db.doc(`homeworkSubmissions/${work.id}_${child.id}`)))
        missingHomework += submissions.filter(doc => !doc.exists || ['pending', 'not_submitted', 'not_done'].includes(doc.get('status'))).length
      }
    }))
    if (missingHomework) actions.push({ kind: 'homework', count: missingHomework })
    if (unjustified) actions.push({ kind: 'absences', count: unjustified })
  }
  if (mode === 'teacher') {
    const classes = currentClasses(user)
    const [schedule, calendar] = await Promise.all([db.doc(`schedules/${uid}`).get(), db.doc(`joursScolaires/${today}`).get()])
    const children = [], records = []
    let reviews = 0
    await Promise.all(chunks(classes).map(async group => {
      const [roster, attendance, pending] = await Promise.all([
        db.collection('eleves').where('classe', 'in', group).get(),
        db.collection('absences').where('classe', 'in', group).where('date', '==', today).get(),
        db.collection('homeworkSubmissions').where('teacherId', '==', uid).where('classeId', 'in', group).where('status', 'in', ['submitted', 'submitted_late']).count().get(),
      ])
      children.push(...roster.docs.filter(doc => doc.get('active') !== false))
      records.push(...attendance.docs.map(doc => doc.data()))
      reviews += pending.data().count
    }))
    const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${today}T12:00:00Z`).getUTCDay()]
    if (!calendar.get('annuleCours')) {
      for (const slot of schedule.get('weeklySlots') || []) {
        if (slot.day !== day || slot.startTime > clock || !classes.includes(slot.classe)) continue
        const seance = sessionCode(slot)
        if (!seance) continue
        const expected = children.filter(child => child.get('classe') === slot.classe)
        const marked = new Set(records.filter(row => row.classe === slot.classe && row.seance === seance && ['present', 'absent', 'retard'].includes(row.statut)).map(row => row.eleveId))
        const count = expected.filter(child => !marked.has(child.id)).length
        if (count) actions.push({ kind: 'attendance', count, classe: slot.classe, seance, lessonKey: lessonKey(slot), date: today })
      }
    }
    if (reviews) actions.push({ kind: 'reviews', count: reviews })
  }
  if (mode === 'admin') {
    const issues = await db.collection('messages').where('push.status', 'in', ['no_recipient', 'no_device', 'failed', 'partial_failure', 'blocked', 'retrying']).count().get()
    if (issues.data().count) actions.push({ kind: 'delivery', count: issues.data().count })
  }
  let appointments = db.collection('appointments').where('open', '==', true)
  if (mode === 'parent') appointments = appointments.where('parentUid', '==', uid)
  if (mode === 'teacher') appointments = appointments.where('teacherId', '==', uid).where('teacherVisible', '==', true)
  let meetings = (await appointments.get()).docs
  if (mode === 'parent') meetings = meetings.filter(doc => permittedChildren.has(doc.get('eleveId')))
  if (mode === 'teacher' && meetings.length) {
    const kids = await db.getAll(...[...new Set(meetings.map(doc => doc.get('eleveId')))].map(id => db.doc(`eleves/${id}`)))
    const allowed = new Set(kids.filter(child => child.exists && child.get('active') !== false && currentClasses(user).includes(child.get('classe'))).map(child => child.id))
    meetings = meetings.filter(doc => allowed.has(doc.get('eleveId')))
  }
  const needed = meetings.filter(doc => mode === 'admin' ? doc.get('status') === 'requested'
    || (doc.get('status') === 'proposed' && doc.get('startAt') <= now.getTime())
    || (doc.get('status') === 'confirmed' && doc.get('endAt') <= now.getTime()) : doc.get('status') === 'proposed')
  if (needed.length) actions.unshift({ kind: 'appointments', count: needed.length })
  const next = meetings.filter(doc => doc.get('status') === 'confirmed' && doc.get('endAt') > now.getTime())
    .sort((a, b) => a.get('startAt') - b.get('startAt'))[0]
  return { actions, checkedAt: now.getTime(), nextAppointment: next ? { date: next.get('date'), time: next.get('time') } : null }
}
module.exports = { getDashboardActions }
