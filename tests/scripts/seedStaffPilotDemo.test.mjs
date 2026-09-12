import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DEMO_RUN_ID,
  FALLBACK_SUBJECT,
  STUDENTS_PER_CLASS,
  buildTeacherDataset,
  parseArgs,
  periodForISO,
  studentId,
} = require('../../scripts/demo/seedStaffPilotDemo.js')

function teacher(overrides = {}) {
  return {
    index: 1,
    matiere: 'Mathématiques',
    cycle: 'college',
    testClass: 'TEST-2026-09-01-P01',
    provisioningTag: 'staff-pilot-2026-09-01',
    ...overrides,
  }
}

test('construit une démo synthétique déterministe et bornée à la classe TEST', () => {
  const dataset = buildTeacherDataset(teacher(), 'uid-test', 'Professeur Démo')
  assert.equal(dataset.students.length, STUDENTS_PER_CLASS)
  assert.equal(dataset.notes.length, STUDENTS_PER_CLASS)
  assert.equal(dataset.absences.length, 3)
  assert.equal(dataset.comportements.length, 2)
  assert.equal(dataset.devoirs.length, 1)
  assert.equal(dataset.ressources.length, 1)
  assert.equal(dataset.students.every(row => row.data.classe === teacher().testClass), true)
  assert.equal(dataset.students.every(row => row.data.demoRunId === DEMO_RUN_ID), true)
  assert.equal(dataset.students.every(row => row.data.isTestData === true), true)
  assert.equal(dataset.notes.every(row => row.data.matiere === 'Mathématiques'), true)
})

test('utilise des identifiants clairement synthétiques sans collision entre classes', () => {
  assert.equal(studentId('TEST-2026-09-01-P01', 1), 'DEMO-20260902-P01-01')
  assert.notEqual(studentId('TEST-2026-09-01-P01', 1), studentId('TEST-2026-09-01-P02', 1))
})

test('applique une matière de démonstration explicite au profil sans matière', () => {
  const dataset = buildTeacherDataset(teacher({ matiere: FALLBACK_SUBJECT }), 'uid-test', 'Professeur Démo')
  assert.equal(dataset.subject, FALLBACK_SUBJECT)
  assert.equal(dataset.notes.every(row => row.data.matiere === FALLBACK_SUBJECT), true)
})

test('calcule la période scolaire marocaine de septembre', () => {
  assert.deepEqual(periodForISO('2026-09-02'), {
    academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-09',
  })
})

test('parse les confirmations explicites du commit et du cleanup', () => {
  assert.deepEqual(parseArgs([
    '--manifest=.secrets/pilot.json', '--commit', '--cleanup',
    '--confirm-project', 'mojammaa-sgs', '--confirm-teachers=8', '--confirm-students', '80',
  ]), {
    manifest: '.secrets/pilot.json', commit: true, cleanup: true,
    confirmProject: 'mojammaa-sgs', confirmTeachers: 8, confirmStudents: 80,
  })
})
