/**
 * Annuaire des parents pré-agrégé (directoryAdmin/parents).
 *
 * Le sélecteur de destinataires lisait `users` et `eleves` en entier à chaque
 * ouverture. En déportant la projection côté serveur, il faut garantir qu'elle
 * produit EXACTEMENT ce que le client construisait — sans quoi le chemin
 * nominal et le chemin de repli afficheraient deux listes différentes.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildParentsDirectory, approximateSize, SIZE_WARNING_BYTES, isActiveEleve, childLabel,
} = require('../../functions/parentsDirectory.js')

const users = [
  { id: 'p2', role: 'parent', nom: 'Alaoui', prenom: 'Samir', email: 's@ex.ma' },
  { id: 'p1', role: 'parent', nom: 'Alaoui', prenom: 'Amina', email: 'a@ex.ma' },
  { id: 'p3', role: 'parent', nom: 'Zniber', prenom: 'Karim', email: 'k@ex.ma' },
  { id: 't1', role: 'professeur', nom: 'Bennis', prenom: 'Nadia', email: 'n@ex.ma' },
  { id: 'a1', role: 'admin', nom: 'Idrissi', prenom: 'Omar', email: 'o@ex.ma' },
  { id: 'p9', role: 'parent', nom: 'Sansenfant', prenom: 'Leila', email: 'l@ex.ma' },
]

const eleves = [
  { id: 'e1', parentUid: 'p1', nom: 'Alaoui', prenom: 'Yassine', classe: '1APIC-A' },
  { id: 'e2', parentUid: 'p1', nom: 'Alaoui', prenom: 'Hind', classe: '3AEP-B' },
  { id: 'e3', parentUid: 'p2', nom: 'Alaoui', prenom: 'Mehdi', classe: '2APIC-C' },
  { id: 'e4', parentUid: 'p3', nom: 'Zniber', prenom: 'Sara', classe: '1APIC-A' },
  // Élève archivé : ni sa classe ni son libellé ne doivent apparaître.
  { id: 'e5', parentUid: 'p3', nom: 'Zniber', prenom: 'Anas', classe: 'CLASSE-MORTE', active: false },
  // Élève sans parent rattaché : sa classe compte, mais il n'a pas de parent.
  { id: 'e6', parentUid: '', nom: 'Orphelin', prenom: 'Test', classe: '4AEP-A' },
]

const { parents, classes } = buildParentsDirectory(users, eleves)

// ── Périmètre ─────────────────────────────────────────────────────────────
assert.deepEqual(
  parents.map(p => p.uid), ['p1', 'p2', 'p9', 'p3'],
  'seuls les parents, triés par « nom prénom » en français',
)
assert.ok(!parents.some(p => p.uid === 't1' || p.uid === 'a1'), 'profs et admins exclus')

// Le tri doit départager deux homonymes de nom sur le prénom : Amina avant Samir.
assert.deepEqual(
  parents.slice(0, 2).map(p => p.prenom), ['Amina', 'Samir'],
  'tri stable sur le prénom à nom égal',
)

// ── Enfants ───────────────────────────────────────────────────────────────
const p1 = parents.find(p => p.uid === 'p1')
assert.deepEqual(
  p1.children, ['Hind Alaoui · 3AEP-B', 'Yassine Alaoui · 1APIC-A'],
  'libellé « Prénom Nom · Classe », trié',
)
const p3 = parents.find(p => p.uid === 'p3')
assert.deepEqual(p3.children, ['Sara Zniber · 1APIC-A'], 'enfant archivé absent de la liste')
const p9 = parents.find(p => p.uid === 'p9')
assert.deepEqual(p9.children, [], 'un parent sans enfant reste dans l\'annuaire')

// ── Classes ───────────────────────────────────────────────────────────────
assert.deepEqual(
  classes, ['1APIC-A', '2APIC-C', '3AEP-B', '4AEP-A'],
  'classes distinctes et triées, élèves actifs uniquement',
)
assert.ok(!classes.includes('CLASSE-MORTE'), 'la classe d\'un élève archivé n\'est pas proposée')

// ── Robustesse des entrées ────────────────────────────────────────────────
assert.deepEqual(
  buildParentsDirectory(null, null), { parents: [], classes: [] },
  'collections absentes → annuaire vide, pas une exception',
)
assert.equal(isActiveEleve({}), true, 'doc historique sans champ `active` = actif')
assert.equal(isActiveEleve({ active: false }), false)
assert.equal(
  childLabel({ prenom: 'Sara', nom: 'Zniber', classe: '' }), 'Sara Zniber ·',
  'champ manquant : pas de « undefined » dans le libellé',
)

// ── Garde-fou de taille ───────────────────────────────────────────────────
// Firestore plafonne un document à 1 Mio ; l'alerte doit se déclencher AVANT.
assert.ok(SIZE_WARNING_BYTES < 1024 * 1024, 'le seuil d\'alerte précède le plafond')
const gros = buildParentsDirectory(
  Array.from({ length: 500 }, (_, i) => ({
    id: `p${i}`, role: 'parent', nom: `Nom${i}`, prenom: `Prenom${i}`, email: `p${i}@exemple.ma`,
  })),
  Array.from({ length: 600 }, (_, i) => ({
    id: `e${i}`, parentUid: `p${i % 500}`, nom: `Nom${i}`, prenom: `Prenom${i}`,
    classe: `${(i % 30) + 1}APIC-${String.fromCharCode(65 + (i % 4))}`,
  })),
)
assert.equal(gros.parents.length, 500)
assert.ok(
  approximateSize(gros) < SIZE_WARNING_BYTES,
  `600 élèves / 500 parents doivent tenir loin du seuil (mesuré ${approximateSize(gros)} octets)`,
)

console.log(`parentsDirectory : périmètre, tri, archives et taille (600 élèves ≈ ${Math.round(approximateSize(gros) / 1024)} Ko)`)
