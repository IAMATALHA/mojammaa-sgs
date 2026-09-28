/** Audit evidence, NOT regression expectations: OBSERVED means the documented
 * weakness is still reproducible; NOT REPRODUCED means the case no longer
 * behaves as audited (the regression tests in tests/ prove the fix). Synthetic
 * fixtures only; never connects to production. Run with
 * `node scripts/audit-app-2026-09-28.mjs`; add --emulator inside
 * firebase emulators:exec for Firestore/Storage evidence.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let pending = null
const observed = name => { pending = name }
// Chaque cas est indépendant : un cas corrigé n'interrompt plus les suivants.
async function check(label, fn) {
  pending = null
  try {
    await fn()
    console.log(`OBSERVED: ${pending ?? label}`)
  } catch (error) {
    console.log(`NOT REPRODUCED: ${label} — ${String(error?.message ?? error).split('\n')[0].slice(0, 160)}`)
  }
}
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
const cache = new Map()
function loadTs(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }
  cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions }).outputText
  new Function('require', 'module', 'exports', code)(spec => spec.startsWith('.')
    ? loadTs(path.resolve(path.dirname(file), spec.replace(/\.js$/, '') + '.ts'))
    : require(spec), mod, mod.exports)
  return mod.exports
}
function arrowFrom(file, name, wrapped = false) {
  const tree = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) {
      found = (wrapped ? node.initializer.arguments[0] : node.initializer).getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(found, name)
  return ts.transpileModule(`const extracted = ${found}`, { compilerOptions }).outputText + '\nreturn extracted;'
}

async function pureEvidence() {
  await check('F2 country field middle-space deletion', async () => {
  const phone = loadTs(path.join(root, 'src/utils/phoneCountries.ts'))
  const handlerCode = arrowFrom('src/components/PhoneNumberField.tsx', 'onChangeText')
  const value = { iso: 'MA', raw: '0612345678' }
  const display = phone.formatNationalInput(phone.findPhoneCountry('MA'), value.raw)
  let changed
  const handler = new Function('value', 'display', 'isOther', 'onChange', 'parseInternationalInput', 'digitsOnly', 'OTHER_COUNTRY_ISO', 'MAX_TYPED_DIGITS', 'Haptics', 'digitsAfterFormattedEdit', handlerCode)(
    value, display, false, next => { changed = next }, phone.parseInternationalInput, phone.digitsOnly, phone.OTHER_COUNTRY_ISO, 15,
    { selectionAsync: () => Promise.resolve() }, phone.digitsAfterFormattedEdit,
  )
  handler('0612 34 56 78') // Delete the FIRST formatting space, not the final digit.
  assert.equal(changed.raw, '061234567')
  observed('country field deletes the LAST digit when a middle formatting space is deleted')
  })

  await check('F9 logout while push unregister fails', async () => {
  const logoutCode = arrowFrom('src/contexts/AuthContext.tsx', 'logout', true)
  let signedOut = false
  const failingClear = async () => { throw new Error('offline') }
  // stopPushForLogout (version corrigée) : même contrat que le service réel,
  // prouvé par tests/services/notificationDevices.test.mjs (hors ligne → 'deferred').
  const logout = new Function('user', 'clearPushToken', 'signOut', 'auth', 'stopPushForLogout', 'retryPendingPushRelease', logoutCode)(
    { uid: 'audit-parent' }, failingClear, async () => { signedOut = true }, {},
    async uid => { try { await failingClear(uid); return 'cleared' } catch { return 'deferred' } }, async () => {},
  )
  await assert.rejects(logout(), /offline/)
  assert.equal(signedOut, false)
  observed('logout never calls signOut when push unregister fails')
  })

  await check('F4 stale guardian rebuild (in-memory double; real transactions: tests/functions/guardianAccessRace.test.mjs)', async () => {
  const { rebuildGuardianAccess } = require(path.join(root, 'functions/guardianAccess.js'))
  let children = [{ id: 'audit-child', get: field => field === 'classe' ? 'AUDIT-A' : true }]
  let stored, started, release
  const atWrite = new Promise(resolve => { started = resolve })
  const resume = new Promise(resolve => { release = resolve })
  const accessRef = {
    set: async data => { started(); await resume; stored = data },
    delete: async () => { stored = undefined },
  }
  const db = { collection: name => name === 'eleves'
    ? { where: () => ({ get: async () => ({ docs: children.slice() }) }) }
    : { doc: () => accessRef } }
  const stale = rebuildGuardianAccess(db, 'audit-parent', { serverTimestamp: () => 0 })
  await Promise.race([atWrite, stale]) // une version transactionnelle rejette ce double sans transaction
  children = []
  await rebuildGuardianAccess(db, 'audit-parent', { serverTimestamp: () => 1 })
  assert.equal(stored, undefined)
  release()
  await stale
  assert.deepEqual(stored.classes, ['AUDIT-A'])
  observed('an older guardian rebuild restores class access after a newer revocation')
  })

  await check('F1 unknown-phone flood vs untouched family', async () => {
  const adminFile = path.resolve(root, '../mojammaa-admin/functions/src/parentPhoneLogin.ts')
  if (!fs.existsSync(adminFile)) {
    console.log('SKIPPED: adjacent mojammaa-admin phone-login source unavailable')
    return
  }
  const { verifyParentPhoneLogin } = loadTs(adminFile)
  const docs = new Map()
  const snapshot = data => ({ data: () => data })
  const fakeDb = {
    collection: name => ({ doc: id => ({ path: `${name}/${id}`, get: async () => snapshot(docs.get(`${name}/${id}`)) }) }),
    runTransaction: async fn => fn({
      getAll: async (...refs) => refs.map(ref => snapshot(docs.get(ref.path))),
      set: (ref, data) => docs.set(ref.path, data),
    }),
  }
  const realPhone = '+212699999999'
  docs.set('users/audit-parent', { role: 'parent', parentLoginEnabled: true, authPhoneE164: realPhone })
  let verifications = 0
  const deps = {
    db: fakeDb, nowMs: 1_000_000,
    auth: { getUserByPhoneNumber: async phone => {
      if (phone === realPhone) return { uid: 'audit-parent', email: 'audit@example.invalid', disabled: false }
      throw Object.assign(new Error('unknown'), { code: 'auth/user-not-found' })
    } },
    verifyPassword: async email => { verifications++; return email === 'audit@example.invalid' ? 'audit-parent' : null },
  }
  // Positive control in an independent window, then a fresh limiter state.
  assert.equal((await verifyParentPhoneLogin(realPhone, 'synthetic-password', deps)).uid, 'audit-parent')
  for (const key of docs.keys()) if (!key.startsWith('users/')) docs.delete(key)
  for (let i = 0; i < 3000; i++) {
    deps.nowMs = 1_000_000 + Math.floor(i / 300) * 60_001
    const unknownPhone = `+2126${String(i).padStart(8, '0')}`
    await assert.rejects(verifyParentPhoneLogin(unknownPhone, 'wrong', deps), e => e.code === 'invalid-credential')
  }
  deps.nowMs += 60_001 // Minute cap expired; day cap remains.
  const before = verifications
  await assert.rejects(verifyParentPhoneLogin(realPhone, 'synthetic-password', deps), e => e.code === 'too-many-attempts' && e.detail === 'global-cap')
  assert.equal(verifications, before)
  observed('3000 unknown-phone attempts exhaust the day budget and refuse a valid untouched account')
  })
}

async function emulatorEvidence() {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'Run through local emulators:exec')
  for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST]) {
    assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/, 'Only loopback emulators are allowed')
  }
  const { initializeTestEnvironment, assertSucceeds, assertFails } = await import('@firebase/rules-unit-testing')
  const { doc, setDoc, updateDoc, getDoc, serverTimestamp } = await import('firebase/firestore')
  const { ref, uploadBytes, getBytes, listAll } = await import('firebase/storage')
  const env = await initializeTestEnvironment({
    projectId: 'demo-mojammaa-storage',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8') },
  })
  const db = uid => env.authenticatedContext(uid).firestore()
  const storage = uid => env.authenticatedContext(uid).storage()
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const rows = {
        'config/superadmins': { uids: ['audit-super'] },
        'users/audit-teacher': { role: 'professeur', classes: ['AUDIT-A'], classe: 'AUDIT-A' },
        'users/audit-other-teacher': { role: 'professeur', classes: ['AUDIT-B'], classe: 'AUDIT-B' },
        'users/audit-parent': { role: 'parent' },
        'users/audit-other-parent': { role: 'parent' },
        'users/audit-admin': { role: 'admin' },
        'eleves/audit-child': { classe: 'AUDIT-A', parentUid: 'audit-parent' },
        'guardianAccess/audit-parent': { childIds: ['audit-child'], classes: ['AUDIT-A'] },
        'devoirs/audit-homework': { classeId: 'AUDIT-A', teacherId: 'audit-teacher' },
        'ressources/audit-resource': { classeId: 'AUDIT-A', teacherId: 'audit-teacher', viewedBy: [] },
      }
      await Promise.all(Object.entries(rows).map(([p, data]) => setDoc(doc(ctx.firestore(), p), data)))
    })
    await check('F3 homework files outside the Firestore isolation', async () => {
    await assertSucceeds(uploadBytes(ref(storage('audit-teacher'), 'devoirs/audit-teacher/audit.pdf'), new Uint8Array([1, 2]), { contentType: 'application/pdf' }))
    await assertFails(getDoc(doc(db('audit-other-teacher'), 'devoirs/audit-homework')))
    await assertSucceeds(getBytes(ref(storage('audit-other-teacher'), 'devoirs/audit-teacher/audit.pdf')))
    await assertSucceeds(listAll(ref(storage('audit-other-parent'), 'devoirs/audit-teacher')))
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'devoirs/audit-teacher/audit.pdf')))
    observed('a teacher denied the homework document can download its file; an unrelated parent can list the folder')
    })

    await check('F6 resource update outside class scope', async () => {
    await assertFails(setDoc(doc(db('audit-teacher'), 'ressources/audit-direct-outside'), { classeId: 'AUDIT-B', teacherId: 'audit-teacher' }))
    await assertSucceeds(updateDoc(doc(db('audit-teacher'), 'ressources/audit-resource'), { classeId: 'AUDIT-B', teacherId: 'audit-other-teacher' }))
    observed('resource update bypasses class scope and can impersonate another teacher; equivalent create is denied')
    })

    await assertSucceeds(uploadBytes(ref(storage('audit-parent'), 'homework-submissions/audit-parent/audit.jpg'), new Uint8Array([3]), {
      contentType: 'image/jpeg', customMetadata: { parentUid: 'audit-parent', eleveId: 'audit-child', homeworkId: 'audit-homework' },
    }))
    await assertFails(getBytes(ref(storage('audit-other-parent'), 'homework-submissions/audit-parent/audit.jpg')))

    await check('F5 malformed parent attachment reaches the admin renderer', async () => {
    const poisoned = { fromId: 'audit-parent', fromRole: 'parent', eleveId: 'audit-child', toType: 'user', toIds: ['audit-admin'], type: 'direct', subject: 'Synthetic audit', body: 'Synthetic audit', attachments: [{ url: 'https://example.invalid/a', name: 'a', mime: 42 }] }
    await assertSucceeds(setDoc(doc(db('audit-parent'), 'messages/audit-poisoned'), poisoned))
    const received = await assertSucceeds(getDoc(doc(db('audit-admin'), 'messages/audit-poisoned')))
    assert.throws(() => (received.data().attachments || []).filter(a => a.mime?.startsWith('image/')), TypeError)
    observed('parent message with mime:42 is accepted, readable by admin, and throws in the current attachment renderer')
    })

    await check('F7 external proof URL', async () => {
    await assertSucceeds(setDoc(doc(db('audit-parent'), 'homeworkSubmissions/audit-homework_audit-child'), {
      homeworkId: 'audit-homework', eleveId: 'audit-child', classeId: 'AUDIT-A', parentUid: 'audit-parent', teacherId: 'audit-teacher', status: 'submitted',
      attachments: [{ url: 'https://example.invalid/untrusted.jpg', name: 'a', mime: 'image/jpeg' }],
      submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), createdAt: serverTimestamp(), submittedByUid: 'audit-parent',
    }))
    observed('homework proof accepts external attachments without verifying ownership or Storage origin')
    })

    await check('F8 unlinked guardian keeps proof downloads', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'eleves/audit-child'), { parentUid: 'audit-other-parent' }))
    await assertFails(getDoc(doc(db('audit-parent'), 'eleves/audit-child')))
    await assertSucceeds(getBytes(ref(storage('audit-parent'), 'homework-submissions/audit-parent/audit.jpg')))
    observed('revoked guardian loses the student document but retains access to uploaded proof files')
    })
  } finally { await env.cleanup() }
}

if (process.argv.includes('--emulator')) await emulatorEvidence()
else await pureEvidence()
