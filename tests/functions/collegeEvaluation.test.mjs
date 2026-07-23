import assert from 'node:assert/strict'
import evaluation from '../../functions/collegeEvaluation.js'
import schoolStats from '../../functions/schoolStats.js'
import coefficientConfig from '../../scripts/lib/collegeCoefficients.js'

const { EVALUATION_POLICY, calculateCollegeEvaluation } = evaluation
const { computeSchoolStats } = schoolStats

function structured({
  matiere,
  classe = '1APIC-3',
  controls = [],
  integrated = null,
  note = 19,
}) {
  const evaluations = controls.map((control, index) => ({
    slot: control.slot,
    category: 'control',
    kind: control.kind || 'written',
    ordinal: index + 1,
    label: control.label || `C${index + 1}`,
    note: control.note,
    bareme: 20,
  }))
  if (integrated != null) {
    evaluations.push({
      slot: 'integrated_activities',
      category: 'integrated',
      kind: 'integrated_activity',
      ordinal: controls.length + 1,
      label: 'Activités intégrées',
      note: integrated,
      bareme: 20,
    })
  }
  return calculateCollegeEvaluation({
    schemaVersion: 2,
    evaluationPolicyVersion: EVALUATION_POLICY.version,
    matiere,
    classe,
    bareme: 20,
    note,
    evaluations,
  })
}

// Maths : trois écrits, aucune activité intégrée.
{
  const result = structured({
    matiere: 'Mathématiques',
    controls: [
      { slot: 'written_1', note: 8 },
      { slot: 'written_2', note: 12 },
      { slot: 'written_3', note: 16 },
    ],
  })
  assert.equal(result.note, 12)
  assert.equal(result.complete, true)
}

// Français : quatre éléments écrits de poids égal dans les 80 %, IA 20 %.
{
  const result = structured({
    matiere: 'Français',
    controls: [
      { slot: 'comprehension_1', note: 10 },
      { slot: 'production_1', note: 12 },
      { slot: 'comprehension_2', note: 14 },
      { slot: 'production_2', note: 16 },
    ],
    integrated: 18,
  })
  assert.equal(result.writtenAverage, 13)
  assert.equal(result.note, 14)
  assert.equal(result.complete, true)
  assert.deepEqual(result.controls.map(control => control.kind), [
    'comprehension',
    'production',
    'comprehension',
    'production',
  ])
  assert.deepEqual(
    result.progression.comparableSteps.map(step => [step.fromSlot, step.toSlot]),
    [
      ['comprehension_1', 'comprehension_2'],
      ['production_1', 'production_2'],
    ],
  )
}

// Arabe : écrits 75 %, IA 25 %.
{
  const result = structured({
    matiere: 'Arabe',
    controls: [
      { slot: 'written_1', note: 10 },
      { slot: 'written_2', note: 14 },
    ],
    integrated: 16,
  })
  assert.equal(result.note, 13)
}

// Physique et SVT : écrits 75 %, IA 25 % ; SVT reste à deux contrôles en 3AC.
{
  const physics = structured({
    matiere: 'Physique et Chimie',
    controls: [
      { slot: 'written_1', note: 8 },
      { slot: 'written_2', note: 10 },
      { slot: 'written_3', note: 12 },
    ],
    integrated: 14,
  })
  assert.equal(physics.note, 11)

  const svt = structured({
    matiere: 'Sciences de la Vie et de la Terre',
    classe: '3APIC-1',
    controls: [
      { slot: 'written_1', note: 10 },
      { slot: 'written_2', note: 14 },
    ],
    integrated: 16,
  })
  assert.equal(svt.controlsExpected, 2)
  assert.equal(svt.note, 13)
}

// Éducation islamique et Histoire-Géo : 2/3 écrits + 1/3 IA.
{
  const islamic = structured({
    matiere: 'Éducation Islamique',
    controls: [
      { slot: 'written_1', note: 9 },
      { slot: 'written_2', note: 15 },
    ],
    integrated: 18,
  })
  assert.equal(islamic.note, 14)

  const social = structured({
    matiere: 'Histoire Géographie',
    classe: '3APIC-1',
    controls: [
      { slot: 'written_1', note: 9 },
      { slot: 'written_2', note: 15 },
    ],
    integrated: 18,
  })
  assert.equal(social.controlsExpected, 2)
  assert.equal(social.note, 14)
}

// Anglais : moyenne des deux courts, final et IA = trois blocs égaux.
{
  const result = structured({
    matiere: 'Anglais',
    controls: [
      { slot: 'short_1', kind: 'short', note: 8 },
      { slot: 'short_2', kind: 'short', note: 12 },
      { slot: 'final', kind: 'final', note: 16 },
    ],
    integrated: 19,
  })
  assert.equal(result.controlsExpected, 3)
  assert.equal(result.note, 15)
}

// EPS : poids IA dépend du niveau.
{
  const controls = [
    { slot: 'cycle_1', kind: 'cycle', note: 10 },
    { slot: 'cycle_2', kind: 'cycle', note: 10 },
    { slot: 'cycle_3', kind: 'cycle', note: 10 },
  ]
  assert.equal(structured({ matiere: 'Éducation Physique et Sportive', classe: '1APIC-3', controls, integrated: 20 }).note, 11.5)
  assert.equal(structured({ matiere: 'Éducation Physique et Sportive', classe: '2APIC-3', controls, integrated: 20 }).note, 12)
  assert.equal(structured({ matiere: 'Éducation Physique et Sportive', classe: '3APIC-3', controls, integrated: 20 }).note, 12.5)
}

