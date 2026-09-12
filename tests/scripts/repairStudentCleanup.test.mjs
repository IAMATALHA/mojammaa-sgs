import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { revive, mentions, periodFor } = require('../../scripts/repairStudentCleanup')

test('restoration preserves Firestore timestamp precision and nested arrays', () => {
  const value = revive({ createdAt: { _seconds: 1000, _nanoseconds: 123456789 },
    children: [{ at: { _seconds: 2000, _nanoseconds: 42 }, enabled: false }], optional: null })
  assert.equal(value.createdAt.seconds, 1000)
  assert.equal(value.createdAt.nanoseconds, 123456789)
  assert.equal(value.children[0].at.nanoseconds, 42)
  assert.equal(value.children[0].enabled, false)
  assert.equal(value.optional, null)
})

test('cleanup matches deleted identifiers exactly, including nested recipients', () => {
  const removed = new Set(['old-parent'])
  assert.equal(mentions({ toIds: ['old-parent'] }, removed), true)
  assert.equal(mentions({ targets: [{ uid: 'old-parent' }] }, removed), true)
  assert.equal(mentions({ toIds: ['old-parent-2'], subject: 'old-parent mentioned in prose' }, removed), false)
  assert.equal(mentions(null, removed), false)
})

test('summary period uses Casablanca school year and semesters', () => {
  assert.deepEqual(periodFor(new Date('2026-09-10T12:00:00Z')), {
    academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-09',
  })
  assert.deepEqual(periodFor(new Date('2026-08-10T12:00:00Z')), {
    academicYear: '2025-2026', semestre: 'S2', monthKey: '2026-08',
  })
})
