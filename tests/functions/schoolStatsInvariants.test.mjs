/**
 * Invariants de la Livraison A — « le chiffre de la tuile doit toujours
 * correspondre exactement au détail qui s'ouvre ».
 *
 * Ces assertions sont le contrat que les callables de drill-down (Livraison B)
 * consomment. Si l'une casse, une tuile affichera un nombre que son écran de
 * détail ne saura pas reproduire.
 *
 *   node tests/functions/schoolStatsInvariants.test.mjs
 */
import assert from 'node:assert/strict'
import schoolStats from '../../functions/schoolStats.js'

const {
  computeSchoolStats,
  evaluateFollowUp,
  ABSENTEEISM_MIN_DAYS,
  ABSENTEEISM_MIN_OBSERVED,
  ABSENTEEISM_MIN_RATIO,
} = schoolStats

function eleve(id, classe = '1A') {
  return { id, codeMassar: id, classe, niveau: '1APIC' }
}

function note(id, eleveId, value, semestre, matiere = 'math') {
  return { id, eleveId, classe: '1A', note: value, matiere, semestre }
}

// ── E6/A9 — la distribution répartit des ÉLÈVES, pas des documents ──────────
{
  // e1 a 4 notes, e2 une seule. Avant A9, e1 pesait 4 fois dans la
  // distribution et 1 fois dans la moyenne : les deux étaient irréconciliables.
  const result = computeSchoolStats({
    eleves: [eleve('e1'), eleve('e2'), eleve('e3')],
    users: [],
    notes: [
      note('n1', 'e1', 12, 'S1'), note('n2', 'e1', 12, 'S1'),
      note('n3', 'e1', 12, 'S1'), note('n4', 'e1', 12, 'S1'),
      note('n5', 'e2', 16, 'S1'),
      note('n6', 'e3', 5, 'S1'),
    ],
    absences: [], devoirs: [], homeworkSubmissions: [],
  })

  const sum = result.gradeDistribution.reduce((s, b) => s + b.value, 0)
  assert.equal(result.gradedStudents, 3, 'trois élèves notés')
  assert.equal(sum, 3, 'Σ bandes = élèves notés (et non 6 documents de notes)')

  const band = (label) => result.gradeDistribution.find((b) => b.label === label).value
  assert.equal(band('<8'), 1, 'e3 (5/20)')
  assert.equal(band('10-14'), 1, 'e1 (12/20)')
  assert.equal(band('14+'), 1, 'e2 (16/20)')
  assert.equal(band('8-10'), 0)

  // La borne des bandes (≥10) coïncide avec le seuil de successRate.
  const passing = band('10-14') + band('14+')
  assert.equal(
    passing,
    Math.round((result.successRate * result.gradedStudents) / 100),
    'bandes hautes = successRate × élèves notés / 100',
  )
}

// ── A5 — prédicat unique : compteur et liste ne peuvent pas diverger ────────
{
  const result = computeSchoolStats({
    eleves: [eleve('e1'), eleve('e2'), eleve('e3'), eleve('e4')],
    users: [],
    notes: [
      note('n1', 'e1', 6, 'S1'),        // low_average
      note('n2', 'e2', 15, 'S1'),
      note('n3', 'e2', 9, 'S2'),        // declining (15 → 9)
      note('n4', 'e3', 14, 'S1'),       // rien
    ],
    absences: [], devoirs: [], homeworkSubmissions: [],
  }, { includeFollowUpStudents: true })

  assert.equal(
    result.studentsToFollow,
    result.followUpStudents.length,
    'le compteur du hero est exactement la longueur de la liste du drill-down',
  )
  const ids = result.followUpStudents.map((row) => row.eleveId)
  assert.equal(new Set(ids).size, ids.length, 'un élève apparaît une seule fois')
  result.followUpStudents.forEach((row) => {
    assert.ok(row.reasons.length >= 1 && row.reasons.length <= 5, '1 à 5 raisons')
    assert.ok(['low', 'medium', 'high'].includes(row.priority), 'priorité déterministe')
  })
}

