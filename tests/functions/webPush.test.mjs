// Notifications navigateur du site d'administration (audit messagerie
// 2026-10-05, F05) : registre des appareils FCM et canal FCM du moteur
// d'envoi. Émulateur Firestore uniquement ; Expo et FCM simulés.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { createMessageDelivery } = require('../../functions/messageDelivery')
const { registerPushDevice, getPushTargets } = require('../../functions/pushDevices')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; never run against production')
admin.initializeApp({ projectId: 'demo-mojammaa-webpush' }, 'webpush')
const db = admin.app('webpush').firestore()
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }

const fcmToken = id => `fcm-${id}-` + 'A1b2_C3d4:'.repeat(15)
const expoToken = id => `ExpoPushToken[web-test-${id}]`
const deviceId = id => `browser-device-${id}-0001`
const register = (uid, id, input = {}) => registerPushDevice(db, uid, {
  deviceId: deviceId(id), revision: Date.now(), enabled: true, token: fcmToken(id), platform: 'web', language: 'fr', ...input,
})
await Promise.all([
  db.doc('users/admin').set({ role: 'admin' }),
  db.doc('users/teacher').set({ role: 'professeur' }),
  db.doc('users/parent').set({ role: 'parent', expoPushToken: expoToken('parent') }),
])

await test('Un navigateur s’enregistre avec un jeton FCM (fournisseur fcm)', async () => {
  const result = await register('admin', 'admin')
  assert.equal(result.applied, true)
  const device = (await db.doc(`pushDevices/${deviceId('admin')}`).get()).data()
  assert.equal(device.provider, 'fcm'); assert.equal(device.platform, 'web'); assert.equal(device.enabled, true)
})
await test('Formats croisés refusés : jeton Expo pour le web, jeton FCM pour un téléphone', async () => {
  await assert.rejects(register('admin', 'cross1', { token: expoToken('x') }), error => error.code === 'invalid-argument')
  await assert.rejects(register('admin', 'cross2', { platform: 'android' }), error => error.code === 'invalid-argument')
  await assert.rejects(register('admin', 'cross3', { token: 'court' }), error => error.code === 'invalid-argument')
})
await test('Les cibles portent leur fournisseur ; téléphone et navigateur coexistent', async () => {
  await register('teacher', 'teacher')
  await db.doc('users/teacher').update({ expoPushToken: expoToken('teacher') })
  const targets = await getPushTargets(db, ['admin', 'teacher', 'parent'])
  const kinds = targets.map(t => `${t.uid}:${t.provider}`).sort()
  assert.deepEqual(kinds, ['admin:fcm', 'parent:expo', 'teacher:expo', 'teacher:fcm'])
})

function harness({ fcm = [], expo = [] } = {}) {
  let time = Date.now()
  const fcmCalls = [], expoCalls = []
  const service = createMessageDelivery(db, {
    now: () => time,
    resolveRecipients: async message => message.toIds,
    fetchImpl: async (url, options) => {
      expoCalls.push({ url, payload: JSON.parse(options.body) })
      const next = expo.shift()
      assert.ok(next, 'Appel Expo inattendu')
      return { status: 200, ok: true, json: async () => next }
    },
    sendFcm: async messages => {
      fcmCalls.push(messages)
      const next = fcm.shift()
      assert.ok(next, 'Appel FCM inattendu')
      if (next instanceof Error) throw next
      return { responses: next(messages) }
    },
  })
  return { ...service, fcmCalls, expoCalls, advance: ms => { time += ms } }
}
const allOk = messages => messages.map(() => ({ success: true, messageId: 'projects/x/messages/1' }))
const allFail = code => messages => messages.map(() => ({ success: false, error: { code } }))
const message = async (id, data) => {
  const ref = db.doc(`messages/webpush_${id}`)
  await ref.set({ type: 'direct', fromId: 'teacher', fromRole: 'professeur', subject: 'Demande', body: 'Question', toType: 'user', toIds: ['admin'], ...data })
  return ref
}

