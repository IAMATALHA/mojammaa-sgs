/**
 * Agrégation pure des stats de classe — partagée par le trigger
 * `onNoteWritten` (index.js) et scripts/backfillClassStats.js.
 *
 * MIROIR de la normalisation client (src/services/notesService.ts →
 * docToNote) et des formules de useParentNotes : garder les trois en
 * phase si l'un change.
 *  - note : champ `note` (number ou string à virgule), sinon moyenne des
 *    `controles` valides (arrondie 2 déc.) ; rejet hors barème de la classe.
 *  - clé matière : `matiereLabel` sinon `matiere` (trim).
 *  - moyennes : moyenne des valeurs brutes, arrondi 1 décimale.
 */

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
const round2 = (v) => Math.round(v * 100) / 100

function baremeFromData(data) {
  const explicit = asNumber(data.bareme)
  if (explicit === 10 || explicit === 20) return explicit
  const cycle = asString(data.cycle).toLowerCase()
  if (cycle === 'primaire') return 10
  if (/aep/i.test(asString(data.classe))) return 10
  return 20
}

function inferBareme(noteDocs) {
  const primary = noteDocs.some((data) => baremeFromData(data) === 10)
  return primary ? 10 : 20
}

/** Valeur de note d'un doc `notes`, ou null si invalide. */
function noteValue(data, bareme) {
  const controles = Array.isArray(data.controles)
    ? data.controles
        .map((c) => asNumber(c && c.note))
        .filter((n) => n != null && n >= 0 && n <= bareme)
    : []
  let note = asNumber(data.note)
  if (note == null && controles.length > 0) {
    note = round2(controles.reduce((s, v) => s + v, 0) / controles.length)
  }
  if (note == null || note < 0 || note > bareme) return null
  return note
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

module.exports = { computeClassStats, statsDocId }
