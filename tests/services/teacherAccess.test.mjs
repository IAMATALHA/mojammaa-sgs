import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

// Service d'activation professeur (src/services/teacherAccessService.ts) avec
// des doublures de Firebase : aucun appel réseau. Les opérations serveur sont
// testées contre les émulateurs dans mojammaa-admin (teacherAccess.emulator.ts).
const source = fs.readFileSync(new URL('../../src/services/teacherAccessService.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function load() {
  const calls = []
  const state = {
    callables: {},
    signInEmail: async () => ({}),
    signInPhone: async () => {},
  }
  const stubs = {
    'firebase/auth': { signInWithEmailAndPassword: (_auth, email, password) => { calls.push(['email', email, password]); return state.signInEmail(email, password) } },
    'firebase/functions': {
      httpsCallable: (_functions, name) => async data => {
        calls.push(['callable', name, data])
        const handler = state.callables[name]
        if (!handler) throw new Error(`callable inattendue : ${name}`)
        return { data: await handler(data) }
      },
    },
    '../config/firebase': { auth: {}, functions: {} },
    './parentAuthService': {
      INVITATION_CODE_LENGTH: 10,
      normalizeInvitationCode: value => value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      signInParentWithPhone: async (phone, password) => { calls.push(['phone', phone, password]); return state.signInPhone(phone, password) },
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (!(name in stubs)) throw new Error(`module inattendu : ${name}`)
    return stubs[name]
  }, module, module.exports)
  return { api: module.exports, state, calls }
}

const refusal = reason => Object.assign(new Error('Message serveur jamais affiché +212612345678'), { code: 'functions/failed-precondition', details: { reason } })

test('motifs de refus : seul `details.reason` est lu, jamais le message', () => {
  const { api } = load()
  assert.equal(api.teacherAccessReason(refusal('expired')), 'expired')
  assert.equal(api.teacherAccessReason(refusal('phone-unavailable')), 'phone-unavailable')
  assert.equal(api.teacherAccessReason(refusal('motif-inconnu')), 'generic')
  assert.equal(api.teacherAccessReason(new Error('réseau')), 'generic')
  assert.equal(api.teacherAccessReason(new api.TeacherAccessFailure('signin')), 'signin')
})

test('code affiché pendant la saisie comme sur le message de l’école', () => {
  const { api } = load()
  assert.equal(api.formatInvitationCode('abc defg hjk'), 'ABC-DEFG-HJK')
  assert.equal(api.formatInvitationCode('ab'), 'AB')
  assert.equal(api.formatInvitationCode('ABC-DEFG-HJKXYZ'), 'ABC-DEFG-HJK')
})

test('code incomplet : refusé sans appel serveur', async () => {
  const { api, calls } = load()
  await assert.rejects(api.previewActivationCode('ABC-12'), error => error.reason === 'invalid-code')
  assert.deepEqual(calls, [])
})

test('activation : le serveur reçoit le code normalisé, puis la session s’ouvre avec le mot de passe choisi', async () => {
  const { api, state, calls } = load()
  state.callables.activateTeacherAccount = async () => ({ loginEmail: 't-cache@parents.mojammaa.invalid' })
  assert.deepEqual(await api.activateTeacher('abc-defg-hjk', '+212612345678', 'Choisi-2026!'), { signedIn: true })
  assert.deepEqual(calls, [
    ['callable', 'activateTeacherAccount', { code: 'ABCDEFGHJK', phone: '+212612345678', password: 'Choisi-2026!' }],
    ['email', 't-cache@parents.mojammaa.invalid', 'Choisi-2026!'],
  ])
})

test('activation réussie mais session non ouverte : signalé, sans redemander le code', async () => {
  const { api, state } = load()
  state.callables.activateTeacherAccount = async () => ({ loginEmail: 't@parents.mojammaa.invalid' })
  state.signInEmail = async () => { throw new Error('réseau') }
  assert.deepEqual(await api.activateTeacher('ABCDEFGHJK', '+212612345678', 'Choisi-2026!'), { signedIn: false })
})

test('réponse perdue puis nouvel essai : « déjà utilisé » ouvre la session avec les identifiants choisis', async () => {
  const { api, state, calls } = load()
  state.callables.activateTeacherAccount = async () => { throw refusal('used') }
  assert.deepEqual(await api.activateTeacher('ABCDEFGHJK', '+212612345678', 'Choisi-2026!'), { signedIn: true })
  assert.deepEqual(calls.at(-1), ['phone', '+212612345678', 'Choisi-2026!'])

  state.signInPhone = async () => { throw new Error('mauvais mot de passe') }
  await assert.rejects(api.activateTeacher('ABCDEFGHJK', '+212612345678', 'Autre-2026!'), error => error.reason === 'used')
})

test('compte déjà actif : connexion habituelle (e-mail ou numéro) puis rattachement', async () => {
  const { api, state, calls } = load()
  state.callables.linkTeacherInvitation = async () => ({ role: 'professeur', addedTeacherRole: false })
  assert.deepEqual(await api.signInAndLinkTeacher('ABC-DEFG-HJK', '+212612345678', 'Ancien-2026!', ' prof@ecole.test '), { role: 'professeur', addedTeacherRole: false })
  assert.deepEqual(calls.map(call => call[0] + ':' + call[1]), ['email:prof@ecole.test', 'callable:linkTeacherInvitation'])

  calls.length = 0
  state.callables.linkTeacherInvitation = async () => ({ role: 'professeur', addedTeacherRole: true })
  assert.equal((await api.signInAndLinkTeacher('ABCDEFGHJK', '+212612345678', 'Parent-2026!', '')).addedTeacherRole, true)
  assert.deepEqual(calls[0], ['phone', '+212612345678', 'Parent-2026!'])
})

test('identifiants refusés : aucun rattachement tenté', async () => {
  const { api, state, calls } = load()
  state.signInEmail = async () => { throw new Error('auth/invalid-credential') }
  await assert.rejects(api.signInAndLinkTeacher('ABCDEFGHJK', '+212612345678', 'faux', 'prof@ecole.test'), error => error.reason === 'signin')
  assert.ok(!calls.some(call => call[1] === 'linkTeacherInvitation'))
})

test('rattachement refusé par le serveur : motif transmis', async () => {
  const { api, state } = load()
  state.callables.linkTeacherInvitation = async () => { throw refusal('wrong-account') }
  await assert.rejects(api.linkTeacherInvitation('ABCDEFGHJK', '+212612345678'), error => error.reason === 'wrong-account')
})
