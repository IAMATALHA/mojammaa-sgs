import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.resolve(here, '../../src/utils/academicPeriod.ts')
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
}).outputText
const moduleShim = { exports: {} }
new Function('require', 'module', 'exports', compiled)(() => {}, moduleShim, moduleShim.exports)

const { academicPeriodForDate, currentAndNextAcademicYears } = moduleShim.exports

assert.equal(academicPeriodForDate('2026-08-31').academicYear, '2025-2026')
assert.equal(academicPeriodForDate('2026-09-01').academicYear, '2026-2027')

assert.deepEqual(
  currentAndNextAcademicYears(new Date(2026, 7, 31, 12)),
  ['2025-2026', '2026-2027'],
  'le 31 août inclut l’année sortante et l’année des devoirs de rentrée',
)
assert.deepEqual(
  currentAndNextAcademicYears(new Date(2026, 8, 1, 12)),
  ['2026-2027', '2027-2028'],
  'le 1er septembre avance proprement la fenêtre scolaire',
)

console.log('academicPeriod : bascule du 31 août au 1er septembre couverte')
