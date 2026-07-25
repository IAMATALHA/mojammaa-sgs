/**
 * Drill-downs statistiques — les seuls endpoints qui renvoient du nominatif.
 *
 * Principe de conception : le hero (`getFilteredSchoolStats`) reste strictement
 * agrégé et alimente le téléphone en permanence ; ces callables-ci ne sont
 * appelées qu'au moment où un admin ouvre un détail, et sont les seules à
 * rapatrier des noms d'élèves.
 *
 * Deux garanties structurelles, pas déclaratives :
 *
 *  1. Égalité tuile ↔ détail. Chaque appel reconstruit le périmètre avec la
 *     MÊME fonction que le hero (`resolveScope`) et réutilise le MÊME prédicat
 *     (`evaluateFollowUp`, `gradeBands`). Le total ne peut donc pas diverger du
 *     chiffre affiché : il n'existe pas de second calcul qui pourrait dériver.
 *
 *  2. Projection minimale. `projectStudent` est le seul endroit du serveur qui
 *     transforme un document `eleves` en objet réseau. Tout champ non listé
 *     là — dateNaissance, parentUid, nomComplet MASSAR, téléphone — ne peut
 *     pas sortir, quel que soit l'appelant.
 *
 * L'ID d'un élève EST son code Massar (DATA_MODEL : « Document ID = codeMassar »).
 * Il circule donc nécessairement dans les réponses, mais il est traité comme un
 * identifiant technique : jamais journalisé, jamais dans un message d'erreur.
 */
const { HttpsError } = require('firebase-functions/v2/https')
const { evaluateFollowUp, buildFollowUpContext, gradeBands } = require('./schoolStats')
const { normalizeText, subjectEntry } = require('./collegeEvaluation')
const { inferredClassBareme } = require('./classStats')

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

const STUDENT_SEGMENTS = new Set(['all', 'followup', 'recidivists', 'band', 'threshold', 'progression'])
const GRADE_BANDS = new Set(['<8', '8-10', '10-14', '14+'])
const ATTENDANCE_TABS = new Set(['resume', 'absences', 'retards'])

/**
 * Gate admin. Relit le rôle en base à CHAQUE appel — un custom claim périmé ou
 * un token encore valide après rétrogradation ne doit pas ouvrir l'accès.
 */
async function requireAdmin(db, request) {
  const uid = request.auth && request.auth.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const me = await db.collection('users').doc(uid).get()
  if (!me.exists || me.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }
  return uid
}

function boundedLimit(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(value), MAX_LIMIT)
}

/**
 * Projection réseau d'un élève — liste blanche stricte.
 *
 * Ne JAMAIS élargir sans repasser par l'audit : chaque champ ajouté ici sort
 * du serveur vers un téléphone. `nomLatin`/`prenomLatin` sont préférés quand
 * ils existent (lisibles dans toutes les langues de l'app) ; `nomComplet`, qui
 * porte la chaîne MASSAR brute, est volontairement exclu.
 */
function projectStudent(doc, average) {
  const data = doc.data() || {}
  return {
    id: doc.id,
    nom: String(data.nomLatin || data.nom || ''),
    prenom: String(data.prenomLatin || data.prenom || ''),
    classe: String(data.classe || ''),
    niveau: String(data.niveau || ''),
    average: average == null ? null : average,
    // `average` reste normalisée sur 20 (les périmètres mélangent les cycles) ;
    // `bareme` dit dans quelle échelle la RÉAFFICHER — primaire /10, collège
    // /20. Le serveur tranche parce que lui a le cycle de la fiche élève ; le
    // client n'a que le nom de la classe.
    bareme: inferredClassBareme(data) || 20,
  }
}

function bandOf(average) {
  if (average == null) return null
  if (average < 8) return '<8'
  if (average < 10) return '8-10'
  if (average < 14) return '10-14'
  return '14+'
}

function progressionMatchesScope(selection, appliedSubject, semesterScope) {
  if (!selection || !appliedSubject) return false
  const exactSubject = normalizeText(selection.matiere) === normalizeText(appliedSubject)
  const selectionEntry = subjectEntry(selection.matiere)
  const appliedEntry = subjectEntry(appliedSubject)
  const sameSubject = exactSubject
    || Boolean(selectionEntry && appliedEntry && selectionEntry.key === appliedEntry.key)
  const sameSemester = !semesterScope || selection.semestre === semesterScope
  return sameSubject && sameSemester
}

/**
 * Tri déterministe : deux appels successifs sur des données inchangées
 * renvoient le même ordre, sinon la pagination par curseur sauterait ou
 * dupliquerait des lignes.
 */
function sortStudents(rows, segment) {
  const byName = (a, b) =>
    `${a.student.classe}${a.student.nom}${a.student.prenom}${a.student.id}`
      .localeCompare(`${b.student.classe}${b.student.nom}${b.student.prenom}${b.student.id}`, 'fr')

  if (segment === 'followup') {
    const rank = { high: 0, medium: 1, low: 2 }
    return rows.sort((a, b) => {
      const byPriority = (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3)
      if (byPriority !== 0) return byPriority
      if (b.score !== a.score) return b.score - a.score
      return byName(a, b)
    })
  }
  if (segment === 'progression') {
    return rows.sort((a, b) => {
      const aDelta = Number(a.progression?.delta) || 0
      const bDelta = Number(b.progression?.delta) || 0
      if (aDelta !== bDelta) {
        // Les baisses les plus fortes d'abord ; pour une cohorte en progrès,
        // l'ordre est inversé par l'appelant via des deltas tous positifs.
        const outcome = a.progression?.outcome || b.progression?.outcome
        return outcome === 'improved' ? bDelta - aDelta : aDelta - bDelta
      }
      return byName(a, b)
    })
  }
  return rows.sort(byName)
}

/** Pagination par curseur opaque = index encodé. Pas d'ID en clair dans l'URL. */
function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw === '') return 0
  const decoded = Number(Buffer.from(raw, 'base64').toString('utf8'))
  return Number.isFinite(decoded) && decoded >= 0 ? Math.floor(decoded) : 0
}

function encodeCursor(index) {
  return Buffer.from(String(index), 'utf8').toString('base64')
}

function paginate(rows, cursor, limit) {
  const start = decodeCursor(cursor)
  const page = rows.slice(start, start + limit)
  const nextIndex = start + page.length
  return {
    page,
    nextCursor: nextIndex < rows.length ? encodeCursor(nextIndex) : null,
  }
}

module.exports = {
  requireAdmin,
  boundedLimit,
  projectStudent,
  bandOf,
  progressionMatchesScope,
  sortStudents,
  paginate,
  encodeCursor,
  decodeCursor,
  STUDENT_SEGMENTS,
  GRADE_BANDS,
  ATTENDANCE_TABS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
  evaluateFollowUp,
  buildFollowUpContext,
  gradeBands,
}
