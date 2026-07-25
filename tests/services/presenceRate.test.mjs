/**
 * Taux de présence de l'enfant et découpage des requêtes `in`.
 *
 * Deux régressions que ces tests verrouillent :
 *  - le taux divisait par un forfait de 22 jours d'école alors que les données
 *    reçues étaient bornées au mois courant : début de mois, il remontait à
 *    100 % quelles que soient les absences réelles ;
 *  - les listes passées à un `where(..., 'in', ...)` étaient tronquées à 10
 *    valeurs, ce qui perdait silencieusement des documents.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function load(relPath, requireShim) {
  const sourcePath = path.resolve(here, relPath)
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText
  const shim = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(requireShim, shim, shim.exports)
  return shim.exports
}

const firestoreStub = {
  collection: () => ({}), query: () => ({}), where: () => ({}),
  getDocs: async () => ({ docs: [] }), onSnapshot: () => () => {},
}

const { chunkForIn, IN_QUERY_LIMIT } = load('../../src/services/chunkedQuery.ts', id => {
  if (id === 'firebase/firestore') return firestoreStub
  if (id === './firestore') return { toDocs: () => [] }
  throw new Error(`Unexpected dependency: ${id}`)
})

// Enregistre les contraintes `where` de la dernière requête construite, afin de
// vérifier sur quelle FENÊTRE chaque souscription porte.
let lastWhere = []
const absencesModule = load('../../src/services/absencesService.ts', id => {
  if (id === 'firebase/firestore') {
    return {
      ...firestoreStub,
      where: (field, op, value) => ({ field, op, value }),
      query: (_col, ...constraints) => { lastWhere = constraints; return {} },
    }
  }
  if (id === '../config/firebase') return { db: {} }
  if (id === './chunkedQuery') {
    return {
      getDocsChunked: async () => [],
      // Exécute la fabrique pour que la requête soit réellement construite.
      subscribeChunked: (values, buildQuery) => { buildQuery(values); return () => {} },
    }
  }
  if (id === './elevesService') return { isActiveEleve: () => true }
  if (id === '../utils/academicPeriod') {
    return {
      localISODate: (d = new Date()) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    }
  }
  throw new Error(`Unexpected dependency: ${id}`)
})
const {
  computeChildPresenceRate, subscribeAbsencesForEleves, subscribeAbsenceHistoryForEleves,
} = absencesModule

// ── Fenêtre de chaque souscription ────────────────────────────────────────
// L'appel écrit un document par élève ET par séance, présences comprises :
// ~1 000 par enfant et par an. Ces deux tests empêchent qu'une souscription
// reparte sur l'année sans filtrer les présences.
subscribeAbsencesForEleves(['e1'], { academicYear: '2025-2026', monthKey: '2026-01' }, () => {})
let fields = lastWhere.map(c => `${c.field}${c.op}`)
assert.ok(fields.includes('monthKey=='), 'tableau de bord : borné au mois')

subscribeAbsenceHistoryForEleves(['e1'], { academicYear: '2025-2026' }, () => {})
fields = lastWhere.map(c => `${c.field}${c.op}`)
assert.ok(fields.includes('academicYear=='), 'historique : sur toute l\'année')
assert.ok(!fields.includes('monthKey=='), 'historique : plus vidé chaque 1er du mois')
assert.ok(
  lastWhere.some(c => c.field === 'statut' && c.value === 'absent'),
  'historique : présences exclues, sinon le volume annuel est intenable',
)

// ── chunkForIn ────────────────────────────────────────────────────────────
assert.equal(IN_QUERY_LIMIT, 30, 'limite `in` alignée sur Firestore')
assert.deepEqual(chunkForIn([]), [], 'liste vide → aucun chunk')
assert.deepEqual(chunkForIn(['a', 'b'], 2), [['a', 'b']], 'un seul chunk')
assert.deepEqual(chunkForIn(['a', 'b', 'c'], 2), [['a', 'b'], ['c']], 'découpe et conserve le reste')
assert.deepEqual(chunkForIn(['a', 'a', 'b'], 2), [['a', 'b']], 'doublons retirés avant découpe')

// Aucune valeur ne doit disparaître : c'était tout le problème des `slice(0, 10)`.
const many = Array.from({ length: 73 }, (_, i) => `id-${i}`)
const chunks = chunkForIn(many)
assert.equal(chunks.length, 3, '73 valeurs → 3 chunks de 30')
assert.deepEqual(chunks.flat().sort(), [...many].sort(), 'aucune valeur perdue')
assert.ok(chunks.every(c => c.length <= IN_QUERY_LIMIT), 'aucun chunk hors limite')

// ── computeChildPresenceRate ──────────────────────────────────────────────
const iso = offsetDays => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const appel = (eleveId, offsetDays, statut, seance = 'S1') =>
  ({ eleveId, date: iso(offsetDays), statut, seance })

assert.equal(computeChildPresenceRate([], 'e1'), 100, 'aucun appel → 100 par convention')

// 10 jours appelés, 2 avec absence → 80 %.
const dixJours = [
  ...Array.from({ length: 8 }, (_, i) => appel('e1', i, 'present')),
  appel('e1', 8, 'absent'),
  appel('e1', 9, 'absent'),
]
assert.equal(computeChildPresenceRate(dixJours, 'e1'), 80, 'dénominateur = jours réellement appelés')

// Le bug d'origine : peu de jours de données, mais un forfait de 22 au
// dénominateur → l'ancienne formule renvoyait 95 % au lieu de 50 %.
const debutDeMois = [appel('e1', 0, 'present'), appel('e1', 1, 'absent')]
assert.equal(
  computeChildPresenceRate(debutDeMois, 'e1'), 50,
  'début de mois : le taux reflète les données, il ne remonte plus à ~100 %',
)

// Plusieurs séances le même jour ne comptent qu'une journée.
const memeJour = [
  appel('e1', 0, 'absent', 'S1'), appel('e1', 0, 'absent', 'S2'),
  appel('e1', 1, 'present'),
]
assert.equal(computeChildPresenceRate(memeJour, 'e1'), 50, 'comptage par jour, pas par séance')

// Les autres enfants et les jours hors fenêtre n'entrent pas dans le calcul.
const mixte = [
  appel('e1', 0, 'present'), appel('e2', 0, 'absent'), appel('e1', 400, 'absent'),
]
assert.equal(computeChildPresenceRate(mixte, 'e1'), 100, 'filtre par élève et par fenêtre')

console.log('presenceRate : dénominateur issu des données, comptage par jour, chunking sans perte')
