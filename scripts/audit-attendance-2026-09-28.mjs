// Diagnostic evidence only: OBSERVED = the audited defect still reproduces;
// NOT REPRODUCED = fixed (regression tests: tests/functions/attendanceAudit.test.mjs).
// Run under a loopback Firestore emulator; no production/network side effects.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/)
const admin = require('../functions/node_modules/firebase-admin')
const { loadAttendance, submitAttendance } = require('../functions/attendanceSubmission')
const { attendanceVersion, lessonKey } = require('../functions/lib/attendanceProtocol')
const app = admin.initializeApp({ projectId: 'demo-mojammaa-attendance-audit' })
const db = app.firestore()
const day = '2026-09-28'
const now = new Date('2026-09-28T12:00:00Z')
const slot = { day: 'monday', classe: 'AUDIT', startTime: '08:15', endTime: '09:15', durationMin: 60 }
const key = lessonKey(slot)
const record = db.doc(`absences/audit-child_${day}_S1`)
const declaration = db.doc('absenceRequests/audit-declaration')
async function check(label, fn) {
  try { await fn() } catch (error) { console.log(`NOT REPRODUCED: ${label} — ${String(error?.message ?? error).split('\n')[0].slice(0, 160)}`) }
}
try {
  await Promise.all([
    db.doc('users/audit-teacher').set({ role: 'professeur', classes: ['AUDIT'] }),
    db.doc('users/audit-other-teacher').set({ role: 'professeur', classes: ['OTHER'] }),
    db.doc('schedules/audit-teacher').set({ weeklySlots: [slot] }),
    db.doc('eleves/audit-child').set({ classe: 'AUDIT', active: true, parentUid: 'audit-parent', nom: 'Synthetic', prenom: 'Fixture' }),
    db.doc(`joursScolaires/${day}`).set({ annuleCours: true, reason: 'Synthetic school closure' }),
  ])
  await check('F10 cancelled school day', async () => {
  await assert.rejects(loadAttendance(db, 'audit-other-teacher', { date: day, lessonKey: key }, now), e => e.code === 'permission-denied')
  const bundle = await loadAttendance(db, 'audit-teacher', { date: day, lessonKey: key }, now)
  assert.equal(bundle.students.length, 1)
  const result = await submitAttendance(db, 'audit-teacher', {
    operationId: 'audit-cancelled-day-0001', date: day, lessonKey: key,
    rows: [{ id: 'audit-child', status: 'absent', baseVersion: 'missing' }],
  }, now)
  assert.equal(result.saved, true)
  assert.equal((await record.get()).get('statut'), 'absent')
  console.log('OBSERVED F10: load and submission succeed on a school day marked annuleCours=true; an unrelated teacher is denied')
  })

  await check('F11 stale justification', async () => {
  await db.doc(`joursScolaires/${day}`).update({ annuleCours: false })
  await declaration.set({ classe: 'AUDIT', date: day, eleveId: 'audit-child', status: 'pending', reason: 'Synthetic excuse' })
  async function resubmit(operationId, status = 'absent') {
    return submitAttendance(db, 'audit-teacher', {
      operationId, date: day, lessonKey: key,
      rows: [{ id: 'audit-child', status, baseVersion: attendanceVersion((await record.get()).data()) }],
    }, now)
  }
  await resubmit('audit-justification-0002')
  assert.equal((await declaration.get()).get('status'), 'approved')
  assert.equal((await record.get()).get('justified'), true)
  await declaration.update({ status: 'declined' })
  await resubmit('audit-justification-0003')
  assert.equal((await record.get()).get('justified'), true)
  assert.equal((await record.get()).get('raison'), 'Synthetic excuse')
  await resubmit('audit-justification-0004', 'present')
  assert.equal((await record.get()).get('statut'), 'present')
  assert.equal((await record.get()).get('justified'), true)
  console.log('OBSERVED F11: declined declaration and later present status leave the old justified=true and reason on the attendance record')
  })
} finally {
  await app.delete()
}
