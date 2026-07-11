/**
 * Tests comportementaux des règles Firestore (émulateur) — durcissement 2026-07-11.
 *
 * Lancer :  npm run test:rules
 * (= firebase emulators:exec --only firestore --project demo-mojammaa-rules
 *    "node tests/rules/firestore.rules.test.mjs")
 *
 * Chaque correctif est prouvé par un cas AUTORISÉ (flux réel de l'app intact)
 * et un cas REFUSÉ (l'attaque est bloquée) :
 *  1. Enveloppe message immuable (toType/toIds/fromRole après envoi)
 *  2. eleves/notes/absences : ancienne classe validée + champs immuables
 *  3. Cohérence élève↔classe au create (notes/absences/comportements)
 *  4. toIds borné pour les parents
 *  5. absenceRequests : statuts contraints + décision signée
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection,
  arrayUnion, writeBatch,
} from 'firebase/firestore'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-rules',
  firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
})

// ── Seed (règles désactivées) ─────────────────────────────────────────────
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const seed = (path, data) => setDoc(doc(db, path), data)
  await Promise.all([
    seed('config/superadmins', { uids: ['super1'] }),
    seed('users/admin1',  { uid: 'admin1',  role: 'admin' }),
    seed('users/prof1',   { uid: 'prof1',   role: 'professeur', classes: ['1A'], matiere: 'Maths' }),
    seed('users/prof2',   { uid: 'prof2',   role: 'professeur', classes: ['2B'], matiere: 'PC' }),
    seed('users/parent1', { uid: 'parent1', role: 'parent', prenom: 'Pa', nom: 'Rent' }),
    seed('users/parent2', { uid: 'parent2', role: 'parent' }),
    seed('eleves/e1', { classe: '1A', parentUid: 'parent1', nom: 'A', prenom: 'A' }),
    seed('eleves/e2', { classe: '2B', parentUid: 'parent2', nom: 'B', prenom: 'B' }),
    // Note légitime de prof1 (sa classe, sa matière, son élève)
    seed('notes/n1', { eleveId: 'e1', classe: '1A', matiere: 'Maths', note: 12 }),
    // Note de prof2 dans SA classe — cible du détournement par prof1
    seed('notes/n2', { eleveId: 'e2', classe: '2B', matiere: 'PC', note: 15 }),
    seed('absences/a1', { eleveId: 'e1', classe: '1A', date: '2026-07-10', seance: 'S1', statut: 'present' }),
    seed('absences/a2', { eleveId: 'e2', classe: '2B', date: '2026-07-10', seance: 'S1', statut: 'absent' }),
    // Message privé déjà envoyé par parent1 à prof1 — cible des mutations
    seed('messages/m1', {
      type: 'direct', subject: 'Q', body: 'B', fromId: 'parent1', fromRole: 'parent',
      toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
    }),
    // Ancien message 100% legacy (toId string, pas de toType/toIds)
    seed('messages/legacy1', {
      subject: 'Ancien', body: 'Format legacy', fromId: 'admin1', toId: 'prof1',
    }),
    seed('absenceRequests/r1', {
      parentUid: 'parent1', eleveId: 'e1', classe: '1A',
      date: '2026-07-10', status: 'pending', reason: 'maladie',
    }),
    // 10 élèves supplémentaires en 1A pour prouver le chunk d'import (10 docs/batch)
    ...Array.from({ length: 10 }, (_, i) =>
      seed(`eleves/bulk${i}`, { classe: '1A', parentUid: 'parent1', nom: `N${i}`, prenom: 'P' })),
  ])
})

const asUser = (uid) => testEnv.authenticatedContext(uid).firestore()

// ── Mini harness ──────────────────────────────────────────────────────────
let passed = 0
const failed = []
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed.push(name); console.error(`  ❌ ${name}\n     ${e.message}`) }
}
const allow = (name, p) => test(`[AUTORISÉ] ${name}`, () => assertSucceeds(p))
const deny  = (name, p) => test(`[REFUSÉ]  ${name}`, () => assertFails(p))

console.log('\n── 1. Messages : enveloppe immuable ──')
await allow('parent crée un message direct (flux compose parent)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await deny('expéditeur bascule toType user → all (escalade en diffusion école)',
  updateDoc(doc(asUser('parent1'), 'messages/m1'), { toType: 'all' }))
await deny('expéditeur élargit toIds après envoi',
  updateDoc(doc(asUser('parent1'), 'messages/m1'), { toIds: ['prof1', 'parent2'] }))
await deny('expéditeur se fait passer pour admin après envoi (fromRole)',
  updateDoc(doc(asUser('parent1'), 'messages/m1'), { fromRole: 'admin' }))
await deny('expéditeur réécrit le contenu après envoi',
  updateDoc(doc(asUser('parent1'), 'messages/m1'), { body: 'contenu falsifié' }))
await allow('destinataire accuse lecture (readBy self-append, flux markAsRead)',
  updateDoc(doc(asUser('prof1'), 'messages/m1'), { readBy: arrayUnion('prof1') }))
await deny('destinataire falsifie l\'accusé de lecture d\'un autre uid',
  updateDoc(doc(asUser('prof1'), 'messages/m1'), { readBy: arrayUnion('parent2') }))
await allow('destinataire se masque le message (deletedBy self-append)',
  updateDoc(doc(asUser('prof1'), 'messages/m1'), { deletedBy: arrayUnion('prof1') }))
await allow('admin retouche le contenu',
  updateDoc(doc(asUser('admin1'), 'messages/m1'), { body: 'corrigé par admin' }))
await deny('admin ne peut pas réécrire l\'enveloppe (toIds)',
  updateDoc(doc(asUser('admin1'), 'messages/m1'), { toIds: ['parent2'] }))

console.log('\n── 2. Messages : toIds borné pour les parents ──')
await deny('parent envoie à 11 destinataires (spam personnel)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    toType: 'user', toIds: Array.from({ length: 11 }, (_, i) => `u${i}`), readBy: [], status: 'sent',
  }))
await allow('prof envoie à 30 destinataires étiquetés de SA classe (compose classe)',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: Array.from({ length: 30 }, (_, i) => `p${i}`),
    classe: '1A', readBy: [], status: 'sent',
  }))

console.log('\n── 2b. Prof : parents de SES classes uniquement ──')
for (const toType of ['all', 'parents', 'teachers']) {
  await deny(`prof tente une diffusion toType:'${toType}' (réservé admin)`,
    addDoc(collection(asUser('prof1'), 'messages'), {
      type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
      toType, toIds: [], readBy: [], status: 'sent',
    }))
}
await deny('prof envoie multi-destinataires SANS étiquette de classe',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['p1', 'p2'], readBy: [], status: 'sent',
  }))
await deny('prof étiquette une classe qui n\'est PAS la sienne',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['p1', 'p2'], classe: '2B', readBy: [], status: 'sent',
  }))
await deny('prof glisse une classe étrangère dans un envoi multi-classes ("1A, 2B")',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['p1', 'p2'], classe: '1A, 2B', readBy: [], status: 'sent',
  }))
await allow('prof répond à UN parent sans classe (reply / notification)',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'direct', subject: 'RE: Q', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['parent1'], readBy: [], status: 'sent',
  }))
await allow('admin garde la diffusion générale (toType all)',
  addDoc(collection(asUser('admin1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'admin1', fromRole: 'admin',
    toType: 'all', toIds: [], readBy: [], status: 'sent',
  }))

console.log('\n── 3. Eleves : ancienne classe validée + parentUid gelé ──')
await allow('prof modifie un élève de SA classe',
  updateDoc(doc(asUser('prof1'), 'eleves/e1'), { nom: 'MisAJour' }))
await deny('prof capture un élève d\'une autre classe (classe → la sienne)',
  updateDoc(doc(asUser('prof1'), 'eleves/e2'), { classe: '1A' }))
await deny('prof rattache l\'élève à un autre parent (parentUid)',
  updateDoc(doc(asUser('prof1'), 'eleves/e1'), { parentUid: 'parent2' }))

console.log('\n── 4. Notes : cohérence élève/classe + immutabilité ──')
await allow('prof crée une note pour SON élève dans SA classe/matière',
  setDoc(doc(asUser('prof1'), 'notes/new1'), {
    eleveId: 'e1', classe: '1A', matiere: 'Maths', note: 14,
  }))
await deny('prof injecte une note à un élève d\'une AUTRE classe (eleveId étranger)',
  setDoc(doc(asUser('prof1'), 'notes/forged1'), {
    eleveId: 'e2', classe: '1A', matiere: 'Maths', note: 3,
  }))
await allow('prof met à jour la valeur d\'une note existante (set+merge, flux app)',
  setDoc(doc(asUser('prof1'), 'notes/n1'), {
    eleveId: 'e1', classe: '1A', matiere: 'Maths', note: 16,
  }, { merge: true }))
await deny('prof détourne la note d\'une autre classe (classe/matiere → les siennes)',
  updateDoc(doc(asUser('prof1'), 'notes/n2'), { classe: '1A', matiere: 'Maths', note: 0 }))
await deny('prof réassigne une note à un autre élève (eleveId)',
  updateDoc(doc(asUser('prof1'), 'notes/n1'), { eleveId: 'e2' }))
await test('[AUTORISÉ] import par chunk de 10 notes (taille RULES_SAFE_BATCH_SIZE)', async () => {
  const db = asUser('prof1')
  const batch = writeBatch(db)
  for (let i = 0; i < 10; i++) {
    batch.set(doc(db, `notes/bulknote${i}`), {
      eleveId: `bulk${i}`, classe: '1A', matiere: 'Maths', note: 10 + i,
    }, { merge: true })
  }
  await assertSucceeds(batch.commit())
})

console.log('\n── 5. Absences : mêmes garanties ──')
await allow('prof enregistre l\'appel pour SON élève',
  setDoc(doc(asUser('prof1'), 'absences/new_a1'), {
    eleveId: 'e1', classe: '1A', date: '2026-07-11', seance: 'S2', statut: 'absent',
  }))
await deny('prof forge une absence pour un élève d\'une autre classe',
  setDoc(doc(asUser('prof1'), 'absences/forged_a'), {
    eleveId: 'e2', classe: '1A', date: '2026-07-11', seance: 'S2', statut: 'absent',
  }))
await allow('prof re-sauve l\'appel (statut modifié, set+merge idempotent)',
  setDoc(doc(asUser('prof1'), 'absences/a1'), {
    eleveId: 'e1', classe: '1A', date: '2026-07-10', seance: 'S1', statut: 'retard',
  }, { merge: true }))
await deny('prof détourne l\'absence d\'une autre classe',
  updateDoc(doc(asUser('prof1'), 'absences/a2'), { classe: '1A' }))

console.log('\n── 6. Comportements : cohérence élève/classe ──')
await allow('prof signale un comportement de SON élève',
  addDoc(collection(asUser('prof1'), 'comportements'), {
    eleveId: 'e1', classe: '1A', date: '2026-07-11', kind: 'merite',
    reason: 'participation', teacherId: 'prof1', teacherNom: 'Prof Un',
  }))
await deny('prof forge un comportement pour un élève d\'ailleurs',
  addDoc(collection(asUser('prof1'), 'comportements'), {
    eleveId: 'e2', classe: '1A', date: '2026-07-11', kind: 'avertissement',
    reason: 'bavardage', teacherId: 'prof1', teacherNom: 'Prof Un',
  }))

console.log('\n── 7. absenceRequests : décision contrainte et signée ──')
await allow('prof approuve une déclaration (flux decideAbsenceRequest)',
  updateDoc(doc(asUser('prof1'), 'absenceRequests/r1'), {
    status: 'approved', decidedBy: 'prof1', decidedAt: new Date(),
  }))
await deny('statut hors liste (approved/declined)',
  updateDoc(doc(asUser('prof1'), 'absenceRequests/r1'), {
    status: 'archived', decidedBy: 'prof1', decidedAt: new Date(),
  }))
await deny('décision signée au nom d\'un autre (decidedBy usurpé)',
  updateDoc(doc(asUser('prof1'), 'absenceRequests/r1'), {
    status: 'declined', decidedBy: 'admin1', decidedAt: new Date(),
  }))

console.log('\n── 8. Schéma legacy toId : mélange interdit, legacy préservé ──')
await deny('parent glisse toId:"all" dans un message user (escalade mixed-schema)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    toType: 'user', toIds: ['prof1'], toId: 'all', readBy: [], status: 'sent',
  }))
await deny('prof mélange nouveau schéma + toId legacy',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'teachers', toIds: [], toId: 'all', readBy: [], status: 'sent',
  }))
await deny('prof ne peut plus écrire en legacy pur (toType:"user" obligatoire)',
  addDoc(collection(asUser('prof1'), 'messages'), {
    subject: 'S', body: 'B', fromId: 'prof1', toId: 'parent1', readBy: [], status: 'sent',
  }))
await allow('admin écrit encore en 100% legacy (toId seul, sans toType/toIds)',
  addDoc(collection(asUser('admin1'), 'messages'), {
    subject: 'S', body: 'B', fromId: 'admin1', toId: 'parent1', readBy: [], status: 'sent',
  }))
await allow('destinataire lit un ancien document legacy (toId == uid)',
  getDoc(doc(asUser('prof1'), 'messages/legacy1')))

console.log('\n── 9. fromNom : un parent signe de son vrai nom ──')
await deny('parent signe « Administration » (usurpation d\'affichage)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    fromNom: 'Administration', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await allow('parent signe de son vrai nom (prénom nom, flux compose)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    fromNom: 'Pa Rent', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await allow('parent signe nom prénom (ordre inverse toléré)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    fromNom: 'Rent Pa', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))

console.log('\n── 10. Non-régression lectures ──')
await allow('parent lit la note de SON enfant',
  getDoc(doc(asUser('parent1'), 'notes/n1')))
await deny('parent lit la note d\'un autre enfant',
  getDoc(doc(asUser('parent1'), 'notes/n2')))
await allow('destinataire lit son message',
  getDoc(doc(asUser('prof1'), 'messages/m1')))

// ── Bilan ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
await testEnv.cleanup()
process.exit(0)
