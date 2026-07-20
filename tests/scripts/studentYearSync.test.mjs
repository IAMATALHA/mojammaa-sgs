import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  assertArchiveConfirmation,
  buildStudentYearSyncPlan,
  isStudentActive,
  normalizeAcademicYear,
} = require('../../scripts/lib/studentYearSync')

assert.equal(normalizeAcademicYear('2026-2027'), '2026-2027')
assert.throws(
  () => normalizeAcademicYear('2026/2027'),
  /Année scolaire invalide/,
)
assert.throws(
  () => normalizeAcademicYear('2026-2028'),
  /Année scolaire invalide/,
)

assert.equal(isStudentActive({}), true, 'un ancien document sans active reste actif')
assert.equal(isStudentActive({ active: false }), false)

const plan = buildStudentYearSyncPlan({
  academicYear: '2026-2027',
  archiveMissing: true,
  existingStudents: [
    { id: 'A1', codeMassar: 'A1', active: true, parentUid: 'parent-a' },
    { id: 'B1', codeMassar: 'B1', parentUid: 'parent-b' },
    { id: 'C1', codeMassar: 'C1', active: false, parentUid: 'parent-c' },
  ],
  importedStudents: [
    { codeMassar: 'A1', classe: '2APIC-1' },
    { codeMassar: 'C1', classe: '3APIC-1' },
    { codeMassar: 'D1', classe: '1APIC-1' },
  ],
})

assert.deepEqual(plan.counts, {
  imported: 3,
  existing: 3,
  new: 1,
  updated: 1,
  reactivated: 1,
  archived: 1,
  alreadyArchived: 0,
})
assert.deepEqual(plan.toArchive.map(student => student.id), ['B1'])
assert.equal(plan.toArchive[0].parentUid, 'parent-b', 'le plan conserve le lien parent')

assert.throws(
  () => buildStudentYearSyncPlan({
    academicYear: '2026-2027',
    importedStudents: [{ codeMassar: 'A1' }, { codeMassar: 'A1' }],
  }),
  /dupliqué/,
)
assert.throws(
  () => buildStudentYearSyncPlan({
    academicYear: '2026-2027',
    existingStudents: [
      { id: 'legacy-a', codeMassar: 'A1' },
      { id: 'legacy-b', codeMassar: 'A1' },
    ],
    importedStudents: [{ codeMassar: 'A1' }],
  }),
  /base Firestore.*dupliqué/,
)
assert.throws(
  () => buildStudentYearSyncPlan({
    academicYear: '2026-2027',
    importedStudents: [],
  }),
  /Aucun élève/,
)

assert.doesNotThrow(() => assertArchiveConfirmation(1, '1'))
assert.throws(() => assertArchiveConfirmation(1, '0'), /confirm-archive=1/)

console.log('studentYearSync: 11 tests OK')
