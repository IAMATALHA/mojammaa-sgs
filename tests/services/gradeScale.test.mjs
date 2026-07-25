/**
 * Barème, normalisation /20 et pondération par coefficients.
 *
 * Ces règles étaient réécrites différemment dans `useParentData` et
 * `useParentNotes` : un même élève pouvait afficher deux moyennes selon
 * l'écran, et la moyenne générale du bulletin ignorait les coefficients
 * appliqués par l'administration. Les tests figent la règle unique.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function load(relPath, requireShim = () => { throw new Error('no deps expected') }) {
  const sourcePath = path.resolve(here, relPath)
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText
  const shim = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(requireShim, shim, shim.exports)
  return shim.exports
}

const { resolveBareme, noteOn20, weightedAverage } = load('../../src/utils/gradeScale.ts')
const { makeCoefOf } = load('../../src/services/coefficientsService.ts', id => {
  if (id === 'firebase/firestore') return { doc: () => {}, getDoc: async () => {} }
  if (id === '../config/firebase') return { db: {} }
  if (id === './firestore') return { docData: () => null }
  throw new Error(`Unexpected dependency: ${id}`)
})

// ── resolveBareme ─────────────────────────────────────────────────────────
assert.equal(resolveBareme({ bareme: 10 }), 10, 'barème explicite prioritaire')
assert.equal(resolveBareme({ bareme: 20, cycle: 'primaire' }), 20, 'explicite > cycle')
assert.equal(resolveBareme({ cycle: 'primaire' }), 10, 'cycle primaire → /10')
assert.equal(resolveBareme({ classe: '3AEP-A' }), 10, 'classe AEP → /10')
assert.equal(resolveBareme({ classe: '2APIC-B' }), 20, 'collège → /20')
assert.equal(resolveBareme({}, '4AEP'), 10, 'classe de repli prise en compte')

// LE cas qui divergeait : primaire dont la classe ne contient pas « AEP ».
// useParentData répondait 10, useParentNotes 20 → deux moyennes affichées.
assert.equal(
  resolveBareme({ cycle: 'primaire', classe: 'CE2-A' }), 10,
  'primaire sans motif AEP : /10 partout, plus de divergence',
)

// ── noteOn20 ──────────────────────────────────────────────────────────────
assert.equal(noteOn20(8, { bareme: 10 }), 16, '8/10 vaut 16/20')
assert.equal(noteOn20(16, { bareme: 20 }), 16, '/20 inchangé')
assert.equal(noteOn20(null, { bareme: 20 }), null, 'note absente ignorée')
assert.equal(noteOn20(15, { bareme: 10 }), null, 'note hors barème écartée, pas rognée')
assert.equal(noteOn20(-1, { bareme: 20 }), null, 'note négative écartée')

// Une matière mélangeant des saisies /10 et /20 : la moyenne brute (12) était
// dénuée de sens, la moyenne normalisée vaut 17/20.
const mixed = [noteOn20(8, { bareme: 10 }), noteOn20(18, { bareme: 20 })]
assert.deepEqual(mixed, [16, 18])
assert.equal(mixed.reduce((s, v) => s + v, 0) / mixed.length, 17)

// ── weightedAverage ───────────────────────────────────────────────────────
assert.equal(weightedAverage([]), null, 'aucune matière → null')
assert.equal(
  weightedAverage([{ value: 10, coef: 1 }, { value: 20, coef: 1 }]), 15,
  'coefficients égaux = moyenne simple',
)
assert.equal(
  weightedAverage([{ value: 10, coef: 3 }, { value: 20, coef: 1 }]), 12.5,
  'coefficient 3 sur la première matière',
)
assert.equal(
  weightedAverage([{ value: 10, coef: 0 }, { value: 20, coef: 0 }]), 15,
  'aucun coefficient exploitable → repli sur la moyenne arithmétique',
)

// ── makeCoefOf : miroir de la résolution serveur ──────────────────────────
const coefOf = makeCoefOf({
  matieres: { 'Éducation Physique et Sportive': 1 },
  parNiveau: { '1AC': { 'Mathématiques': 3, 'Arabe': 2 } },
})
assert.equal(coefOf('Mathématiques', '1AC'), 3, 'parNiveau prioritaire')
assert.equal(coefOf('MATHEMATIQUES', '1AC'), 3, 'casse et accents normalisés')
assert.equal(coefOf('Mathématiques', '2AC'), 1, 'niveau non configuré → repli à 1')
assert.equal(coefOf('Éducation Physique et Sportive', '1AC'), 1, 'repli sur le global')
assert.equal(coefOf('Matière inconnue', '1AC'), 1, 'matière absente → 1, jamais 0')
assert.equal(makeCoefOf(null)('Mathématiques', '1AC'), 1, 'document absent → 1 partout')

console.log('gradeScale : barème unique, normalisation /20, pondération et repli')
