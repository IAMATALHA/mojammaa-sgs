/**
 * Coefficients réglementaires du collège.
 *
 * Trois garanties, dans l'ordre de gravité si elles cassaient :
 *
 *   1. Les coefficients de l'EXAMEN RÉGIONAL ne peuvent pas atteindre le
 *      contrôle continu. C'est le risque le plus coûteux du lot : un arabe à 3
 *      au lieu de 1 en 3AC fausserait toutes les moyennes ordinaires du niveau
 *      sans qu'aucune erreur ne se déclenche.
 *
 *   2. Le primaire et le préscolaire restent NON pondérés. `matieres` (global)
 *      doit rester vide : un coefficient posé là s'appliquerait à des cycles
 *      dont le régime d'évaluation n'est pas établi.
 *
 *   3. Les clés de matière sont celles de la base. Une clé approximative ne
 *      lève pas d'erreur — elle retombe silencieusement sur 1, donc sur
 *      l'absence de pondération là où on croit en avoir posé une.
 *
 *   node tests/functions/collegeCoefficients.test.mjs
 */
import assert from 'node:assert/strict'
import schoolStats from '../../functions/schoolStats.js'
import config from '../../scripts/lib/collegeCoefficients.js'

const { computeSchoolStats } = schoolStats
const { COEFFICIENTS_DOC, EXAMEN_REGIONAL_DOC, COLLEGE_1AC_2AC, COLLEGE_3AC } = config

/** Clés exactes relevées en production (champ `matiere`). */
const CLES_BASE = [
  'Arabe',
  'Français',
  'Mathématiques',
  'Histoire Géographie',
  'Physique et Chimie',
  'Sciences de la Vie et de la Terre',
  'Anglais',
  'Éducation Physique et Sportive',
]
/** Enseignées mais sans aucune note à ce jour — clés à confirmer à la 1re saisie. */
const CLES_ATTENDUES = ['Éducation Islamique', 'Informatique']

function eleve(id, niveau) {
  return { id, codeMassar: id, classe: `${niveau}-1`, niveau, cycle: 'college' }
}

function note(id, eleveId, matiere, valeur) {
  return { id, eleveId, classe: '1AC-1', matiere, note: valeur, semestre: 'S1' }
}

// ── 1. Les clés sont celles de la base ─────────────────────────────────────
{
  const clesConfig = Object.keys(COLLEGE_1AC_2AC).sort()
  assert.deepEqual(
    clesConfig,
    [...CLES_BASE, ...CLES_ATTENDUES].sort(),
    'la config couvre exactement les 10 matières du collège',
  )

  // Les noms d'usage ne doivent JAMAIS apparaître : ils ne correspondent à rien
  // en base et produiraient un repli silencieux à 1.
  for (const faux of ['Maths', 'SVT', 'EPS', 'Physique-Chimie', 'Histoire-Géo', 'Info']) {
    assert.ok(!(faux in COLLEGE_1AC_2AC), `« ${faux} » est un nom d'usage, pas une clé de base`)
  }
}

// ── 2. Primaire et préscolaire restent non pondérés ────────────────────────
{
  assert.deepEqual(
    COEFFICIENTS_DOC.matieres, {},
    'le bloc global doit rester vide tant que primaire et préscolaire ne sont pas établis',
  )
  assert.deepEqual(
    Object.keys(COEFFICIENTS_DOC.parNiveau).sort(), ['1AC', '2AC', '3AC'],
    'seuls les niveaux de collège sont configurés',
  )

  // Preuve par le calcul : un élève de primaire garde la moyenne arithmétique.
  const primaire = [{ id: 'p1', codeMassar: 'p1', classe: '6AEP-1', niveau: '6AEP', cycle: 'primaire' }]
  const notesPrimaire = [
    note('n1', 'p1', 'Mathématiques', 6),
    note('n2', 'p1', 'Éducation Physique et Sportive', 18),
  ]
  const sansConfig = computeSchoolStats({
    eleves: primaire, users: [], notes: notesPrimaire, absences: [], devoirs: [], homeworkSubmissions: [],
    coefficients: null,
  })
  const avecConfig = computeSchoolStats({
    eleves: primaire, users: [], notes: notesPrimaire, absences: [], devoirs: [], homeworkSubmissions: [],
    coefficients: COEFFICIENTS_DOC,
  })
  assert.equal(sansConfig.avgNote, 12, 'moyenne arithmétique (6 + 18) / 2')
  assert.equal(
    avecConfig.avgNote, sansConfig.avgNote,
    'la configuration collège ne doit pas toucher au primaire',
  )
}

