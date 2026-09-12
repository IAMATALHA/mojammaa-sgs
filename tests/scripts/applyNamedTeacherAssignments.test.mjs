import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ASSIGNMENTS, parseArgs } = require('../../scripts/demo/applyNamedTeacherAssignments.js')

test('déclare les classes collège dans les limites 1 à 4', () => {
  assert.equal(ASSIGNMENTS.length, 4)
  for (const row of ASSIGNMENTS.filter(x => x.role === 'professeur')) {
    assert.equal(row.classes.every(c => /^[123]APIC-[1-4]$/.test(c)), true)
  }
  assert.deepEqual(ASSIGNMENTS[0].classes, ['1APIC-1', '1APIC-2', '1APIC-3', '1APIC-4', '2APIC-1', '2APIC-2', '2APIC-3', '2APIC-4'])
  assert.deepEqual(ASSIGNMENTS[1].classes, ['3APIC-1', '3APIC-2', '3APIC-3', '3APIC-4'])
  assert.deepEqual(ASSIGNMENTS[2].classes, ['1APIC-3', '1APIC-4', '2APIC-3', '2APIC-4'])
})

test('parse la confirmation de mutation', () => {
  assert.deepEqual(parseArgs(['--commit', '--confirm-project=mojammaa-sgs', '--confirm-teachers', '4']), {
    commit: true, confirmProject: 'mojammaa-sgs', confirmTeachers: 4,
  })
})
