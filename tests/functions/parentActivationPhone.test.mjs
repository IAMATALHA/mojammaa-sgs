import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(process.env.MOJAMMAA_ADMIN_SOURCE || '../mojammaa-admin/functions/src')

function compile(file, dependency) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', output)(dependency, exports)
  return exports
}
const helpers = compile('parentInvitations.ts', require)

function fixture({ existingPhone, linked = false } = {}) {
  const writes = [], created = []
  const invitation = { status: 'pending', expiresAt: { toMillis: () => Date.now() + 60000 },
    studentId: 'student-test', studentName: 'Test', classe: '1APIC-1' }
  const values = { 'parentInvitations/test': invitation,
    'eleves/student-test': linked ? { parentUid: 'someone-else' } : {},
    'users/parent-test': { role: 'parent', ...(existingPhone ? { telephone: existingPhone } : {}) } }
  const snapshot = id => ({ exists: Object.hasOwn(values, id), ref: { path: id },
    data: () => values[id], get: k => values[id]?.[k] })
  const db = { doc: id => ({ path: id, get: async () => snapshot(id) }),
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [snapshot('parentInvitations/test')] }) }) }) }),
    runTransaction: async fn => fn({ get: async ref => snapshot(ref.path),
      set: (ref, data) => writes.push({ path: ref.path, data }), update: (ref, data) => writes.push({ path: ref.path, data }) }) }
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code } }
  const functions = compile('index.ts', name => {
    if (name === './parentInvitations.js') return helpers
    if (name === 'firebase-admin/app') return { initializeApp() {} }
    if (name === 'firebase-admin/firestore') return { getFirestore: () => db,
      FieldValue: { serverTimestamp: () => 'timestamp', arrayUnion: value => [value] }, Timestamp: {} }
    if (name === 'firebase-admin/functions') return { getFunctions: () => ({ taskQueue: () => ({}) }) }
    if (name === 'firebase-admin/auth') return { getAuth: () => ({
      createUser: async data => { created.push(data); return { uid: 'parent-test' } },
      deleteUser: async () => {}, getUser: async () => ({ email: 'parent@example.test', displayName: 'Test Parent' }),
    }) }
    if (name === 'firebase-functions/v2') return { logger: { info() {} } }
    if (name.startsWith('firebase-functions/')) return {
      HttpsError, onCall: (_, fn) => fn, onSchedule: (_, fn) => fn, onTaskDispatched: (_, fn) => fn,
    }
    if (name.startsWith('./')) return {}
    return require(name)
  })
  return { functions, writes, created }
}
const data = { code: 'ABCDEFGH23', nom: 'Parent', prenom: 'Test', email: 'parent@example.test', password: 'synthetic-password' }

test('new parent: normalized telephone saved in profile and student', async () => {
  const { functions, writes } = fixture()
  await functions.redeemParentInvitation({ data: { ...data, telephone: '+212 6 12 34 56 78' } })
  assert.equal(writes.find(w => w.path === 'users/parent-test').data.telephone, '+212612345678')
  assert.equal(writes.find(w => w.path === 'eleves/student-test').data.parentTel, '+212612345678')
})
test('old app: registration without telephone still succeeds', async () => {
  const { functions, writes } = fixture()
  await functions.redeemParentInvitation({ data })
  assert.equal(Object.hasOwn(writes.find(w => w.path === 'users/parent-test').data, 'telephone'), false)
})
test('invalid telephone rejected before account creation', async () => {
  for (const telephone of ['abc', '+1', { phone: '0612345678' }, '1'.repeat(41)]) {
    const { functions, created, writes } = fixture()
    await assert.rejects(functions.redeemParentInvitation({ data: { ...data, telephone } }), e => e.code === 'invalid-argument')
    assert.equal(created.length, 0); assert.equal(writes.length, 0)
  }
})
test('existing account: entered phone updates profile and new child', async () => {
  const { functions, writes } = fixture()
  await functions.linkParentInvitation({ auth: { uid: 'parent-test' }, data: { code: data.code, telephone: '06 12 34 56 78' } })
  assert.equal(writes.find(w => w.path === 'users/parent-test').data.telephone, '0612345678')
  assert.equal(writes.find(w => w.path === 'eleves/student-test').data.parentTel, '0612345678')
})
test('existing account: omitted phone retains saved phone for child', async () => {
  const { functions, writes } = fixture({ existingPhone: '0612345678' })
  await functions.linkParentInvitation({ auth: { uid: 'parent-test' }, data: { code: data.code } })
  assert.equal(Object.hasOwn(writes.find(w => w.path === 'users/parent-test').data, 'telephone'), false)
  assert.equal(writes.find(w => w.path === 'eleves/student-test').data.parentTel, '0612345678')
})
test('linking requires login and cannot take another parent child', async () => {
  const { functions, writes } = fixture({ linked: true })
  await assert.rejects(functions.linkParentInvitation({ data: { code: data.code } }), e => e.code === 'unauthenticated')
  await assert.rejects(functions.linkParentInvitation({ auth: { uid: 'parent-test' }, data: { code: data.code } }), e => e.code === 'already-exists')
  assert.equal(writes.length, 0)
})
