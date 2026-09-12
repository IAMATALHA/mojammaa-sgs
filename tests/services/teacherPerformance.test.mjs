import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../../src/utils/teacher-performance.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const module = { exports: {} }
new Function('module', 'exports', output)(module, module.exports)
const { performanceNumber, performanceScore, recordedAttendance, rankPerformance } = module.exports

test('No grades never produces a score, even with perfect recorded attendance', () => {
  for (const presence of [null, 0, 84, 100]) {
    const score = performanceScore(null, 0, presence, null)
    assert.equal(score.healthScore, null)
    assert.equal(score.gradeScore, null)
    assert.equal(score.trendScore, null)
  }
})

test('Blank grade fields stay absent, but a real zero and decimal comma are valid', () => {
  for (const value of ['', '   ', null, undefined, NaN, Infinity, 'invalid']) {
    assert.equal(performanceNumber(value), null)
  }
  assert.equal(performanceNumber(0), 0)
  assert.equal(performanceNumber('0'), 0)
  assert.equal(performanceNumber(' 12,5 '), 12.5)
  assert.equal(performanceScore(0, 100, null, null).gradeScore, 0)
})

test('Attendance is unknown without calls and reflects recorded student sessions', () => {
  assert.deepEqual(recordedAttendance([]), { count: 0, presence: null })
  const call = (eleveId, seance, statut) => ({ eleveId, date: '2026-09-10', seance, statut })
  const rows = [call('test-1', 'S1', 'present'), call('test-1', 'S2', 'absent'), call('test-2', 'S1', 'retard')]
  const result = recordedAttendance(rows)
  assert.equal(result.count, 3)
  assert.ok(Math.abs(result.presence - 200 / 3) < 0.0001)
  assert.deepEqual(recordedAttendance([...rows, rows[0], call('test-1', 'S2', 'present')]), result)
  assert.deepEqual(recordedAttendance([call('', 'S1', 'present'), call('test-1', '', 'present'), call('test-1', 'S1', 'unknown')]), { count: 0, presence: null })
})

test('Missing attendance and trend are excluded instead of receiving invented values', () => {
  const score = performanceScore(14, 100, null, null)
  assert.equal(score.healthScore, 81) // (70 × 42 + 100 × 26) / 68
  assert.equal(score.absenceScore, null)
  assert.equal(score.trendScore, null)
  assert.equal(score.weights.presence, 0)
  assert.equal(score.weights.trend, 0)
  assert.ok(Math.abs(Object.values(score.weights).reduce((sum, weight) => sum + weight, 0) - 100) < 0.0001)
})

test('Measured S2 change and attendance keep their contribution when available', () => {
  const score = performanceScore(14, 100, 80, 2)
  assert.equal(score.trendScore, 74)
  assert.equal(score.healthScore, 80)
  assert.deepEqual(score.weights, { notes: 42, coverage: 26, presence: 22, trend: 10 })
  assert.equal(performanceScore(14, 100, 0, -2).absenceScore, 0)
  assert.equal(performanceScore(14, 100, 80, 0).trendScore, 58)
})

test('Insufficient grades do not create strongest/focus rankings, including mixed lists', () => {
  assert.equal(performanceScore(14, 69, 100, null).healthScore, null)
  assert.notEqual(performanceScore(14, 70, 100, null).healthScore, null)
  const empty = { name: 'Empty', healthScore: null }
  const high = { name: 'High', healthScore: 90 }
  const low = { name: 'Low', healthScore: 40 }
  assert.deepEqual(rankPerformance([empty]), [])
  assert.deepEqual(rankPerformance([empty, low, high]).map(item => item.name), ['High', 'Low'])
})
