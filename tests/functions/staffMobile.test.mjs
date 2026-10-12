import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { loadAttendance, submitAttendance } = require('../../functions/attendanceSubmission')
const { getStaffClasses, getStaffAttendanceLessons } = require('../../functions/staffMobile')
const { getDashboardActions } = require('../../functions/dashboardActions')
const { startPrayerClassSession } = require('../../functions/prayerClassSessions')
const { lessonKey } = require('../../functions/lib/attendanceProtocol')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required')
const projectId = 'demo-staff-mobile'
const app = admin.initializeApp({ projectId }, 'staff-mobile'), db = app.firestore()
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } })
after(async () => { await env.cleanup(); await app.delete() })
const slot = { day: 'monday', classe: 'FIXTURE', startTime: '08:15', endTime: '09:15', durationMin: 60 }
const now = new Date('2026-10-12T12:00:00Z'), date = '2026-10-12'
const input = { date, teacherUid: 'teacher', lessonKey: lessonKey(slot) }
await Promise.all([
  db.doc('users/staff').set({ role: 'staff', droits: ['absences.saisir', 'absences.voir', 'eleves.voir', 'priere', 'messages.boite', 'messages.envoyer'] }),
  db.doc('users/none').set({ role: 'staff', droits: [] }),
  db.doc('users/reader').set({ role: 'staff', droits: ['absences.voir'] }),
  db.doc('users/teacher').set({ role: 'professeur', classes: ['FIXTURE'] }),
  db.doc('users/otherTeacher').set({ role: 'professeur', classes: ['FIXTURE'] }),
  db.doc('schedules/teacher').set({ weeklySlots: [slot] }),
  db.doc('eleves/child').set({ classe: 'FIXTURE', active: true, nom: 'Synthetic', prenom: 'Fixture' }),
  db.doc('absenceRequests/pending').set({ status: 'pending', classe: 'FIXTURE', date, eleveId: 'child' }),
  db.doc('messages/box').set({ toType: 'administration', toIds: [], fromId: 'parent', academicYear: '2026-2027', readBy: [] }),
])
test('staff loads and submits actual teacher lesson; denied without checkbox', async () => {
  assert.equal((await getStaffAttendanceLessons(db, 'staff', {}, now)).lessons.length, 1)
  assert.deepEqual((await getStaffClasses(db, 'staff')).classes, ['FIXTURE'])
  for (const uid of ['none', 'reader', 'otherTeacher']) await assert.rejects(loadAttendance(db, uid, input, now), { code: 'permission-denied' })
  const loaded = await loadAttendance(db, 'staff', input, now)
  const command = { ...input, operationId: 'staff-operation-000001', rows: loaded.students.map(row => ({ id: row.id, status: 'absent', baseVersion: row.baseVersion })) }
  assert.equal((await submitAttendance(db, 'staff', command, now)).saved, true)
  assert.equal((await submitAttendance(db, 'staff', command, now)).replayed, true)
  assert.equal((await db.doc(`absences/child_${date}_S1`).get()).get('professorId'), 'staff')
  await db.doc('users/staff').update({ droits: ['priere', 'messages.boite'] })
  await assert.rejects(submitAttendance(db, 'staff', command, now), { code: 'permission-denied' })
  await db.doc('users/staff').update({ droits: ['absences.saisir', 'priere', 'messages.boite'] })
})
test('staff tasks contain only permitted domains and reject mode escalation', async () => {
  await db.doc('absenceRequests/pending').update({ status: 'pending' })
  assert.deepEqual((await getDashboardActions(db, 'none', { mode: 'staff' }, now)).actions, [])
  assert.deepEqual((await getDashboardActions(db, 'staff', { mode: 'staff' }, now)).actions, [{ kind: 'declarations', count: 1 }])
  await assert.rejects(getDashboardActions(db, 'staff', { mode: 'admin' }, now), { code: 'permission-denied' })
  await assert.rejects(getDashboardActions(db, 'teacher', { mode: 'staff' }, now), { code: 'permission-denied' })
})
test('staff starts prayer without teacher schedule, only for a real class', async () => {
  await assert.rejects(startPrayerClassSession(db, { uid: 'none', classe: 'FIXTURE', now }), { code: 'permission-denied' })
  await assert.rejects(startPrayerClassSession(db, { uid: 'staff', classe: 'MISSING', now }), { code: 'permission-denied' })
  assert.equal((await startPrayerClassSession(db, { uid: 'staff', classe: 'FIXTURE', now })).status, 'going')
  const staff = env.authenticatedContext('staff').firestore(), none = env.authenticatedContext('none').firestore()
  const update = { status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'staff', updatedAt: serverTimestamp() }
  await assertFails(updateDoc(doc(none, `prayerClassSessions/${date}_FIXTURE`), { ...update, prayingByUid: 'none' }))
  await assertSucceeds(updateDoc(doc(staff, `prayerClassSessions/${date}_FIXTURE`), update))
  await assertSucceeds(updateDoc(doc(staff, `prayerClassSessions/${date}_FIXTURE`), { status: 'returned', returnedAt: serverTimestamp(), returnedByUid: 'staff', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(staff, `prayerClassSessions/${date}_FIXTURE`), update))
})
test('administration inbox query allowed only with its checkbox', async () => {
  for (const [uid, allowed] of [['staff', true], ['none', false]]) {
    const client = env.authenticatedContext(uid).firestore()
    const request = getDocs(query(collection(client, 'messages'), where('toType', 'in', ['all', 'administration']), where('academicYear', '==', '2026-2027')))
    await (allowed ? assertSucceeds(request) : assertFails(request))
  }
})
