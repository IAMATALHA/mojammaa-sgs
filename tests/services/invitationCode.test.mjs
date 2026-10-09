import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Code d'activation collé depuis WhatsApp (src/services/parentAuthService.ts).
// WhatsApp ne copie que le message entier : on rejoue les VRAIS messages que
// l'administration prépare (src/utils/admin-access.ts). Aucun appel Firebase.
function load(file, dependencies = {}) {
  const output = ts.transpileModule(
    fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const auth = load('services/parentAuthService.ts', {
  'firebase/auth': { signInWithEmailAndPassword: async () => { throw new Error('no network in tests') } },
  'firebase/functions': { httpsCallable: () => async () => { throw new Error('no network in tests') } },
  '../config/firebase': { auth: {}, functions: {} },
})
const identity = load('utils/parentIdentity.ts')
const access = load('utils/admin-access.ts', { './parentIdentity': identity })

const CODE = 'ABC-DEFG-HJK'
const teacherMessage = access.teacherInvitationMessage('Fictif', { code: CODE, url: `https://mojammaa.com/activer#${CODE}`, mode: 'activation' }, '16 octobre à 14:30')
const parentMessage = access.parentCodeMessage({ studentId: 'x', studentName: 'Élève Fictif', classe: '2APIC-1', code: CODE })

test('a whole WhatsApp invitation pasted in the code field gives back its code', () => {
  // Avant : les dix premières lettres du message (« BON-JOUR-FIC »), refusées par le serveur.
  assert.notEqual(auth.normalizeInvitationCode(teacherMessage).slice(0, 10), auth.normalizeInvitationCode(CODE))
  assert.equal(auth.invitationCodeFromText(teacherMessage), CODE)
  assert.equal(auth.invitationCodeFromText(parentMessage), CODE)
  assert.equal(auth.invitationCodeFromText(teacherMessage.replace(/\n+/g, ' ')), CODE, 'single-line paste')
})

test('a pasted link or a lowercase code is recognised too', () => {
  assert.equal(auth.invitationCodeFromText(`https://mojammaa.com/parents/activer#${CODE}`), CODE)
  assert.equal(auth.invitationCodeFromText('abc-defg-hjk'), CODE)
  assert.equal(auth.invitationCodeFromText(` ${CODE} `), CODE)
})

test('manual typing keeps its current behaviour', () => {
  assert.equal(auth.invitationCodeFromText('ABC-DEFG-HJ'), null, 'incomplete code while typing')
  assert.equal(auth.invitationCodeFromText('ABCDEFGHJK'), null, 'unformatted input: left to normalisation')
  assert.equal(auth.invitationCodeFromText(''), null)
})

test('ambiguous or foreign text is never turned into a code', () => {
  assert.equal(auth.invitationCodeFromText(`${CODE} puis XYZ-WXYZ-UVW`), null, 'two different codes')
  assert.equal(auth.invitationCodeFromText(`${CODE} et ${CODE}`), CODE, 'same code twice (link + code line)')
  assert.equal(auth.invitationCodeFromText('ABO-DEFG-HJK'), null, 'O is not in the server alphabet')
  assert.equal(auth.invitationCodeFromText('AB1-DEFG-HJK'), null, '1 is not in the server alphabet')
  assert.equal(auth.invitationCodeFromText('XABC-DEFG-HJK'), null, 'no partial match inside a longer token')
})
