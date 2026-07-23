import assert from 'node:assert/strict'
import progressModule from '../../functions/gradeProgress.js'
import evaluation from '../../functions/collegeEvaluation.js'

const { gradeProgress, gradeProgressStudents } = progressModule
const policyVersion = evaluation.EVALUATION_POLICY.version

function math(eleveId, values, semestre = 'S1') {
  return {
    eleveId,
    classe: '1APIC-3',
    matiere: 'Mathématiques',
    semestre,
    bareme: 20,
    schemaVersion: 2,
    evaluationPolicyVersion: policyVersion,
    evaluations: values.map((note, index) => ({
      slot: `written_${index + 1}`,
      category: 'control',
      kind: 'written',
      ordinal: index + 1,
      label: `C${index + 1}`,
      note,
      bareme: 20,
    })),
  }
}

{
  const rows = gradeProgress([
    math('e1', [10, 12, 14]),
    math('e2', [14, 13, 12]),
    math('e3', [10]),
    math('e4', [5, 5.2]),
    math('e5', [20, 20], 'S2'),
    // Legacy : aucune fausse progression.
    { eleveId: 'legacy', classe: '1APIC-3', matiere: 'Mathématiques', semestre: 'S1', note: 18 },
  ], 'S1')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].controls.map((row) => row.average), [9.8, 10.1, 13])
  assert.equal(rows[0].documents, 4)
  assert.equal(rows[0].complete, 2)
  assert.equal(rows[0].provisional, 2)
  assert.deepEqual(rows[0].transitions, [
    {
      fromSlot: 'written_1',
      fromKind: 'written',
      fromLabel: 'Contrôle écrit 1',
      toSlot: 'written_2',
      toKind: 'written',
      toLabel: 'Contrôle écrit 2',
      fromAverage: 9.7,
      toAverage: 10.1,
      delta: 0.4,
      comparableStudents: 3,
      improved: 1,
      stable: 1,
      declined: 1,
    },
    {
      fromSlot: 'written_2',
      fromKind: 'written',
      fromLabel: 'Contrôle écrit 2',
      toSlot: 'written_3',
      toKind: 'written',
      toLabel: 'Contrôle écrit 3',
      fromAverage: 12.5,
      toAverage: 13,
      delta: 0.5,
      comparableStudents: 2,
      improved: 1,
      stable: 0,
      declined: 1,
    },
  ])
  assert.equal(rows[0].improved, 1)
  assert.equal(rows[0].declined, 1)
  assert.equal(rows[0].stable, 0)
  assert.equal(rows[0].comparableStudents, 2)
  assert.equal(rows[0].latestDelta, 0.5)
  assert.equal(rows[0].coverageRate, 75)
}

// Une cohorte C1→C2 ne doit jamais être mélangée avec une cohorte C2→C3.
{
  const rows = gradeProgress([
    math('e1', [10, 12]),
    {
      ...math('e2', []),
      evaluations: [
        { slot: 'written_2', category: 'control', kind: 'written', ordinal: 2, note: 8, bareme: 20 },
        { slot: 'written_3', category: 'control', kind: 'written', ordinal: 3, note: 14, bareme: 20 },
      ],
    },
  ], 'S1')
  assert.equal(rows[0].transitions.length, 2)
  assert.equal(rows[0].transitions[0].comparableStudents, 1)
  assert.equal(rows[0].transitions[0].delta, 2)
  assert.equal(rows[0].transitions[1].comparableStudents, 1)
  assert.equal(rows[0].transitions[1].delta, 6)
  assert.equal(rows[0].latestDelta, 6)
}

// Chaque compteur de transition ouvre exactement les élèves qui le composent.
{
  const notes = [
    math('progress', [10, 12]),
    math('decline', [14, 13]),
    math('stable', [5, 5.2]),
    math('wrong-semester', [3, 15], 'S2'),
    { eleveId: 'legacy', classe: '1APIC-3', matiere: 'Mathématiques', semestre: 'S1', note: 4 },
  ]
  const base = {
    matiere: 'Maths', // alias accepté comme dans le filtre admin.
    semestre: 'S1',
    fromSlot: 'written_1',
    toSlot: 'written_2',
  }
  const improved = gradeProgressStudents(notes, { ...base, outcome: 'improved' })
  const declined = gradeProgressStudents(notes, { ...base, outcome: 'declined' })
  const stable = gradeProgressStudents(notes, { ...base, outcome: 'stable' })

  assert.deepEqual([...improved.keys()], ['progress'])
  assert.deepEqual([...declined.keys()], ['decline'])
  assert.deepEqual([...stable.keys()], ['stable'])
  assert.deepEqual(improved.get('progress'), {
    matiere: 'Mathématiques',
    semestre: 'S1',
    fromLabel: 'Contrôle écrit 1',
    toLabel: 'Contrôle écrit 2',
    from: 10,
    to: 12,
    delta: 2,
    outcome: 'improved',
  })
}

{
  const rows = gradeProgress([
    math('same-student', [10, 12]),
    math('same-student', [10, 12]),
  ], 'S1')
  assert.equal(
    rows[0].transitions[0].comparableStudents,
    1,
    'un doublon documentaire ne double jamais la cohorte nominative',
  )
}

// La frontière ±0,5 se décide avant arrondi : +0,46 s'affiche +0,5 mais reste
// stable dans la carte ET dans sa cohorte cliquable.
{
  const notes = [math('edge', [10, 10.46])]
  const transition = gradeProgress(notes, 'S1')[0].transitions[0]
  const selection = {
    matiere: 'Mathématiques',
    semestre: 'S1',
    fromSlot: 'written_1',
    toSlot: 'written_2',
  }
  assert.equal(transition.delta, 0.5)
  assert.equal(transition.improved, 0)
  assert.equal(transition.stable, 1)
  assert.deepEqual(
    [...gradeProgressStudents(notes, { ...selection, outcome: 'improved' }).keys()],
    [],
  )
  assert.deepEqual(
    [...gradeProgressStudents(notes, { ...selection, outcome: 'stable' }).keys()],
    ['edge'],
  )
}

console.log('gradeProgress : séquence, couverture, progression et legacy exclus')
