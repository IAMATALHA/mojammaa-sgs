import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { test } from 'node:test'

const require = createRequire(import.meta.url)

// Liens d'activation ouverts dans l'application (Android App Links) : seuls
// les deux chemins déclarés dans app.json sont reconnus, et la configuration
// native doit rester alignée sur les liens que l'administration envoie.
function load(path, deps = {}) {
  const source = fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (name in deps) return deps[name]
    throw new Error(`module inattendu : ${name}`)
  }, module, module.exports)
  return module.exports
}
const { parseActivationLink, authRoutesForLink } = load('utils/activation-link.ts')
const access = load('utils/admin-access.ts', { './parentIdentity': load('utils/parentIdentity.ts') })

test('lien parent : code repris après « # »', () => {
  assert.deepEqual(parseActivationLink('https://mojammaa.com/parents/activer#ABC-DEFG-HJK'), { kind: 'parent', code: 'ABC-DEFG-HJK' })
  assert.deepEqual(parseActivationLink(access.parentActivationUrl('ABC-DEFG-HJK')), { kind: 'parent', code: 'ABC-DEFG-HJK' })
})

test('lien professeur : même forme que celle du serveur (mojammaa.com/activer#CODE)', () => {
  assert.deepEqual(parseActivationLink('https://mojammaa.com/activer#XYZ-2345-ABC'), { kind: 'account', code: 'XYZ-2345-ABC' })
})

test('code sans tirets, en minuscules ou encodé : remis en forme', () => {
  assert.equal(parseActivationLink('https://mojammaa.com/parents/activer#abcdefghjk').code, 'ABC-DEFG-HJK')
  assert.equal(parseActivationLink('https://mojammaa.com/activer/#ABC%2DDEFG%2DHJK').code, 'ABC-DEFG-HJK')
  assert.equal(parseActivationLink('  https://mojammaa.com/activer?x=1#ABC-DEFG-HJK ').code, 'ABC-DEFG-HJK')
})

test('lien sans code entier : l’écran s’ouvre, code à saisir', () => {
  assert.deepEqual(parseActivationLink('https://mojammaa.com/activer'), { kind: 'account', code: '' })
  assert.deepEqual(parseActivationLink('https://mojammaa.com/parents/activer#ABC'), { kind: 'parent', code: '' })
  assert.deepEqual(parseActivationLink('https://mojammaa.com/activer#%E0%A4%A'), { kind: 'account', code: '' })
})

test('autres adresses : ignorées', () => {
  for (const url of [
    null, undefined, '',
    'https://mojammaa.com/',
    'https://mojammaa.com/reset-password#ABC-DEFG-HJK',
    'https://mojammaa.com/activer/autre#ABC-DEFG-HJK',
    'https://mojammaa.com/parents#ABC-DEFG-HJK',
    'http://mojammaa.com/activer#ABC-DEFG-HJK',
    'https://mojammaa.com.evil.example/activer#ABC-DEFG-HJK',
    'https://evil.example/https://mojammaa.com/activer#ABC-DEFG-HJK',
    'https://www.mojammaa.com/activer#ABC-DEFG-HJK',
    'exp+mojammaa-sgs://activer#ABC-DEFG-HJK',
  ]) assert.equal(parseActivationLink(url), null, String(url))
})

test('app.json : seuls les deux chemins d’activation de mojammaa.com, vérifiés', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../app.json', import.meta.url), 'utf8')).expo
  const filters = config.android.intentFilters
  assert.equal(filters.length, 1)
  const [filter] = filters
  assert.equal(filter.action, 'VIEW')
  assert.equal(filter.autoVerify, true)
  assert.deepEqual(filter.category, ['BROWSABLE', 'DEFAULT'])
  assert.deepEqual(filter.data, [
    { scheme: 'https', host: 'mojammaa.com', path: '/activer' },
    { scheme: 'https', host: 'mojammaa.com', path: '/parents/activer' },
  ])
  // Chaque chemin déclaré est reconnu par l'application, et rien d'autre.
  for (const { scheme, host, path } of filter.data) assert.ok(parseActivationLink(`${scheme}://${host}${path}#ABC-DEFG-HJK`))
})

// ── Pile de connexion après un lien (audit 1.0.18, F2 et F5) ────────────────
// Routeur réel de React Navigation : mêmes règles que dans l'application.
function authStack(pushed = []) {
  const { StackRouter, StackActions } = require('@react-navigation/routers')
  const options = { routeNames: ['Login', 'AccountActivation', 'ParentActivation'], routeParamList: {}, routeGetIdList: {} }
  const router = StackRouter({ initialRouteName: 'Login' })
  let state = router.getInitialState(options)
  const apply = action => { state = router.getStateForAction(state, action, options) ?? state }
  for (const name of pushed) apply(StackActions.push(name))
  return {
    get state() { return state },
    get names() { return state.routes.map(route => route.name) },
    get top() { return state.routes[state.index] },
    open(url) { state = router.getRehydratedState(authRoutesForLink(state.routes, parseActivationLink(url)), options) },
    popToTop() { apply(StackActions.popToTop()) },
  }
}