// Informatique : trois éléments égaux dans le bloc formel 80 %, IA 20 %.
{
  const result = structured({
    matiere: 'Informatique',
    controls: [
      { slot: 'resource_1', kind: 'resource', note: 8 },
      { slot: 'resource_2', kind: 'resource', note: 12 },
      { slot: 'integration', kind: 'integration', note: 16 },
    ],
    integrated: 18,
  })
  assert.equal(result.note, 13.2)
}

// Une composante future absente ne devient jamais un zéro.
{
  const result = structured({
    matiere: 'Français',
    controls: [{ slot: 'comprehension_1', note: 14 }],
  })
  assert.equal(result.note, 14)
  assert.equal(result.provisional, true)
  assert.equal(result.completionRate, 20)
}

// L'ordre vient des slots/ordinaux et produit C1→C2→C3, pas de createdAt.
{
  const result = structured({
    matiere: 'Mathématiques',
    controls: [
      { slot: 'written_1', note: 10 },
      { slot: 'written_2', note: 13 },
      { slot: 'written_3', note: 12 },
    ],
  })
  assert.deepEqual(result.progression.steps.map((step) => step.delta), [3, -1])
  assert.equal(result.progression.latestDelta, -1)
  assert.equal(result.progression.delta, 2)
}

// Une composante manquante ne crée ni C1→C3 à l'affichage, ni comparaison.
{
  const result = structured({
    matiere: 'Mathématiques',
    controls: [
      { slot: 'written_1', note: 10 },
      { slot: 'written_3', note: 16 },
    ],
  })
  assert.deepEqual(result.progression.steps, [])
  assert.deepEqual(result.progression.comparableSteps, [])
  assert.equal(result.progression.latestDelta, null)
  assert.equal(result.progression.delta, null)
}

// Le schéma v2 accepte uniquement les slots officiels, une fois chacun.
{
  const result = structured({
    matiere: 'Mathématiques',
    controls: [
      { slot: 'written_1', note: 10 },
      { slot: 'written_1', note: 19 },
      { slot: 'unexpected_4', note: 20 },
      { slot: 'written_2', note: 12 },
      { slot: 'written_3', note: 14 },
    ],
  })
  assert.equal(result.controls.length, 3)
  assert.deepEqual(result.controls.map(control => control.note), [10, 12, 14])
  assert.equal(result.note, 12)
}

// Les 1 032 résumés historiques restent inchangés : aucune reconstruction fictive.
{
  const result = calculateCollegeEvaluation({
    matiere: 'Français',
    classe: '1APIC-3',
    bareme: 20,
    note: 17,
    controles: [
      { numero: 1, note: 5 },
      { numero: 2, note: 10 },
    ],
  })
  assert.equal(result.formula, 'legacy')
  assert.equal(result.note, 17)
  assert.equal(result.policyVersion, null)
}

// La présence de métadonnées de politique ne suffit jamais à activer le calcul
// structuré : seul schemaVersion === 2 rend `evaluations` source de vérité.
{
  const result = calculateCollegeEvaluation({
    matiere: 'Mathématiques',
    classe: '1APIC-3',
    bareme: 20,
    note: 17,
    evaluationPolicyVersion: EVALUATION_POLICY.version,
    policyVersion: EVALUATION_POLICY.version,
    evaluations: [
      { slot: 'written_1', category: 'control', kind: 'written', ordinal: 1, note: 4 },
    ],
  })
  assert.equal(result.formula, 'legacy')
  assert.equal(result.note, 17)
}

// En v2, ni le miroir d'activité intégrée ni l'ancien tableau `controles` ne
// sont des sources validées. Une IA absente d'`evaluations` reste absente.
{
  const result = calculateCollegeEvaluation({
    schemaVersion: 2,
    matiere: 'Arabe',
    classe: '1APIC-3',
    bareme: 20,
    note: 19,
    evaluations: [
      { slot: 'written_1', category: 'control', kind: 'written', ordinal: 1, note: 12 },
    ],
    controles: [
      { slot: 'written_2', category: 'control', kind: 'written', ordinal: 2, note: 20 },
    ],
    activitesIntegrees: { note: 20 },
  })
  assert.equal(result.note, 12)
  assert.equal(result.integratedActivitiesNote, null)
  assert.deepEqual(result.controls.map((row) => row.slot), ['written_1'])
  assert.equal(result.provisional, true)
}

// Vue annuelle : le coefficient d'une matière s'applique une fois, même si elle
// possède S1 et S2 tandis qu'une autre matière n'a encore que S1.
{
  const result = computeSchoolStats({
    eleves: [{ id: 'e1', codeMassar: 'e1', classe: '1APIC-3', niveau: '1AC', cycle: 'college' }],
    users: [],
    notes: [
      { id: 'm1', eleveId: 'e1', classe: '1APIC-3', matiere: 'Mathématiques', semestre: 'S1', note: 10 },
      { id: 'e1', eleveId: 'e1', classe: '1APIC-3', matiere: 'Éducation Physique et Sportive', semestre: 'S1', note: 20 },
      { id: 'e2', eleveId: 'e1', classe: '1APIC-3', matiere: 'Éducation Physique et Sportive', semestre: 'S2', note: 20 },
    ],
    absences: [],
    devoirs: [],
    homeworkSubmissions: [],
    coefficients: coefficientConfig.COEFFICIENTS_DOC,
  })
  // (Maths 10 × 5 + moyenne annuelle EPS 20 × 2) / 7 = 12,857...
  assert.equal(result.avgNote, 12.9)
}

console.log('collegeEvaluation : 10 matières, progression, provisoire et compatibilité legacy')
