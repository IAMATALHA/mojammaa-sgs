import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

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
const { parseActivationLink } = load('utils/activation-link.ts')
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
