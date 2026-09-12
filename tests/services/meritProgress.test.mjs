import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const output = ts.transpileModule(fs.readFileSync(new URL('../../src/utils/merit-progress.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const { meritProgress, behaviorPeriod } = module.exports
const merit = (date, extra = {}) => ({ date, kind: 'merite', reason: 'participation', ...extra })
test('Merits earn one point, warnings do not deduct points, cancelled entries are excluded', () => {
  const rows = [merit('2026-09-01'), merit('2026-09-02', { kind: 'avertissement' }), merit('2026-09-03', { cancelledAt: {} })]
  const result = meritProgress(rows, '2026-09-06')
  assert.equal(result.current, 1); assert.equal(result.warnings, 1); assert.equal(result.yearPoints, 1)
})
test('September starts a new school year and preserves August monthly comparison', () => {
  const result = meritProgress([merit('2026-08-31'), merit('2026-09-01')], '2026-09-06')
  assert.equal(result.yearPoints, 1); assert.equal(result.previous, 1)
  assert.equal(result.months.length, 6); assert.equal(result.months[0].key, '2026-04')
})
test('January trend crosses calendar years correctly', () => {
  const result = meritProgress([merit('2025-12-20'), merit('2026-01-02')], '2026-01-15')
  assert.equal(result.previous, 1); assert.equal(result.yearPoints, 2)
  assert.equal(result.months[0].key, '2025-08')
})
test('Period filters retain cancellations for history while totals exclude future dates', () => {
  const rows = [merit('2026-08-01'), merit('2026-09-01', { cancelledAt: {} }), merit('2026-10-01')]
  assert.equal(behaviorPeriod(rows, 'month', '2026-09-06').length, 1)
  assert.equal(behaviorPeriod(rows, 'all', '2026-09-06').length, 2)
  assert.equal(meritProgress(rows, '2026-09-06').current, 0)
})
test('Motif breakdown uses current active merits only and zero months stay zero', () => {
  const result = meritProgress([merit('2026-09-01'), merit('2026-09-02'), merit('2026-08-02', { reason: 'other' })], '2026-09-06')
  assert.deepEqual(result.reasons, [['participation', 2]])
  assert.equal(result.months[0].points, 0)
})
