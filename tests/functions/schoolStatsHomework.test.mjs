import assert from 'node:assert/strict'
import schoolStats from '../../functions/schoolStats.js'

const { computeSchoolStats } = schoolStats

const result = computeSchoolStats({
  eleves: [
    { id: 'e1', codeMassar: 'e1', classe: '1A' },
    { id: 'e2', codeMassar: 'e2', classe: '1A' },
    { id: 'e3', codeMassar: 'e3', classe: '1A' },
    { id: 'e4', codeMassar: 'e4', classe: '1A' },
  ],
  users: [],
  notes: [],
  absences: [],
  devoirs: [
    { id: 'd1', classeId: '1A', dateLimite: '2000-01-01' },
  ],
  homeworkSubmissions: [
    { id: 'd1_e1', homeworkId: 'd1', eleveId: 'e1', status: 'submitted_late' },
    { id: 'd1_e2', homeworkId: 'd1', eleveId: 'e2', status: 'not_done' },
    { id: 'd1_e3', homeworkId: 'd1', eleveId: 'e3', status: 'graded' },
  ],
})

assert.equal(
  result.studentsToFollow,
  1,
  'seul le devoir explicitement non fait doit créer une alerte ; une ligne absente ne doit rien inventer',
)

console.log('schoolStats homework: statut explicite uniquement, aucune alerte inventée')
