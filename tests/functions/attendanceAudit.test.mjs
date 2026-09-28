/**
 * Audit 2026-09-28, F10/F11 — appel et justification (émulateur Firestore).
 * F10 : aucune présence sur une journée « cours annulés », même depuis un
 *       brouillon préparé avant l'annulation.
 * F11 : une déclaration refusée ou retirée ne laisse pas de justification.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { loadAttendance, submitAttendance, clearStaleJustification } = require('../../functions/attendanceSubmission')
const { attendanceVersion, lessonKey } = require('../../functions/lib/attendanceProtocol')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; never run against production')
const app = admin.initializeApp({ projectId: 'demo-mojammaa-attendance-fix' }, 'attendance-fix')
const db = app.firestore()

let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }
const slot = { day: 'monday', classe: 'FIX', startTime: '08:15', endTime: '09:15', durationMin: 60 }
const key = lessonKey(slot)
const monday = (day) => ({ date: day, now: new Date(`${day}T12:00:00Z`) })
const record = day => db.doc(`absences/fix-child_${day}_S1`)
let op = 0
const submit = async (day, status, now) => submitAttendance(db, 'fix-teacher', {
  operationId: `fix-operation-${String(++op).padStart(6, '0')}`, date: day, lessonKey: key,
  rows: [{ id: 'fix-child', status, baseVersion: attendanceVersion((await record(day).get()).data()) }],
}, now)
const rejectsWith = (promise, reason) => assert.rejects(promise, error => error.code === 'failed-precondition' && error.message === reason)

await Promise.all([
  db.doc('users/fix-teacher').set({ role: 'professeur', classes: ['FIX'] }),
  db.doc('users/fix-other-teacher').set({ role: 'professeur', classes: ['OTHER'] }),
  db.doc('schedules/fix-teacher').set({ weeklySlots: [slot] }),
  db.doc('schedules/fix-other-teacher').set({ weeklySlots: [] }),
  db.doc('eleves/fix-child').set({ classe: 'FIX', active: true, nom: 'Synthetic', prenom: 'Fixture' }),
])

await test('F10 normal school day: roll call loads and saves (positive control)', async () => {
  const { date, now } = monday('2026-09-21')
  assert.equal((await loadAttendance(db, 'fix-teacher', { date, lessonKey: key }, now)).students.length, 1)
  await submit(date, 'absent', now)
  assert.equal((await record(date).get()).get('statut'), 'absent')
})

await test('F10 cancelled day: load and submission refused, nothing written (audit case)', async () => {
  const { date, now } = monday('2026-09-28')
  await db.doc(`joursScolaires/${date}`).set({ annuleCours: true, type: 'vacances' })
  await rejectsWith(loadAttendance(db, 'fix-teacher', { date, lessonKey: key }, now), 'attendance-day-cancelled')
  await rejectsWith(submit(date, 'absent', now), 'attendance-day-cancelled')
  assert.equal((await record(date).get()).exists, false)
  // Un prof hors classe reste refusé pour son périmètre, pas pour le calendrier.
  await assert.rejects(loadAttendance(db, 'fix-other-teacher', { date, lessonKey: key }, now), { code: 'permission-denied' })
})

await test('F10 a draft prepared before the cancellation is refused at sync', async () => {
  const { date, now } = monday('2026-10-05')
  const bundle = await loadAttendance(db, 'fix-teacher', { date, lessonKey: key }, new Date('2026-10-05T09:00:00Z'))
  await db.doc(`joursScolaires/${date}`).set({ annuleCours: true, type: 'evenement' })
  await rejectsWith(submitAttendance(db, 'fix-teacher', {
    operationId: 'fix-offline-draft-000001', date, lessonKey: key,
    rows: bundle.students.map(s => ({ id: s.id, status: 'absent', baseVersion: s.baseVersion })),
  }, now), 'attendance-day-cancelled')
  assert.equal((await record(date).get()).exists, false)
  // Journée marquée sans annulation des cours (examen…) : l'appel reste possible.
  await db.doc(`joursScolaires/${date}`).set({ annuleCours: false, type: 'examen' })
  await submit(date, 'present', now)
  assert.equal((await record(date).get()).get('statut'), 'present')
})

await test('F11 a pending declaration justifies the absence and is approved', async () => {
  const { date, now } = monday('2026-09-14')
  await db.doc('absenceRequests/fix-declaration').set({ classe: 'FIX', date, eleveId: 'fix-child', status: 'pending', reason: 'Synthetic excuse' })
  const result = await submit(date, 'absent', now)
  const stored = (await record(date).get()).data()
  assert.equal(stored.justified, true); assert.equal(stored.raison, 'Synthetic excuse')
  assert.equal(stored.justificationRequestId, 'fix-declaration')
  assert.equal(result.versions['fix-child'], attendanceVersion(stored), 'returned version matches the stored record')
  assert.equal((await db.doc('absenceRequests/fix-declaration').get()).get('status'), 'approved')
})

await test('F11 declining the declaration removes the justification (trigger path)', async () => {
  const { date } = monday('2026-09-14')
  await db.doc('absenceRequests/fix-declaration').update({ status: 'declined' })
  assert.equal(await clearStaleJustification(db, { eleveId: 'fix-child', date }), 1)
  const stored = (await record(date).get()).data()
  assert.equal(stored.justified, undefined); assert.equal(stored.raison, undefined)
  assert.equal(stored.justificationRequestId, undefined); assert.equal(stored.statut, 'absent')
})

await test('F11 resubmission with a declined declaration keeps no old justification (audit case)', async () => {
  const { date, now } = monday('2026-09-07')
  await db.doc('absenceRequests/fix-declined').set({ classe: 'FIX', date, eleveId: 'fix-child', status: 'pending', reason: 'Old excuse' })
  await submit(date, 'absent', now)
  assert.equal((await record(date).get()).get('justified'), true)
  await db.doc('absenceRequests/fix-declined').update({ status: 'declined' })
  const result = await submit(date, 'absent', now)
  const stored = (await record(date).get()).data()
  assert.equal(stored.justified, undefined); assert.equal(stored.raison, undefined)
  assert.equal(result.versions['fix-child'], attendanceVersion(stored), 'returned version matches the stored record')
  await submit(date, 'present', now)
  assert.equal((await record(date).get()).get('justified'), undefined, 'present correction keeps consistent metadata')
})

await test('F11 another active declaration still justifies the absence', async () => {
  const { date, now } = monday('2026-08-31')
  await Promise.all([
    db.doc('absenceRequests/fix-first').set({ classe: 'FIX', date, eleveId: 'fix-child', status: 'pending', reason: 'First' }),
    db.doc('absenceRequests/fix-second').set({ classe: 'FIX', date, eleveId: 'fix-child', status: 'approved', reason: 'Second' }),
  ])
  await submit(date, 'absent', now)
  await db.doc('absenceRequests/fix-first').update({ status: 'declined' })
  assert.equal(await clearStaleJustification(db, { eleveId: 'fix-child', date }), 0)
  assert.equal((await record(date).get()).get('justified'), true)
})

console.log(`attendance audit fixes: ${passed} tests OK`)
await app.delete()
