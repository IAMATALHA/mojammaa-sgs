import assert from 'node:assert/strict'
import schoolStats from '../../functions/schoolStats.js'

const { computeSchoolStats } = schoolStats

const result = computeSchoolStats({
  eleves: [
    { id: 'e1', codeMassar: 'e1', classe: '1A' },
    { id: 'e2', codeMassar: 'e2', classe: '1A' },
    { id: 'e3', codeMassar: 'e3', classe: '1A' },
    { id: 'e4', codeMassar: 'e4', classe: '1A', active: false },
  ],
  users: [],
  notes: [
    { id: 'n4', eleveId: 'e4', classe: '1A', note: 0, matiere: 'math' },
  ],
  absences: [
    { id: 'a4', eleveId: 'e4', classe: '1A', date: '2000-01-01', statut: 'absent' },
  ],
  devoirs: [
    { id: 'd1', classeId: '1A', dateLimite: '2000-01-01' },
  ],
  homeworkSubmissions: [
    { id: 'd1_e1', homeworkId: 'd1', eleveId: 'e1', status: 'submitted_late' },
    { id: 'd1_e2', homeworkId: 'd1', eleveId: 'e2', status: 'not_done' },
    { id: 'd1_e3', homeworkId: 'd1', eleveId: 'e3', status: 'graded' },
    { id: 'd1_e4', homeworkId: 'd1', eleveId: 'e4', status: 'not_done' },
  ],
})

assert.equal(result.totalEleves, 3, 'un élève archivé ne compte plus dans les effectifs courants')
assert.equal(result.notesCount, 0, 'les notes d’un élève archivé restent hors des statistiques courantes')
assert.equal(
  result.studentsToFollow,
  1,
  'un devoir non fait par un élève archivé ne doit pas créer une alerte courante',
)

console.log('schoolStats homework: archives exclues et statut explicite uniquement')
