import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.resolve(here, '../../src/services/NotesImport.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText

const moduleShim = { exports: {} }
const notesRulesStub = {
  averageControlNotes: values => values.reduce((sum, value) => sum + value, 0) / values.length,
  makeControlNotes: () => [],
}
new Function('require', 'module', 'exports', compiled)(
  id => {
    if (id === './notesRules') return notesRulesStub
    throw new Error(`Unexpected dependency while loading NotesImport: ${id}`)
  },
  moduleShim,
  moduleShim.exports,
)

const { assignExpectedControlSlots } = moduleShim.exports
assert.equal(typeof assignExpectedControlSlots, 'function')

const frenchSlots = [
  { slot: 'comprehension_1', kind: 'comprehension', label: 'Compréhension et langue 1' },
  { slot: 'comprehension_2', kind: 'comprehension', label: 'Compréhension et langue 2' },
  { slot: 'production_1', kind: 'production', label: 'Production écrite 1' },
  { slot: 'production_2', kind: 'production', label: 'Production écrite 2' },
]

{
  const reordered = assignExpectedControlSlots([
    { label: 'Production écrite 2', category: 'control' },
    { label: 'Compréhension et langue 1', category: 'control' },
    { label: 'Production écrite 1', category: 'control' },
    { label: 'Compréhension et langue 2', category: 'control' },
    { label: 'Activités intégrées', category: 'integrated' },
  ], frenchSlots)

  assert.deepEqual(
    reordered.slice(0, 4).map(column => column.slot),
    ['production_2', 'comprehension_1', 'production_1', 'comprehension_2'],
    'les libellés français gardent leur sens même si les colonnes Excel sont réordonnées',
  )
  assert.equal(reordered[4].slot, undefined, 'l’activité intégrée ne devient jamais un contrôle')
}

{
  const ordinalOnly = assignExpectedControlSlots([
    { label: 'Contrôle 2', category: 'control' },
    { label: 'Contrôle 1', category: 'control' },
  ], frenchSlots)

  assert.deepEqual(
    ordinalOnly.map(column => column.slot),
    ['comprehension_2', 'comprehension_1'],
    'un libellé C2/C1 suit son ordinal et non la position de la colonne',
  )
}

{
  const legacy = assignExpectedControlSlots([
    { label: 'Note A', category: 'control' },
    { label: 'Note B', category: 'control' },
  ])

  assert.deepEqual(
    legacy.map(column => column.ordinal),
    [1, 2],
    'les imports sans politique conservent le comportement ordinal historique',
  )
}

console.log('notesImportMapping : libellés métier, colonnes réordonnées et repli legacy')
