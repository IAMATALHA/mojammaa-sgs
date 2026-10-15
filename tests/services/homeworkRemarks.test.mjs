// Remarque du professeur sur un rendu : nettoyage à la lecture et liste
// identique à celle de firestore.rules (validTeacherRemark).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = fs.readFileSync(path.join(root, 'src/utils/homeworkRemarks.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', js)(mod, mod.exports)
const { HOMEWORK_REMARK_TAGS, HOMEWORK_REMARK_LIMITS, safeRemark, hasRemark } = mod.exports

test('the quick remarks list matches firestore.rules', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8')
  const block = rules.slice(rules.indexOf('function validTeacherRemark'), rules.indexOf('function validHomeworkSubmissionStatus'))
  const keys = [...block.slice(block.indexOf('hasOnly(')).matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.deepEqual([...keys].sort(), [...HOMEWORK_REMARK_TAGS].sort())
  assert.match(block, new RegExp(`size\\(\\) <= ${HOMEWORK_REMARK_LIMITS.comment}`))
  assert.match(block, new RegExp(`size\\(\\) <= ${HOMEWORK_REMARK_TAGS.length}`))
})

test('safeRemark drops unknown tags, keeps list order and bounds the text', () => {
  const remark = safeRemark(`  ${'x'.repeat(600)}  `, ['a_refaire', 'inconnu', 42, 'bon_travail'])
  assert.equal(remark.comment.length, 500)
  assert.deepEqual(remark.tags, ['bon_travail', 'a_refaire'])
  assert.deepEqual(safeRemark(undefined, 'x'), { comment: '', tags: [] })
  assert.equal(hasRemark(safeRemark('', [])), false)
  assert.equal(hasRemark(safeRemark('', ['cahier_oublie'])), true)
})
