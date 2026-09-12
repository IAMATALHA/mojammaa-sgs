import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ASSIGNMENTS } = require('../../scripts/demo/applyNamedTeacherAssignments.js')
const { buildSchedule } = require('../../scripts/demo/seedNamedTeacherSchedules.js')

test('génère une semaine de 20 créneaux par professeur nommé', () => {
  for (const assignment of ASSIGNMENTS.filter(row => row.role === 'professeur')) {
    const schedule = buildSchedule(assignment)
    assert.equal(schedule.length, 20)
    assert.equal(new Set(schedule.map(slot => `${slot.classe}|${slot.day}|${slot.startTime}`)).size, 20)
    assert.equal(schedule.every(slot => assignment.classes.includes(slot.classe)), true)
  }
})
