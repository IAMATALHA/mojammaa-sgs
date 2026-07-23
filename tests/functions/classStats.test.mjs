import assert from 'node:assert/strict'
import classStats from '../../functions/classStats.js'

const { computeClassStats } = classStats

function note(id, value, bareme, overrides = {}) {
  return {
    id,
    eleveId: id,
    classe: '1APIC-1',
    niveau: '1AC',
    cycle: 'college',
    matiere: 'Mathématiques',
    note: value,
    bareme,
    ...overrides,
  }
}

// Chaque note est convertie depuis son propre barème vers celui de la classe.
// Une saisie accidentelle /10 ne doit ni faire basculer l'agrégat collège en
// /10, ni être mélangée telle quelle avec les notes /20.
{
  const result = computeClassStats([
    note('e1', 16, 20),
    note('e2', 8, 10),
  ])
  assert.equal(result.bareme, 20)
  assert.equal(result.subjectAvgs['Mathématiques'], 16)
  assert.deepEqual(result.studentAvgs, [16, 16])
}

// L'inférence s'appuie d'abord sur AEP/cycle, pas sur le premier barème venu.
{
  const result = computeClassStats([
    note('p1', 14, 20, {
      classe: '5AEP-1',
      niveau: '5AEP',
      cycle: 'primaire',
    }),
    note('p2', 7, 10, {
      classe: '5AEP-1',
      niveau: '5AEP',
      cycle: 'primaire',
    }),
  ])
  assert.equal(result.bareme, 10)
  assert.equal(result.subjectAvgs['Mathématiques'], 7)
  assert.deepEqual(result.studentAvgs, [7, 7])
}

// Sans métadonnée de classe, la majorité explicite gagne : un seul document
// /10 ne corrompt toujours pas un groupe historiquement /20.
{
  const result = computeClassStats([
    note('e1', 12, 20, { classe: '', niveau: '', cycle: '' }),
    note('e2', 14, 20, { classe: '', niveau: '', cycle: '' }),
    note('e3', 7, 10, { classe: '', niveau: '', cycle: '' }),
  ])
  assert.equal(result.bareme, 20)
  assert.deepEqual(result.studentAvgs, [14, 14, 12])
}

console.log('classStats : barème de classe inféré et normalisation document par document')