// ── 3. La pondération s'applique bien en 1AC / 2AC ─────────────────────────
{
  // Maths coef 5, EPS coef 2. Un élève faible en maths et fort en EPS ne doit
  // plus obtenir la moyenne flatteuse que donnait le coefficient 1 partout.
  const eleves = [eleve('e1', '1AC')]
  const notes = [
    note('n1', 'e1', 'Mathématiques', 6),
    note('n2', 'e1', 'Éducation Physique et Sportive', 18),
  ]
  const sans = computeSchoolStats({
    eleves, users: [], notes, absences: [], devoirs: [], homeworkSubmissions: [], coefficients: null,
  })
  const avec = computeSchoolStats({
    eleves, users: [], notes, absences: [], devoirs: [], homeworkSubmissions: [], coefficients: COEFFICIENTS_DOC,
  })
  assert.equal(sans.avgNote, 12, 'sans coefficient : (6 + 18) / 2')
  // (6 × 5 + 18 × 2) / 7 = 66 / 7 = 9,43
  assert.equal(avec.avgNote, 9.4, 'avec coefficients : la matière lourde pèse davantage')
  assert.ok(avec.avgNote < sans.avgNote, 'la pondération corrige la moyenne flatteuse')
}

// ── 4. GARANTIE CRITIQUE : le régional ne contamine pas le contrôle continu ─
{
  // En 3AC, toutes les matières valent 1 en contrôle continu. Si les
  // coefficients régionaux (arabe 3, français 3, maths 3) fuyaient jusqu'ici,
  // la moyenne changerait sans qu'aucune erreur ne soit levée.
  Object.entries(COLLEGE_3AC).forEach(([matiere, coef]) => {
    assert.equal(coef, 1, `3AC contrôle continu : « ${matiere} » doit valoir 1`)
  })

  const eleves = [eleve('e3', '3AC')]
  const notes = [
    note('n1', 'e3', 'Arabe', 6),
    note('n2', 'e3', 'Éducation Physique et Sportive', 18),
  ]
  const continu = computeSchoolStats({
    eleves, users: [], notes, absences: [], devoirs: [], homeworkSubmissions: [], coefficients: COEFFICIENTS_DOC,
  })
  assert.equal(continu.avgNote, 12, '3AC : moyenne arithmétique, arabe ne pèse pas 3')

  // Le document régional existe, mais dans une forme que `makeCoefOf` ne sait
  // pas lire : il n'a ni `matieres` ni `parNiveau`. Même passé par erreur au
  // calcul, il ne peut pondérer quoi que ce soit.
  assert.ok(!('parNiveau' in EXAMEN_REGIONAL_DOC), 'le doc régional n’a pas de bloc parNiveau')
  assert.ok(!('matieres' in EXAMEN_REGIONAL_DOC), 'le doc régional n’a pas de bloc matieres')
  const parErreur = computeSchoolStats({
    eleves, users: [], notes, absences: [], devoirs: [], homeworkSubmissions: [],
    coefficients: EXAMEN_REGIONAL_DOC,
  })
  assert.equal(
    parErreur.avgNote, 12,
    'même injecté par erreur, le document régional laisse la moyenne inchangée',
  )
}

// ── 5. Périmètre du régional ───────────────────────────────────────────────
{
  assert.equal(EXAMEN_REGIONAL_DOC.appliesTo, '3AC')
  assert.deepEqual(
    EXAMEN_REGIONAL_DOC.nonApplicables.sort(),
    ['Anglais', 'Informatique', 'Éducation Physique et Sportive'].sort(),
    'anglais, EPS et informatique ne sont pas dans l’examen régional',
  )
  EXAMEN_REGIONAL_DOC.nonApplicables.forEach((m) => {
    assert.ok(!(m in EXAMEN_REGIONAL_DOC.coefficients), `« ${m} » ne doit pas avoir de coefficient régional`)
  })
  assert.equal(EXAMEN_REGIONAL_DOC.coefficients['Arabe'], 3)
  assert.equal(EXAMEN_REGIONAL_DOC.coefficients['Mathématiques'], 3)
  assert.equal(EXAMEN_REGIONAL_DOC.coefficients['Physique et Chimie'], 1)
}

console.log('collegeCoefficients : clés de base, primaire non pondéré, pondération 1AC/2AC, régional étanche')
