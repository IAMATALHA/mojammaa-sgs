const { hasRight } = require('./staffRights')
const { validateLesson } = require('./attendanceSubmission')
const { lessonKey } = require('./lib/attendanceProtocol')
const { moroccoParts } = require('./lib/moroccoTime')
const fail = code => { throw Object.assign(new Error(code), { code }) }
async function getStaffClasses(db, uid) {
  if (!uid) fail('unauthenticated')
  const user = (await db.doc(`users/${uid}`).get()).data()
  if (user?.role !== 'staff' || !['priere', 'absences.saisir', 'messages.envoyer'].some(right => hasRight(user, right))) fail('permission-denied')
  const students = await db.collection('eleves').get()
  return { classes: [...new Set(students.docs.filter(d => d.get('active') !== false).map(d => d.get('classe')).filter(v => typeof v === 'string' && v))].sort() }
}
async function getStaffAttendanceLessons(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  const user = (await db.doc(`users/${uid}`).get()).data()
  if (user?.role !== 'staff' || !hasRight(user, 'absences.saisir')) fail('permission-denied')
  const p = moroccoParts(now), date = `${p.year}-${p.month}-${p.day}`
  if ((await db.doc(`joursScolaires/${date}`).get()).get('annuleCours') === true) return { date, lessons: [] }
  const schedules = await db.collection('schedules').get(), lessons = []
  for (const schedule of schedules.docs) for (const slot of schedule.get('weeklySlots') || []) {
    const key = lessonKey(slot)
    try {
      const resolved = validateLesson(uid, { date, lessonKey: key }, user, schedule.data(), now)
      lessons.push({ teacherUid: schedule.id, lessonKey: key, classe: resolved.slot.classe, seance: resolved.seance, date })
    } catch (error) { if (!['permission-denied', 'failed-precondition', 'invalid-argument'].includes(error.code)) throw error }
  }
  return { date, lessons }
}
module.exports = { getStaffClasses, getStaffAttendanceLessons }
