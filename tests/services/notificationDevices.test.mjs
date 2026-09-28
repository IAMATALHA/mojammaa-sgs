import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const source = fs.readFileSync(new URL('../../src/services/NotificationService.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
function harness() {
  const data = new Map(), calls = [], auth = { currentUser: { uid: 'parent' } }, i18n = { language: 'fr' }
  let granted = true, registered = true, token = 'ExpoPushToken[test]', getToken = async () => ({ data: token })
  let foreground, rotation, channelEnabled = true, timeout = false, handler, rejection = null
  const notifications = {
    setNotificationHandler(value) { handler = value }, setNotificationChannelAsync: async () => {},
    AndroidImportance: { MAX: 5, NONE: 0 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    getPermissionsAsync: async () => ({ granted, canAskAgain: false }),
    getNotificationChannelAsync: async () => ({ importance: channelEnabled ? 5 : 0 }),
    getExpoPushTokenAsync: (...args) => getToken(...args),
    addPushTokenListener: fn => { rotation = fn; return { remove() {} } },
  }
  const storage = { getItem: async key => data.get(key) || null, setItem: async (key, value) => { data.set(key, value) }, removeItem: async key => { data.delete(key) } }
  const dependencies = {
    'expo-notifications': notifications,
    'expo-constants': { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() {} } } } },
    'firebase/firestore': { collection: () => ({}), doc: () => ({ id: 'installation-test' }), setDoc: async () => {}, serverTimestamp: () => ({}) },
    'firebase/functions': { httpsCallable: () => async input => {
      calls.push(input)
      if (!registered) throw Object.assign(new Error('offline'), { code: 'functions/unavailable' })
      if (rejection) throw Object.assign(new Error('refused'), { code: rejection })
      // Le serveur remet une clé de libération à chaque activation appliquée.
      return { data: input.enabled && !input.releaseKey ? { applied: true, releaseKey: `release-key-${input.revision}` } : { applied: true } }
    } },
    '../config/firebase': { auth, db: {}, functions: {} },
    '@react-native-async-storage/async-storage': storage,
    '../i18n': i18n,
    '../theme/designTokens': { palette: { brandRed: 'red' } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', output)(name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]
  }, module, module.exports, (fn, ms) => setTimeout(fn, timeout ? 1 : ms), clearTimeout)
  return { service: module.exports, data, calls, auth, i18n,
    deny: () => { granted = false }, offline: () => { registered = false }, online: () => { registered = true },
    token: value => { token = value }, delayToken: fn => { getToken = fn },
    foreground: () => foreground('active'), rotate: () => rotation(),
    blockChannel: () => { channelEnabled = false }, timeout: () => { timeout = true },
    reject: code => { rejection = code }, handler: () => handler,
  }
}
test('Stable installation survives token rotation and synchronizes the selected language', async () => {
  const h = harness()
  await h.service.registerForPushNotificationsAsync('parent')
  h.token('ExpoPushToken[rotated]'); h.i18n.language = 'ar'
  await h.service.syncNotificationLanguage('ar')
  assert.equal(h.calls[0].deviceId, h.calls[1].deviceId)
  assert.ok(h.calls[1].revision > h.calls[0].revision)
  assert.equal(h.calls[1].language, 'ar'); assert.equal(h.calls[1].token, 'ExpoPushToken[rotated]')
  assert.equal(await h.service.notificationDiagnostics(), 'enabled')
})
test('Permission alone never claims successful server registration', async () => {
  const h = harness(); h.offline()
  await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(await h.service.notificationDiagnostics(), 'unregistered')
  h.online(); await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(await h.service.notificationDiagnostics(), 'enabled')
})
test('Revoked permission disables the existing installation', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent')
  h.deny(); await h.service.registerForPushNotificationsAsync('parent', false)
  assert.equal(h.calls.at(-1).enabled, false)
  assert.equal(await h.service.notificationDiagnostics(), 'disabled')
})
test('Blocked Android channel is visible in diagnostics', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent'); h.blockChannel()
  assert.equal(await h.service.notificationDiagnostics(), 'disabled')
})
test('Logout wins over an in-flight registration and foreground refresh', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent')
  h.service.startNotificationSync('parent')
  let release, started
  const begin = new Promise(resolve => { started = resolve })
  h.delayToken(() => { started(); return new Promise(resolve => { release = resolve }) })
  const registering = h.service.registerForPushNotificationsAsync('parent', false)
  await begin
  const logout = h.service.clearPushToken('parent')
  h.foreground()
  release({ data: 'ExpoPushToken[late]' })
  await registering; await logout
  await h.service.registerForPushNotificationsAsync('parent', false)
  assert.deepEqual(h.calls.map(c => c.enabled), [true, false])
})
test('Account switch during token lookup cannot register the old account', async () => {
  const h = harness()
  h.delayToken(async () => { h.auth.currentUser = { uid: 'other' }; return { data: 'ExpoPushToken[late]' } })
  await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(h.calls.length, 0)
})
test('An unavailable server makes logout fail visibly and permits retry', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent'); h.offline()
  await assert.rejects(h.service.clearPushToken('parent'))
  h.online(); await h.service.clearPushToken('parent')
  assert.equal(h.calls.at(-1).enabled, false)
})
test('A stalled Expo token lookup times out and releases the registration queue', async () => {
  const h = harness(); h.timeout(); h.delayToken(() => new Promise(() => {}))
  await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(await h.service.notificationDiagnostics(), 'unregistered')
  h.delayToken(async () => ({ data: 'ExpoPushToken[retry]' }))
  await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(await h.service.notificationDiagnostics(), 'enabled')
})

