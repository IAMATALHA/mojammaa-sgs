import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { syntheticMoroccanName } = require('../../scripts/demo/lib/syntheticMoroccanNames.js')
const {
  CLASSES, RUN_ID, STUDENTS_PER_CLASS,
  buildSchedule, buildSimulation, parseArgs, studentId,
} = require('../../scripts/demo/seedTestTeacherSchoolSimulation.js')

test('génère 60 identités marocaines fictives et non des libellés Démonstration', () => {
  const simulation = buildSimulation('teacher-test-uid', 'Enseignant Test')
  assert.equal(simulation.students.length, CLASSES.length * STUDENTS_PER_CLASS)
  assert.equal(simulation.students.every(row => row.data.isTestData === true), true)
  assert.equal(simulation.students.every(row => row.data.demoRunId === RUN_ID), true)
  assert.equal(simulation.students.every(row => row.data.nom !== 'Démonstration'), true)
  assert.equal(simulation.students.every(row => row.data.nomLatin && row.data.prenomLatin), true)
  assert.equal(new Set(simulation.students.map(row => `${row.data.classe}:${row.data.nomComplet}`)).size, 60)
})

test('construit quatre séances par jour du lundi au vendredi', () => {
  const schedule = buildSchedule()
  assert.equal(schedule.length, 20)
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) {
    assert.equal(schedule.filter(slot => slot.day === day).length, 4)
  }
  assert.equal(schedule.every(slot => CLASSES.includes(slot.classe)), true)
})

test('construit toutes les briques de la simulation scolaire', () => {
  const simulation = buildSimulation('teacher-test-uid', 'Enseignant Test')
  assert.equal(simulation.notes.length, 60)
  assert.equal(simulation.absences.length, 12)
  assert.equal(simulation.comportements.length, 12)
  assert.equal(simulation.devoirs.length, 6)
  assert.equal(simulation.ressources.length, 3)
})

test('les identifiants sont synthétiques et stables', () => {
  assert.equal(studentId('1APIC-1', 1), 'DEMO-2026-1APIC-1-01')
  assert.notEqual(studentId('1APIC-1', 1), studentId('2APIC-1', 1))
  assert.deepEqual(syntheticMoroccanName(0, 20), syntheticMoroccanName(0, 20))
})

test('utilise des libellés scolaires normaux et les niveaux APIC attendus', () => {
  assert.deepEqual(CLASSES, ['1APIC-1', '2APIC-1', '3APIC-3'])
  assert.equal(CLASSES.some(classe => classe.startsWith('DEMO-')), false)
  const simulation = buildSimulation('teacher-test-uid', 'Enseignant Test')
  assert.deepEqual([...new Set(simulation.students.map(row => row.data.niveau))], ['1APIC', '2APIC', '3APIC'])
})

test('parse les confirmations de production', () => {
  assert.deepEqual(parseArgs([
    '--commit', '--confirm-project=mojammaa-sgs',
    '--confirm-classes', '3', '--confirm-students=60',
  ]), {
    commit: true, cleanup: false, confirmProject: 'mojammaa-sgs',
    confirmClasses: 3, confirmStudents: 60,
  })
})
