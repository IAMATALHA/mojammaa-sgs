import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const output = ts.transpileModule(fs.readFileSync(new URL('../../src/utils/parentIdentity.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const {
  normalizeMoroccanMobile, formatMoroccanMobile, isEmailIdentifier, isHiddenParentEmail,
  loginIdentifierLabel, classifyParentLoginError,
} = module.exports

// Même matrice que mojammaa-admin/functions/src/parentInvitations.test.ts : le
// client et le serveur doivent accepter et refuser exactement les mêmes saisies.
const VALID_PHONES = [
  ['06 12 34 56 78', '+212612345678'],
  ['612345678', '+212612345678'],
  ['+212 6 12 34 56 78', '+212612345678'],
  ['00212 (6) 12-34-56-78', '+212612345678'],
  ['212612345678', '+212612345678'],
  ['+212 (0) 612345678', '+212612345678'],
  ['00212 (0) 612345678', '+212612345678'],
  ['00 212 (0) 612345678', '+212612345678'],
  ['+٢١٢ (٠) ٦١٢٣٤٥٦٧٨', '+212612345678'],
  ['+۲۱۲ (۰) ۶۱۲۳۴۵۶۷۸', '+212612345678'],
  ['0712345678', '+212712345678'],
  ['06.12.34.56.78', '+212612345678'],
]
const INVALID_PHONES = [
  '', '   ', '0512345678', '061234567', '06123456789', '+212 (0) 512345678',
  '+33612345678', 'abc0612345678', '0612345678x', '+212 6 12 34 56 7',
]

test('Moroccan mobiles normalize to E.164 exactly like the server', () => {
  for (const [input, e164] of VALID_PHONES) assert.equal(normalizeMoroccanMobile(input), e164, input)
  for (const input of INVALID_PHONES) assert.equal(normalizeMoroccanMobile(input), null, input)
  assert.equal(normalizeMoroccanMobile(`06${' '.repeat(40)}12345678`), null)
})

test('display format is the familiar local one', () => {
  assert.equal(formatMoroccanMobile('+212612345678'), '06 12 34 56 78')
  assert.equal(formatMoroccanMobile('+212712345678'), '07 12 34 56 78')
  assert.equal(formatMoroccanMobile('0612345678'), '0612345678')
})

test('the single login field routes on "@"', () => {
  assert.equal(isEmailIdentifier('parent@gmail.com'), true)
  assert.equal(isEmailIdentifier('06 12 34 56 78'), false)
})

test('the hidden technical login is never shown to the user', () => {
  const hidden = 'p-0123456789abcdef0123456789abcdef0123456789abcdef@parents.mojammaa.invalid'
  assert.equal(isHiddenParentEmail(hidden), true)
  assert.equal(isHiddenParentEmail(hidden.toUpperCase()), true)
  assert.equal(isHiddenParentEmail('parent@gmail.com'), false)
  assert.equal(loginIdentifierLabel({ email: 'parent@gmail.com', authPhoneE164: '+212612345678' }), 'parent@gmail.com')
  assert.equal(loginIdentifierLabel({ authPhoneE164: '+212612345678' }), '06 12 34 56 78')
  assert.equal(loginIdentifierLabel({ email: hidden, authPhoneE164: '+212612345678' }), '06 12 34 56 78')
  assert.equal(loginIdentifierLabel({ email: hidden }), '')
  assert.equal(loginIdentifierLabel({ telephone: '0612345678' }), '0612345678')
  assert.equal(loginIdentifierLabel(null), '')
})

test('callable failures map to fixed messages, never raw server text', () => {
  assert.equal(classifyParentLoginError({ code: 'functions/invalid-argument', message: 'raw' }), 'invalid-phone')
  assert.equal(classifyParentLoginError({ code: 'functions/unauthenticated' }), 'wrong-credentials')
  assert.equal(classifyParentLoginError({ code: 'auth/invalid-credential' }), 'wrong-credentials')
  assert.equal(classifyParentLoginError({ code: 'functions/resource-exhausted' }), 'rate-limited')
  assert.equal(classifyParentLoginError({ code: 'auth/too-many-requests' }), 'rate-limited')
  for (const error of [{ code: 'functions/internal' }, { code: 'functions/unavailable' }, new Error('offline'), null, 'x']) {
    assert.equal(classifyParentLoginError(error), 'temporary')
  }
})