// ── Audit 2026-09-28, F9 : la déconnexion ne dépend plus du réseau ──
test('Offline logout never blocks and defers a keyed release', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent'); h.offline()
  assert.equal(await h.service.stopPushForLogout('parent'), 'deferred')
  const pending = JSON.parse(h.data.get('@mojammaa/push-release-pending-v1'))
  assert.equal(pending.releaseKey, `release-key-${h.calls[0].revision}`)
  assert.ok(pending.revision > h.calls.at(-1).revision)
  h.auth.currentUser = null; h.online()
  await h.service.retryPendingPushRelease()
  assert.deepEqual(h.calls.at(-1), { deviceId: pending.deviceId, revision: pending.revision, releaseKey: pending.releaseKey, enabled: false })
  assert.equal(h.data.get('@mojammaa/push-release-pending-v1'), undefined)
})
test('Online logout clears through the session, nothing deferred', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent')
  assert.equal(await h.service.stopPushForLogout('parent'), 'cleared')
  assert.equal(h.calls.at(-1).enabled, false); assert.equal(h.calls.at(-1).releaseKey, undefined)
  assert.equal(h.data.get('@mojammaa/push-release-pending-v1'), undefined)
})
test('A deferred release survives the network being down, and stops once refused', async () => {
  const h = harness(); await h.service.registerForPushNotificationsAsync('parent'); h.offline()
  await h.service.stopPushForLogout('parent')
  await h.service.retryPendingPushRelease()
  assert.ok(h.data.get('@mojammaa/push-release-pending-v1'), 'kept while offline')
  h.online(); h.reject('functions/permission-denied')
  await h.service.retryPendingPushRelease()
  assert.equal(h.data.get('@mojammaa/push-release-pending-v1'), undefined, 'dropped once refused')
})
test('Signed out: a late notification for the old account is not shown in the app', async () => {
  const h = harness()
  assert.equal((await h.handler().handleNotification()).shouldShowBanner, true)
  h.auth.currentUser = null
  const shown = await h.handler().handleNotification()
  assert.equal(shown.shouldShowBanner || shown.shouldShowList || shown.shouldPlaySound, false)
})