await test('Un administrateur équipé seulement d’un navigateur reçoit la notification (F05)', async () => {
  const h = harness({ fcm: [allOk] })
  const ref = await message('admin-only')
  await h.enqueue(ref); await h.process(ref)
  const push = (await ref.get()).get('push')
  assert.equal(push.status, 'transmitted'); assert.equal(push.noDevice, 0); assert.equal(push.sent, 1)
  assert.equal(h.expoCalls.length, 0)
  const sent = h.fcmCalls[0][0]
  assert.equal(sent.token, fcmToken('admin'))
  assert.equal(sent.notification, undefined, 'données seules : le service worker affiche la notification')
  assert.deepEqual(Object.keys(sent.data).sort(), ['body', 'link', 'messageId', 'title', 'type', 'uid'])
  assert.equal(sent.data.uid, 'admin', 'le service worker vérifie le compte connecté (revue RC01)')
  assert.ok(Object.values(sent.data).every(value => typeof value === 'string'))
  assert.equal(JSON.stringify((await ref.get()).data()).includes(fcmToken('admin')), false, 'jamais de jeton dans le message')
})
await test('Envoi mixte : chaque fournisseur ne reçoit que ses jetons', async () => {
  const h = harness({ fcm: [allOk], expo: [{ data: [{ status: 'ok', id: 't1' }, { status: 'ok', id: 't2' }] }] })
  const ref = await message('mixed', { fromId: 'admin', fromRole: 'admin', toIds: ['teacher', 'parent'] })
  await h.enqueue(ref); await h.process(ref)
  assert.deepEqual(h.fcmCalls[0].map(m => m.token), [fcmToken('teacher')])
  assert.deepEqual(h.expoCalls[0].payload.map(m => m.to).sort(), [expoToken('parent'), expoToken('teacher')])
  assert.equal((await ref.get()).get('push.status'), 'accepted')
})
await test('Navigateur désabonné : échec définitif et appareil désactivé', async () => {
  await register('teacher', 'gone')
  const h = harness({ fcm: [allFail('messaging/registration-token-not-registered')], expo: [{ data: [{ status: 'ok', id: 't3' }] }] })
  const ref = await message('gone', { fromId: 'admin', fromRole: 'admin', toIds: ['teacher'] })
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await db.doc(`pushDevices/${deviceId('gone')}`).get()).get('enabled'), false)
  assert.ok((await ref.get()).get('push.errorCodes').includes('messaging/registration-token-not-registered'))
})
await test('Erreur FCM temporaire : nouvel essai plus tard, sans renvoi aux autres', async () => {
  const h = harness({ fcm: [allFail('messaging/server-unavailable'), allOk] })
  const ref = await message('retry')
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'retrying')
  h.advance(61_000); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'transmitted')
  assert.equal(h.fcmCalls.length, 2)
})
await test('Panne réseau vers FCM : nouvel essai', async () => {
  const h = harness({ fcm: [new Error('offline'), allOk] })
  const ref = await message('network')
  await h.enqueue(ref); await h.process(ref)
  assert.ok((await ref.get()).get('push.errorCodes').includes('network_error'))
  h.advance(61_000); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'transmitted')
})
await test('Déconnexion du site : le navigateur ne reçoit plus rien', async () => {
  await registerPushDevice(db, 'admin', { deviceId: deviceId('admin'), revision: Date.now() + 1000, enabled: false, platform: 'web' })
  const targets = await getPushTargets(db, ['admin'])
  assert.equal(targets.length, 0)
  const h = harness()
  const ref = await message('after-logout')
  await h.enqueue(ref); await h.process(ref)
  assert.equal((await ref.get()).get('push.status'), 'no_device')
  assert.equal(h.fcmCalls.length, 0)
})

// Revue RC04 : une panne du nettoyage d'un jeton mort ne doit jamais remettre
// en file un envoi déjà accepté (FCM comme Expo).
const { readFileSync } = await import('node:fs')
function engineWithFailingCleanup(options) {
  const devices = require('../../functions/pushDevices')
  let cleanups = 0
  const module = { exports: {} }
  new Function('require', 'module', 'exports', readFileSync(new URL('../../functions/messageDelivery.js', import.meta.url), 'utf8'))(name => {
    if (name === './pushDevices') return { ...devices, invalidatePushTarget: async (...args) => {
      if (++cleanups === 1) throw new Error('firestore unavailable')
      return devices.invalidatePushTarget(...args)
    } }
    return require(name)
  }, module, module.exports)
  let time = Date.now()
  return { ...module.exports.createMessageDelivery(db, { now: () => time, resolveRecipients: async m => m.toIds, ...options }), advance: ms => { time += ms } }
}
await test('Panne du nettoyage d’un jeton FCM mort : le navigateur accepté n’est pas renvoyé', async () => {
  await register('teacher', 'alive'); await register('teacher', 'dead')
  let sends = 0
  const h = engineWithFailingCleanup({
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ data: [{ status: 'ok', id: 'x' }] }) }),
    sendFcm: async messages => ({ responses: messages.map(m => {
      if (m.token === fcmToken('dead')) return { success: false, error: { code: 'messaging/registration-token-not-registered' } }
      if (m.token === fcmToken('alive')) sends++
      return { success: true }
    }) }),
  })
  const ref = await message('cleanup-fcm', { fromId: 'admin', fromRole: 'admin', toIds: ['teacher'] })
  await h.enqueue(ref); await h.process(ref)
  h.advance(61_000); await h.process(ref)
  h.advance(61_000); await h.process(ref)
  assert.equal(sends, 1)
  assert.notEqual((await ref.get()).get('push.status'), 'retrying')
})
await test('Panne du nettoyage d’un jeton Expo mort : le téléphone accepté n’est pas renvoyé', async () => {
  await db.doc('users/second').set({ role: 'parent', expoPushToken: expoToken('second') })
  await db.doc('users/third').set({ role: 'parent', expoPushToken: expoToken('third') })
  let sends = 0
  const h = engineWithFailingCleanup({
    sendFcm: async () => { throw new Error('FCM must not be called') },
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body)
      if (url.includes('getReceipts')) return { status: 200, ok: true, json: async () => ({ data: {} }) }
      sends += payload.filter(m => m.to === expoToken('second')).length
      return { status: 200, ok: true, json: async () => ({ data: payload.map(m => m.to === expoToken('third')
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket-second' }) }) }
    },
  })
  const ref = await message('cleanup-expo', { fromId: 'admin', fromRole: 'admin', toIds: ['second', 'third'] })
  await h.enqueue(ref); await h.process(ref)
  h.advance(61_000); await h.process(ref)
  assert.equal(sends, 1)
})

console.log(`${passed} web push tests passed (Firestore emulator, mocked Expo and FCM; no real notification).`)
await admin.app('webpush').delete()
process.exit(0)
