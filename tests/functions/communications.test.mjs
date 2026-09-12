import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { reconcileSchoolAlert } = require('../../functions/schoolAlerts')
const { createMessageDelivery } = require('../../functions/messageDelivery')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; never run against production')
admin.initializeApp({ projectId: 'demo-mojammaa-communications' })
const db = admin.firestore()
const period = () => ({ academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-09' })
let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`✓ ${name}`)
}
const doc = path => db.doc(path)
const body = { type: 'direct', fromId: 'teacher', fromRole: 'professeur', subject: 'Test', body: 'Synthetic test', toType: 'user', toIds: ['parent'], ...period() }
const token = id => `ExpoPushToken[test-${id}]`
await Promise.all([
  doc('users/teacher').set({ role: 'professeur' }),
  doc('users/admin').set({ role: 'admin' }),
  doc('users/parent').set({ role: 'parent', expoPushToken: token('parent') }),
  doc('users/second').set({ role: 'parent', expoPushToken: token('second') }),
  doc('eleves/child').set({ parentUid: 'parent', classe: 'TEST', prenom: 'Test', nom: 'Fixture' }),
  doc('eleves/unlinked').set({ classe: 'TEST' }),
])
const attendance = doc('absences/child_2026-09-05_S1')
const absence = { eleveId: 'child', classe: 'TEST', date: '2026-09-05', seance: 'S1', statut: 'absent', professorId: 'teacher' }
const reconcile = (sourceRef, kind = 'attendance', before = null) => reconcileSchoolAlert(db, { sourceRef, kind, before, period })
const alerts = sourceRef => db.collection('messages').where('automation.source', '==', sourceRef.path).get()

await test('Concurrent/replayed attendance events create one alert', async () => {
  await attendance.set(absence)
  await Promise.all([reconcile(attendance), reconcile(attendance), reconcile(attendance)])
  assert.equal((await alerts(attendance)).size, 1)
  await attendance.update({ createdAt: new Date() })
  await reconcile(attendance)
  assert.equal((await alerts(attendance)).size, 1)
})
await test('Absent → present sends one explicit correction; stale events cannot undo it', async () => {
  await attendance.update({ statut: 'present' })
  const id = await reconcile(attendance, 'attendance', absence)
  assert.equal((await doc(`messages/${id}`).get()).get('automation.correction'), true)
  await reconcile(attendance, 'attendance', absence)
  assert.equal((await alerts(attendance)).size, 2)
})
await test('New absence after correction is notified, then late status rectifies it', async () => {
  await attendance.update({ statut: 'absent' }); await reconcile(attendance)
  await attendance.update({ statut: 'retard' }); await reconcile(attendance)
  assert.equal((await alerts(attendance)).size, 4)
})
await test('Correction of an absence from the previous app is preserved', async () => {
  const ref = doc('absences/legacy')
  await ref.set({ ...absence, statut: 'present' })
  const id = await reconcile(ref, 'attendance', absence)
  assert.equal((await doc(`messages/${id}`).get()).get('automation.correction'), true)
})
await test('Unlinked family creates a visible administrative issue', async () => {
  const ref = doc('absences/unlinked')
  await ref.set({ ...absence, eleveId: 'unlinked' })
  const id = await reconcile(ref)
  const alert = await doc(`messages/${id}`).get()
  assert.equal(alert.get('push.status'), 'no_recipient')
  assert.deepEqual(alert.get('toIds'), [])
})
await test('Merit saved once produces one message even if trigger retries', async () => {
  const ref = doc('comportements/operation1')
  await ref.set({ ...absence, kind: 'merite', reason: 'participation', teacherId: 'teacher' })
  await Promise.all([reconcile(ref, 'behavior'), reconcile(ref, 'behavior')])
  assert.equal((await alerts(ref)).size, 1)
})

function harness(responses) {
  let time = Date.now()
  const requests = []
  const service = createMessageDelivery(db, {
    now: () => time,
    resolveRecipients: async message => message.toType === 'administration' ? ['admin'] : message.toIds,
    fetchImpl: async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body) })
      const response = responses.shift()
      assert.ok(response, 'Unexpected HTTP call')
      if (response instanceof Error) throw response
      return { status: response.status || 200, ok: !response.status || response.status < 400, json: async () => response.json }
    },
  })
  return { ...service, requests, advance: ms => { time += ms } }
}
const ok = id => ({ status: 'ok', id })
const response = data => ({ json: { data } })
async function seedMessage(id, data = {}) {
  const ref = doc(`messages/test_${id}`)
  await ref.set({ ...body, ...data })
  return ref
}

