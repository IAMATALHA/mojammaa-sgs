/**
 * Coefficients réglementaires du collège — source unique.
 *
 * Partagé par `scripts/setupCoefficients.js` (qui écrit) et par les tests (qui
 * vérifient). Les valeurs ne doivent exister qu'ici : dupliquées, elles
 * divergeraient au premier ajustement ministériel.
 *
 * Les clés de matière sont celles du champ `matiere` en base — pas les noms
 * d'usage. « Maths », « SVT », « EPS » ou « Physique-Chimie » ne correspondent
 * à rien : une clé approximative ne lève aucune erreur, elle retombe
 * silencieusement sur le coefficient 1, c'est-à-dire l'absence de pondération
 * là où on croit en avoir posé une.
 *
 * Sources : notes ministérielles 180 (arabe), 181 (français), 182 (anglais),
 * 183 (éducation islamique), 184 (informatique), 185 (histoire-géographie),
 * 189 (EPS), 190 (SVT), 192 (mathématiques), 193 (physique-chimie).
 */

const ACADEMIC_YEAR = '2025-2026'
const POLICY_VERSION = 'college-2025-2026-v1'

/** Contrôle continu 1AC et 2AC. */
const COLLEGE_1AC_2AC = {
  'Arabe': 5,
  'Français': 5,
  'Mathématiques': 5,
  'Histoire Géographie': 3,
  'Physique et Chimie': 2,
  'Sciences de la Vie et de la Terre': 2,
  'Éducation Islamique': 2,
  'Anglais': 2,
  'Éducation Physique et Sportive': 2,
  'Informatique': 1,
}

/**
 * Contrôle continu 3AC — toutes les matières à 1.
 *
 * Les coefficients différenciés de la 3ᵉ année ne concernent QUE l'examen
 * régional. Les appliquer au contrôle continu fausserait toutes les moyennes
 * ordinaires du niveau.
 */
const COLLEGE_3AC = Object.fromEntries(Object.keys(COLLEGE_1AC_2AC).map((m) => [m, 1]))

const COEFFICIENTS_DOC = {
  // Volontairement vide. `makeCoefOf` résout parNiveau > matieres > 1 : un
  // coefficient global s'appliquerait aussi au primaire et au préscolaire,
  // dont le régime n'est pas établi. Tant qu'ils ne sont pas configurés, ils
  // doivent garder le repli à 1 — la moyenne arithmétique qu'ils ont déjà.
  matieres: {},
  parNiveau: {
    '1AC': COLLEGE_1AC_2AC,
    '2AC': COLLEGE_1AC_2AC,
    '3AC': COLLEGE_3AC,
  },
  academicYear: ACADEMIC_YEAR,
  policyVersion: POLICY_VERSION,
  scope: 'college',
  source: 'Notes ministérielles 180-193',
  note: 'Primaire et préscolaire non configurés : repli coefficient 1 (moyenne arithmétique).',
}

/**
 * Examen régional 3AC — document SÉPARÉ, jamais lu par `makeCoefOf`.
 *
 * Anglais, EPS et informatique n'y figurent pas : confirmé non applicables par
 * l'établissement.
 */
const EXAMEN_REGIONAL_DOC = {
  academicYear: ACADEMIC_YEAR,
  policyVersion: POLICY_VERSION,
  appliesTo: '3AC',
  usage: "Calcul de l'examen régional uniquement. Ne jamais appliquer au contrôle continu.",
  coefficients: {
    'Arabe': 3,
    'Français': 3,
    'Mathématiques': 3,
    'Éducation Islamique': 1,
    'Histoire Géographie': 1,
    'Sciences de la Vie et de la Terre': 1,
    'Physique et Chimie': 1,
  },
  nonApplicables: ['Anglais', 'Éducation Physique et Sportive', 'Informatique'],
  source: 'Notes ministérielles 180-193',
}

module.exports = {
  ACADEMIC_YEAR,
  POLICY_VERSION,
  COLLEGE_1AC_2AC,
  COLLEGE_3AC,
  COEFFICIENTS_DOC,
  EXAMEN_REGIONAL_DOC,
}
