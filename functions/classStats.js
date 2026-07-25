/**
 * Agrégation pure des stats de classe — partagée par le trigger
 * `onNoteWritten` (index.js) et scripts/backfillClassStats.js.
 *
 * MIROIR de la normalisation client (src/services/notesService.ts →
 * docToNote) et des formules de useParentNotes : garder les trois en
 * phase si l'un change.
 *  - note : résumé legacy ou résultat de la politique d'évaluation v2 ;
 *    rejet hors barème de la classe.
 *  - clé matière : `matiereLabel` sinon `matiere` (trim).
 *  - moyennes : moyenne des valeurs brutes, arrondi 1 décimale.
 */
const { calculateCollegeEvaluation, collegeLevel } = require('./collegeEvaluation')

function asNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

const round1 = (v) => Math.round(v * 10) / 10

function baremeFromData(data) {
  const explicit = asNumber(data.bareme)
  if (explicit === 10 || explicit === 20) return explicit
  const cycle = asString(data.cycle).toLowerCase()
  if (cycle === 'primaire') return 10
  if (/aep/i.test(asString(data.classe))) return 10
  return 20
}

function inferredClassBareme(data) {
  const cycle = asString(data.cycle).toLowerCase()
  const classe = asString(data.classe)
  const niveau = asString(data.niveau)
  if (cycle === 'primaire' || /aep/i.test(`${classe} ${niveau}`)) return 10
  if (
    cycle === 'college'
    || cycle === 'collège'
    || collegeLevel(classe, niveau)
    || /\b(?:ac|apic|asc)\b/i.test(`${classe} ${niveau}`)
  ) return 20
  return null
}

function inferBareme(noteDocs) {
  const classVotes = noteDocs
    .map(inferredClassBareme)
    .filter((value) => value === 10 || value === 20)
  if (classVotes.length > 0) {
    const primaryVotes = classVotes.filter((value) => value === 10).length
    return primaryVotes > classVotes.length / 2 ? 10 : 20
  }

  // Dernier recours pour d'anciens documents sans classe/cycle : majorité des
  // barèmes explicites. Une seule saisie /10 ne peut plus faire basculer tout
  // un agrégat collège.
  const explicit = noteDocs
    .map((data) => asNumber(data.bareme))
    .filter((value) => value === 10 || value === 20)
  const primaryVotes = explicit.filter((value) => value === 10).length
  return explicit.length > 0 && primaryVotes > explicit.length / 2 ? 10 : 20
}

/** Valeur de note d'un doc `notes`, ou null si invalide. */
function noteValue(data, expectedBareme) {
  const note = asNumber(calculateCollegeEvaluation(data).note)
  const sourceBareme = baremeFromData(data)
  if (note == null || note < 0 || note > sourceBareme) return null
  return note * (expectedBareme / sourceBareme)
}

function subjectKey(data) {
  return asString(data.matiereLabel) || asString(data.matiere)
}

/**
 * Agrégat ANONYME d'une (année scolaire, classe, semestre) :
 *  - subjectAvgs : { [matiereLabel]: moyenne de classe }
 *  - studentAvgs : moyennes par élève, triées desc, SANS identifiants
 *    (suffit au client pour calculer le rang de son enfant)
 */
function computeClassStats(noteDocs) {
  const bySubject = new Map()
  const byStudent = new Map()
  let notesCount = 0
  const bareme = inferBareme(noteDocs)

  for (const data of noteDocs) {
    const note = noteValue(data, bareme)
    const subject = subjectKey(data)
    const eleveId = asString(data.eleveId)
    if (note == null || !subject || !eleveId) continue
    notesCount++
    if (!bySubject.has(subject)) bySubject.set(subject, [])
    bySubject.get(subject).push(note)
    if (!byStudent.has(eleveId)) byStudent.set(eleveId, [])
    byStudent.get(eleveId).push(note)
  }

  const subjectAvgs = {}
  bySubject.forEach((vals, s) => {
    subjectAvgs[s] = round1(vals.reduce((a, b) => a + b, 0) / vals.length)
  })
  const studentAvgs = [...byStudent.values()]
    .map((vals) => round1(vals.reduce((a, b) => a + b, 0) / vals.length))
    .sort((a, b) => b - a)

  return { subjectAvgs, studentAvgs, students: studentAvgs.length, notesCount, bareme }
}

function statsDocId(academicYear, classe, semestre) {
  return `${academicYear}__${classe}__${semestre}`.replace(/\//g, '_')
}

module.exports = { computeClassStats, statsDocId, inferredClassBareme }