test('lien reçu sur la connexion : Login gardé, écran d’activation par-dessus avec le code', () => {
  const stack = authStack()
  const loginKey = stack.state.routes[0].key
  stack.open('https://mojammaa.com/parents/activer#ABC-DEFG-HJK')
  assert.deepEqual(stack.names, ['Login', 'ParentActivation'])
  assert.equal(stack.state.routes[0].key, loginKey)
  assert.deepEqual(stack.top.params, { code: 'ABC-DEFG-HJK' })
})

test('lien reçu depuis « Activer mon compte » : pas d’empilement, le retour à la connexion reste direct', () => {
  const stack = authStack(['AccountActivation'])
  const manual = stack.top.key
  stack.open('https://mojammaa.com/parents/activer#ABC-DEFG-HJK')
  assert.deepEqual(stack.names, ['Login', 'ParentActivation'])
  stack.open('https://mojammaa.com/activer#XYZ-2345-ABC')
  assert.deepEqual(stack.names, ['Login', 'AccountActivation'])
  assert.notEqual(stack.top.key, manual, 'écran neuf, pas celui ouvert à la main')
  stack.popToTop()
  assert.equal(stack.top.name, 'Login')
})

test('deux liens de suite vers le même écran : deux écrans distincts, le second sans le code du premier', () => {
  const stack = authStack()
  stack.open('https://mojammaa.com/activer#ABC-DEFG-HJK')
  const first = stack.top.key
  stack.open('https://mojammaa.com/activer')
  assert.notEqual(stack.top.key, first)
  assert.deepEqual(stack.top.params, { code: '' })
  assert.deepEqual(stack.names, ['Login', 'AccountActivation'])
})

test('pile inconnue (navigation pas encore lue) : Login recréé plutôt qu’un écran d’activation seul', () => {
  const link = parseActivationLink('https://mojammaa.com/activer#ABC-DEFG-HJK')
  assert.deepEqual(authRoutesForLink(undefined, link), {
    index: 1,
    routes: [{ name: 'Login' }, { name: 'AccountActivation', params: { code: 'ABC-DEFG-HJK' } }],
  })
})

// ── Activité Android (audit 1.0.18, F1) ─────────────────────────────────────
// Le JavaScript ne filtre plus les liens : c'est l'activité qui retire le lien
// d'un lancement rejoué et garde celui touché avant que React soit prêt.
const MAIN_ACTIVITY = `package com.example

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`

test('plugin : lien rejoué retiré AVANT super.onCreate, onNewIntent garde l’intent', () => {
  const { patchMainActivity } = require('../../plugins/with-launch-link-intent.js')
  const patched = patchMainActivity(MAIN_ACTIVITY)
  const strip = patched.indexOf('intent = android.content.Intent(intent).setData(null)')
  const create = patched.indexOf('super.onCreate(null)')
  const newIntent = patched.indexOf('override fun onNewIntent(intent: android.content.Intent)')
  assert.ok(strip > 0 && strip < create, 'retrait avant super.onCreate')
  assert.match(patched, /savedInstanceState != null \|\| \(intent\.flags and android\.content\.Intent\.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY\) != 0/)
  assert.ok(newIntent > create && newIntent < patched.indexOf('override fun getMainComponentName'), 'onNewIntent entre onCreate et la suite')
  assert.match(patched, /setIntent\(intent\)\n\s+super\.onNewIntent\(intent\)/)
  // Accolades équilibrées : le bloc ajouté ne casse pas la classe.
  assert.equal(patched.split('{').length, patched.split('}').length)
  assert.equal(patchMainActivity(patched), patched, 'rejouable sans doublon')
})

test('plugin : modèle inattendu → erreur, jamais un build silencieusement sans la garde', () => {
  const { patchMainActivity } = require('../../plugins/with-launch-link-intent.js')
  assert.throws(() => patchMainActivity('class MainActivity : ReactActivity() {}'))
  assert.throws(() => patchMainActivity(MAIN_ACTIVITY.replace('  override fun getMainComponentName', '  override fun onNewIntent(intent: Intent) {}\n  override fun getMainComponentName')), /onNewIntent/)
})

test('app.json : le plugin de l’activité est déclaré avec les liens', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../app.json', import.meta.url), 'utf8')).expo
  assert.ok(config.plugins.includes('./plugins/with-launch-link-intent'))
})