await test('HTTP 503 retries durably; replay does not resend; receipt confirms provider handoff', async () => {
  const h = harness([{ status: 503, json: {} }, response([ok('ticket1')]), response({ ticket1: { status: 'ok' } })])
  const ref = await seedMessage('retry')
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'retrying')
  await h.enqueue(ref); await h.process(ref)
  assert.equal(h.requests.length, 1)
  h.advance(61_000); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'accepted')
  h.advance(16 * 60_000); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'transmitted')
  assert.equal(h.requests.length, 3)
  assert.equal(JSON.stringify((await ref.get()).data()).includes('ExpoPushToken'), false)
})
await test('Partial failure retries only the failed recipient', async () => {
  const h = harness([response([ok('first'), { status: 'error', details: { error: 'MessageRateExceeded' } }]), response([ok('second')])])
  const ref = await seedMessage('partial', { toIds: ['parent', 'second'] })
  await h.enqueue(ref); await h.process(ref)
  h.advance(61_000); await h.process(ref)
  assert.equal(h.requests[1].payload.length, 1)
  assert.equal(h.requests[1].payload[0].to, token('second'))
})
await test('Concurrent workers acquire a single lease', async () => {
  const h = harness([response([ok('concurrent')])])
  const ref = await seedMessage('concurrent')
  await Promise.all([h.enqueue(ref), h.enqueue(ref)])
  await Promise.all([h.process(ref), h.process(ref)])
  assert.equal(h.requests.length, 1)
})
await test('Permanent errors stop; temporary errors stop after five attempts', async () => {
  const permanent = harness([response([{ status: 'error', details: { error: 'InvalidCredentials' } }])])
  const ref = await seedMessage('permanent')
  await permanent.enqueue(ref); await permanent.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'failed')
  const h = harness(Array.from({ length: 5 }, () => ({ status: 503, json: {} })))
  const retry = await seedMessage('exhausted')
  await h.enqueue(retry)
  for (let i = 0; i < 5; i++) { await h.process(retry); h.advance(61 * 60_000) }
  assert.equal((await retry.get()).get('push.status'), 'failed')
  await h.process(retry)
  assert.equal(h.requests.length, 5)
})
await test('Server blocks parent → teacher even for an Admin SDK/legacy write', async () => {
  const h = harness([])
  const ref = await seedMessage('blocked', { fromId: 'parent', fromRole: 'parent', eleveId: 'child', toIds: ['teacher'] })
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'blocked')
  assert.equal(h.requests.length, 0)
})
await test('Administration mailbox is permitted; missing phone is distinct from sent', async () => {
  const h = harness([])
  const ref = await seedMessage('admin_box', { fromId: 'parent', fromRole: 'parent', eleveId: 'child', toType: 'administration', toIds: [] })
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'no_device')
})
await test('Unknown receipt is not resent and becomes an explicit issue after expiry', async () => {
  const h = harness([response([ok('unknown')]), response({})])
  const ref = await seedMessage('unknown')
  await h.enqueue(ref); await h.process(ref)
  h.advance(25 * 60 * 60_000); await h.process(ref)
  assert.deepEqual((await ref.get()).get('push.errorCodes'), ['receipt_unknown'])
  assert.equal(h.requests.length, 2)
})
await test('DeviceNotRegistered receipt clears only the token used for that attempt', async () => {
  const h = harness([response([ok('invalidDevice')]), response({ invalidDevice: { status: 'error', details: { error: 'DeviceNotRegistered' } } })])
  const ref = await seedMessage('unregistered')
  await h.enqueue(ref); await h.process(ref)
  await doc('users/parent').update({ expoPushToken: token('new-device') })
  h.advance(16 * 60_000); await h.process(ref)
  assert.equal((await doc('users/parent').get()).get('expoPushToken'), token('new-device'))
  assert.equal((await ref.get()).get('push.status'), 'failed')
})
await test('Superseded alert is never sent from its pending queue', async () => {
  const h = harness([])
  const ref = await seedMessage('superseded')
  await h.enqueue(ref)
  await ref.update({ 'automation.supersededBy': 'new-correction' })
  await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'superseded')
  assert.equal(h.requests.length, 0)
})
await test('Manual recovery is admin-only and resumes a newly registered device', async () => {
  const h = harness([response([ok('recovered')])])
  const ref = await seedMessage('recovery', { toIds: ['admin'] })
  await h.enqueue(ref); await h.process(ref)
  await assert.rejects(h.retry(ref, 'parent'), { code: 'permission-denied' })
  await assert.rejects(h.retry(ref, 'teacher'), { code: 'permission-denied' })
  assert.equal(await h.retry(ref, 'admin'), false)
  await doc('users/admin').update({ expoPushToken: token('admin') })
  assert.equal(await h.retry(ref, 'admin'), true)
  await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'accepted')
  assert.equal(await h.retry(ref, 'admin'), false)
})
await test('Admin recovery resolves a previously missing parent link', async () => {
  const h = harness([response([ok('linked')])])
  const ref = await seedMessage('link_recovery', { toIds: [], eleveId: 'unlinked', automation: { source: 'absences/unlinked' } })
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'no_recipient')
  await doc('eleves/unlinked').update({ parentUid: 'second' })
  assert.equal(await h.retry(ref, 'admin'), true)
  await h.process(ref)
  assert.deepEqual((await ref.get()).get('toIds'), ['second'])
  assert.equal((await ref.get()).get('push.status'), 'accepted')
})
await test('Admin cannot revive superseded or ambiguously received alerts', async () => {
  const h = harness([])
  assert.equal(await h.retry(doc('messages/test_superseded'), 'admin'), false)
  assert.equal(await h.retry(doc('messages/test_unknown'), 'admin'), false)
})
await require('./secondLotCases.cjs')(db, test)
await require('./thirdLotCases.cjs')(db, test)
console.log(`${passed} communications tests passed (Firestore emulator, mocked Expo; no real push).`)
await db.terminate()
await admin.app().delete()
