import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeAdminHome } from '../../src/utils/admin-home-summary.ts'

const session = (classe, seance, timing = 'past', done = false) => ({ classe, seance, timing, done })
test('upcoming lessons never make a class late or incomplete', () => {
  const value = summarizeAdminHome([session('A', 'S1', 'past', true), session('A', 'S2', 'upcoming'), session('B', 'S2', 'upcoming')], false)
  assert.equal(value.expectedClasses, 1)
  assert.equal(value.completedClasses, 1)
  assert.equal(value.status, 'complete')
})
test('a partially recorded class stays incomplete; duplicate slots do not inflate missing calls', () => {
  const value = summarizeAdminHome([session('A', 'S1', 'past', true), session('A', 'S2'), session('A', 'S2'), session('B', 'S1', 'current', true)], false)
  assert.equal(value.expectedClasses, 2)
  assert.equal(value.completedClasses, 1)
  assert.deepEqual(value.missingClasses, [{ classe: 'A', missingCalls: 1 }])
})
test('no schedule and future-only schedules never claim that attendance is complete', () => {
  assert.equal(summarizeAdminHome([], false).status, 'unplanned')
  assert.equal(summarizeAdminHome([session('A', 'S1', 'upcoming')], false).status, 'upcoming')
})
test('no recorded calls means pending, not all-good', () => {
  const value = summarizeAdminHome([session('A', 'S1'), session('B', 'S1', 'current')], false)
  assert.equal(value.completedClasses, 0)
  assert.equal(value.status, 'pending')
  assert.equal(value.missingClasses.length, 2)
})
test('school closure suppresses attendance alerts even with scheduled lessons', () => {
  assert.deepEqual(summarizeAdminHome([session('A', 'S1')], true), {
    expectedClasses: 0, completedClasses: 0, missingClasses: [], status: 'closed',
  })
})