// ── PII — la liste nominative ne sort JAMAIS par défaut ─────────────────────
{
  const cache = {
    eleves: [eleve('e1')],
    users: [],
    notes: [note('n1', 'e1', 4, 'S1')],
    absences: [], devoirs: [], homeworkSubmissions: [],
  }
  const heroPayload = computeSchoolStats(cache)
  assert.equal(heroPayload.studentsToFollow, 1, 'le compteur reste calculé')
  assert.equal(
    heroPayload.followUpStudents,
    undefined,
    'eleveId EST le code Massar : rien de nominatif dans le payload du hero',
  )
  assert.ok(
    !JSON.stringify(heroPayload).includes('e1'),
    'aucun identifiant élève ne transite dans les agrégats du hero',
  )

  const drillPayload = computeSchoolStats(cache, { includeFollowUpStudents: true })
  assert.equal(drillPayload.followUpStudents.length, 1, 'opt-in explicite pour le drill-down')
}

// ── E2/A10 — absentéisme : 3 jours ET ≥5 observés ET ≥10 % ──────────────────
{
  const ctx = (absentDays, observedDays) => ({
    notesByEleve: new Map(),
    semesterNotesByEleve: new Map(),
    absentDatesByEleve: new Map([['e1', new Set(
      Array.from({ length: absentDays }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`),
    )]]),
    observedDatesByEleve: new Map([['e1', new Set(
      Array.from({ length: observedDays }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`),
    )]]),
    homeworkAlertsByEleve: new Map(),
  })
  const flagged = (a, o) => {
    const verdict = evaluateFollowUp({ id: 'e1' }, ctx(a, o))
    return verdict != null && verdict.reasons.includes('absenteeism')
  }

  assert.equal(flagged(3, 30), true, '3 j. / 30 obs. = 10 % pile → signalé')
  assert.equal(flagged(3, 31), false, '3 j. / 31 obs. = 9,7 % → sous le ratio')
  assert.equal(flagged(2, 10), false, 'moins de 3 jours distincts → jamais signalé')
  assert.equal(flagged(3, 4), false, 'moins de 5 journées observées → période trop courte')
  assert.equal(flagged(4, 5), true, '4 j. / 5 obs. → signalé')

  assert.equal(ABSENTEEISM_MIN_DAYS, 3)
  assert.equal(ABSENTEEISM_MIN_OBSERVED, 5)
  assert.equal(ABSENTEEISM_MIN_RATIO, 0.1)

  // Le badge doit pouvoir afficher numérateur ET dénominateur.
  const verdict = evaluateFollowUp({ id: 'e1' }, ctx(3, 30))
  assert.equal(verdict.metrics.absentDays, 3)
  assert.equal(verdict.metrics.observedDays, 30)
}

// ── A3 — le filtre matière ne bouge plus le compteur « À suivre » ───────────
{
  const eleves = [eleve('e1'), eleve('e2')]
  const toutesLesNotes = [
    note('n1', 'e1', 4, 'S1', 'math'),      // e1 faible en math
    note('n2', 'e1', 18, 'S1', 'arabe'),    // mais excellent en arabe → moyenne 11
    note('n3', 'e2', 12, 'S1', 'math'),
  ]
  const notesMathSeules = toutesLesNotes.filter((r) => r.matiere === 'math')

  const sansFiltre = computeSchoolStats({
    eleves, users: [], notes: toutesLesNotes, followUpNotes: toutesLesNotes,
    absences: [], devoirs: [], homeworkSubmissions: [],
  })
  const filtreMath = computeSchoolStats({
    eleves, users: [], notes: notesMathSeules, followUpNotes: toutesLesNotes,
    absences: [], devoirs: [], homeworkSubmissions: [],
  })

  assert.equal(
    filtreMath.studentsToFollow,
    sansFiltre.studentsToFollow,
    'sélectionner une matière ne change pas le suivi global d’un élève',
  )
  // La moyenne, elle, DOIT bouger : c'est une métrique pédagogique.
  assert.notEqual(filtreMath.avgNote, sansFiltre.avgNote, 'la moyenne reste sensible à la matière')

  // Sans followUpNotes, on retombe sur `notes` — comportement du recalcul planifié.
  const fallback = computeSchoolStats({
    eleves, users: [], notes: notesMathSeules,
    absences: [], devoirs: [], homeworkSubmissions: [],
  })
  assert.equal(fallback.studentsToFollow, 1, 'e1 sous 10 sur le seul périmètre math')
}

console.log('schoolStats invariants : distribution par élève, prédicat unique, PII, absentéisme 3/5/10 %, matière neutre')
