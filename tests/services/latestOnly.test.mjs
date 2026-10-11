import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

// « Seule la dernière demande compte » : vérification d'un code d'activation,
// lecture du lien de lancement (audit 1.0.18, F3 et F4).
function load(path) {
  const source = fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => { throw new Error(`module inattendu : ${name}`) }, module, module.exports)
  return module.exports
}
const { createLatestOnly } = load('utils/latest-only.ts')

test('une demande seule reste la dernière', () => {
  const latest = createLatestOnly().begin()
  assert.equal(latest(), true)
  assert.equal(latest(), true)
})

test('une demande plus récente périme la précédente, pas l’inverse', () => {
  const guard = createLatestOnly()
  const first = guard.begin()
  const second = guard.begin()
  assert.equal(first(), false)
  assert.equal(second(), true)
})

test('cancel périme la demande en cours ; la suivante repart valide', () => {
  const guard = createLatestOnly()
  const first = guard.begin()
  guard.cancel()
  assert.equal(first(), false)
  const next = guard.begin()
  assert.equal(next(), true)
  assert.equal(first(), false)
})

test('deux gardes ne se gênent pas', () => {
  const a = createLatestOnly(), b = createLatestOnly()
  const first = a.begin()
  b.begin(); b.cancel()
  assert.equal(first(), true)
})
