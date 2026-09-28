import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const output = ts.transpileModule(fs.readFileSync(new URL('../../src/utils/parentIdentity.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const {
  normalizeLoginPhone, formatLoginPhone, formatLoginPhoneForConfirmation, isEmailIdentifier, isHiddenParentEmail,
  loginIdentifierLabel, classifyParentLoginError,
} = module.exports

// Même matrice que mojammaa-admin/functions/src/parentInvitations.test.ts : le
// client et le serveur doivent accepter et refuser exactement les mêmes saisies.
const VALID_PHONES = [
  // Maroc, sans indicatif : mobiles et fixes
  ['06 12 34 56 78', '+212612345678'],
  ['612345678', '+212612345678'],
  ['0712345678', '+212712345678'],
  ['0522 12 34 56', '+212522123456'],
  ['06.12.34.56.78', '+212612345678'],
  // Maroc, avec indicatif
  ['+212 6 12 34 56 78', '+212612345678'],
  ['00212 (6) 12-34-56-78', '+212612345678'],
  ['212612345678', '+212612345678'],
  ['+212 (0) 612345678', '+212612345678'],
  ['00212 (0) 612345678', '+212612345678'],
  ['00 212 (0) 612345678', '+212612345678'],
  ['+212 0612345678', '+212612345678'],
  ['+212 (0) 522123456', '+212522123456'],
  ['+٢١٢ (٠) ٦١٢٣٤٥٦٧٨', '+212612345678'],
  ['+۲۱۲ (۰) ۶۱۲۳۴۵۶۷۸', '+212612345678'],
  // Étranger : indicatif obligatoire
  ['+33 6 12 34 56 78', '+33612345678'],
  ['0033 6 12 34 56 78', '+33612345678'],
  ['+33 (0)6 12 34 56 78', '+33612345678'],
  ['+33 06 12 34 56 78', '+33612345678'],
  ['+34 612 34 56 78', '+34612345678'],
  ['+32 470 12 34 56', '+32470123456'],
  ['+31 06 12345678', '+31612345678'],
  ['+49 0151 23456789', '+4915123456789'],
  ['+44 07700 900123', '+447700900123'],
  ['+39 06 1234 5678', '+390612345678'],
  ['+1 (514) 555-0123', '+15145550123'],
  ['+971 50 123 4567', '+971501234567'],
  ['+32 (0)470 12 34 56', '+32470123456'],
  ['0049 151 23456789', '+4915123456789'],
  ['+46 070 123 45 67', '+46701234567'],
  ['+353 087 123 4567', '+353871234567'],
  ['+90 0532 123 45 67', '+905321234567'],
  ['+213 0550 12 34 56', '+213550123456'],
  ['+20 010 1234 5678', '+201012345678'],
  ['+966 050 123 4567', '+966501234567'],
  ['+351 912 345 678', '+351912345678'],
  ['+221 77 123 45 67', '+221771234567'],
]
const INVALID_PHONES = [
  '', '   ', '0412345678', '061234567', '06123456789', '+212 6 12 34 56 7',
  '+2126123456789', '+212 (0) 412345678', 'abc0612345678', '0612345678x',
  '33612345678', '+33', '+1234567', '+0612345678', '+1234567890123456', '++33612345678',
  '+33 6 12 34 56 78 poste 2',
]

test('login phones normalize to E.164 exactly like the server', () => {
  for (const [input, e164] of VALID_PHONES) assert.equal(normalizeLoginPhone(input), e164, input)
  for (const input of INVALID_PHONES) assert.equal(normalizeLoginPhone(input), null, input)
  assert.equal(normalizeLoginPhone(`06${' '.repeat(40)}12345678`), null)
})

test('display: familiar format in Morocco, country code abroad', () => {
  assert.equal(formatLoginPhone('+212612345678'), '06 12 34 56 78')
  assert.equal(formatLoginPhone('+212522123456'), '05 22 12 34 56')
  assert.equal(formatLoginPhone('+33612345678'), '+33 612345678')
  assert.equal(formatLoginPhone('+971501234567'), '+971 501234567')
  assert.equal(formatLoginPhone('+15145550123'), '+1 5145550123')
  assert.equal(formatLoginPhone('+99912345678'), '+99912345678')
  assert.equal(formatLoginPhone('0612345678'), '0612345678')
})

test('confirmation always shows the country, so a French 06 typed without +33 stands out', () => {
  assert.equal(formatLoginPhoneForConfirmation('+212612345678'), '🇲🇦 +212 6 12 34 56 78')
  assert.equal(formatLoginPhoneForConfirmation('+33612345678'), '🇫🇷 +33 612345678')
  assert.equal(formatLoginPhoneForConfirmation('+32470123456'), '🇧🇪 +32 470123456')
  assert.equal(formatLoginPhoneForConfirmation('+4915123456789'), '🇩🇪 +49 15123456789')
  assert.equal(formatLoginPhoneForConfirmation('+201012345678'), '🇪🇬 +20 1012345678')
  assert.equal(formatLoginPhoneForConfirmation('+15145550123'), '+1 5145550123')
  assert.equal(formatLoginPhoneForConfirmation('+99912345678'), '+99912345678')
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
  assert.equal(loginIdentifierLabel({ authPhoneE164: '+33612345678' }), '+33 612345678')
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
