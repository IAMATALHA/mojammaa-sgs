import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { manageHomework, validateChanges } = require('../../functions/homeworkManagement')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required')
admin.initializeApp({ projectId: 'demo-mojammaa-rules' })
const db = admin.firestore()
const base = { titre: 'Test', description: 'Consigne', type: 'Maison', dateLimite: '2026-10-01', attachments: [] }
const seed = async id => db.doc(`devoirs/${id}`).set({ ...base, teacherId: 'hmTeacher', classeId: 'TEST', academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10' })
await Promise.all([
  db.doc('users/hmTeacher').set({ role: 'professeur' }),
  db.doc('users/hmOther').set({ role: 'professeur' }),
  db.doc('users/hmAdmin').set({ role: 'admin' }),
  db.doc('users/hmParent').set({ role: 'parent' }),
])
let count = 0
const test = async (name, fn) => { await fn(); count++; console.log(`✓ ${name}`) }
const edit = (id, commandId, changes = base, extra = {}) => ({ id, commandId, action: 'edit', version: 0, changes, ...extra })
await seed('hmEdit')
await test('Owner edits; duplicate commands send exactly one notification', async () => {
  const input = edit('hmEdit', 'hmEditCmd', { ...base, dateLimite: '2027-02-10' })
  await Promise.all([manageHomework(db, 'hmTeacher', input), manageHomework(db, 'hmTeacher', input)])
  const saved = await db.doc('devoirs/hmEdit').get()
  assert.equal(saved.get('monthKey'), '2027-02'); assert.equal(saved.get('semestre'), 'S2')
  assert.equal(saved.get('teacherId'), 'hmTeacher'); assert.equal(saved.get('classeId'), 'TEST')
  assert.equal((await db.collection('messages').where('fromId', '==', 'hmTeacher').get()).size, 1)
})
await test('Colleague, parent and anonymous writes are refused', async () => {
  for (const uid of ['hmOther', 'hmParent', null]) {
    await assert.rejects(manageHomework(db, uid, edit('hmEdit', `denied-${uid}`)), e => ['permission-denied', 'unauthenticated'].includes(e.code))
  }
})
await test('Stale edit is refused without overwriting newer work', async () => {
  await assert.rejects(manageHomework(db, 'hmTeacher', edit('hmEdit', 'stale')), { code: 'failed-precondition' })
})
await test('Admin edits another teacher’s homework; text corrections may be silent', async () => {
  await seed('hmSilent')
  await manageHomework(db, 'hmAdmin', edit('hmSilent', 'silent', { ...base, titre: 'Corrected' }, { notify: false }))
  assert.equal((await db.doc('messages/homework_hmAdmin_silent').get()).exists, false)
})
await test('Due date changes always notify even when silent was requested', async () => {
  await seed('hmDate')
  await manageHomework(db, 'hmTeacher', edit('hmDate', 'date', { ...base, dateLimite: '2026-10-02' }, { notify: false }))
  assert.equal((await db.doc('messages/homework_hmTeacher_date').get()).exists, true)
})
await test('Deletion removes homework without submissions and is replay-safe', async () => {
  await seed('hmDelete')
  const input = { id: 'hmDelete', commandId: 'delete', action: 'remove', version: 0 }
  assert.equal((await manageHomework(db, 'hmTeacher', input)).status, 'deleted')
  assert.equal((await db.doc('devoirs/hmDelete').get()).exists, false)
  assert.equal((await manageHomework(db, 'hmTeacher', input)).status, 'deleted')
})
await test('Existing submissions are preserved by cancellation; further edits blocked', async () => {
  await seed('hmCancel')
  await db.doc('homeworkSubmissions/hmCancel_child').set({ homeworkId: 'hmCancel', status: 'submitted' })
  assert.equal((await manageHomework(db, 'hmTeacher', { id: 'hmCancel', commandId: 'cancel', action: 'remove', version: 0 })).status, 'cancelled')
  assert.ok((await db.doc('devoirs/hmCancel').get()).get('cancelledAt'))
  assert.equal((await db.doc('homeworkSubmissions/hmCancel_child').get()).get('status'), 'submitted')
  await assert.rejects(manageHomework(db, 'hmTeacher', edit('hmCancel', 'after-cancel')), { code: 'failed-precondition' })
})
await test('Invalid dates, blank titles and unsafe attachments rejected', async () => {
  for (const changes of [{ dateLimite: '2026-02-30' }, { titre: ' ' }, { attachments: [{ url: 'javascript:alert(1)', name: 'bad', mime: 'text/plain' }] }]) {
    assert.throws(() => validateChanges({ ...base, ...changes }), { code: 'invalid-argument' })
  }
})
console.log(`${count} homework management checks passed`)
await admin.app().delete()
