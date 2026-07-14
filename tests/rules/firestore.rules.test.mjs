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
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, collectionGroup, query, where,
  arrayUnion, writeBatch, serverTimestamp, deleteField,
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
    seed('users/profParent', {
      uid: 'profParent', role: 'professeur', classes: ['9Z'], matiere: 'Histoire',
      prenom: 'Prof', nom: 'Parent',
    }),
    seed('users/parent1', { uid: 'parent1', role: 'parent', prenom: 'Pa', nom: 'Rent' }),
    seed('users/parent2', { uid: 'parent2', role: 'parent' }),
    seed('users/orphanParent', { uid: 'orphanParent', role: 'parent' }),
    seed('users/driver2', { uid: 'driver2', role: 'chauffeur' }),
    seed('users/driverParent', {
      uid: 'driverParent', role: 'chauffeur', prenom: 'Driver', nom: 'Parent',
    }),
    seed('eleves/e1', { classe: '1A', parentUid: 'parent1', nom: 'A', prenom: 'A' }),
    seed('eleves/e2', { classe: '2B', parentUid: 'parent2', nom: 'B', prenom: 'B' }),
    seed('eleves/e3', { classe: '1A', parentUid: 'parent1', nom: 'C', prenom: 'C' }),
    seed('eleves/e4', { classe: '1A', parentUid: 'parent1', nom: 'D', prenom: 'D' }),
    seed('eleves/e5', { classe: '1A', parentUid: 'parent1', nom: 'E', prenom: 'E' }),
    seed('eleves/e6', { classe: '1A', parentUid: 'parent1', nom: 'F', prenom: 'F' }),
    // Comptes multi-espaces : leur rôle principal reste professionnel. Leur
    // capacité parent vient uniquement de ce lien live et de l'entitlement
    // de classes matérialisé côté serveur.
    seed('eleves/e7', { classe: '3C', parentUid: 'profParent', nom: 'G', prenom: 'G' }),
    seed('eleves/e8', { classe: '4D', parentUid: 'driverParent', nom: 'H', prenom: 'H' }),
    seed('guardianAccess/profParent', {
      uid: 'profParent', childIds: ['e7'], classes: ['3C'], updatedAt: new Date(),
    }),
    seed('guardianAccess/driverParent', {
      uid: 'driverParent', childIds: ['e8'], classes: ['4D'], updatedAt: new Date(),
    }),
    seed('guardianAccess/parent1', {
      uid: 'parent1', childIds: ['e1', 'e3', 'e4', 'e5', 'e6'], classes: ['1A'], updatedAt: new Date(),
    }),
    seed('guardianAccess/parent2', {
      uid: 'parent2', childIds: ['e2'], classes: ['2B'], updatedAt: new Date(),
    }),
    seed('directory/staff', {
      teachers: [{ uid: 'prof1', nom: 'Un', prenom: 'Prof' }],
      admins: [{ uid: 'admin1', nom: 'Admin' }], updatedAt: new Date(),
    }),
    seed('pickupSessions/2026-07-14', {
      serviceDate: '2026-07-14', isOpen: true, openedByUid: 'admin1',
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 60 * 60_000),
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('pickupSessions/expired', {
      serviceDate: 'expired', isOpen: true, openedByUid: 'admin1',
      opensAt: new Date(Date.now() - 2 * 60 * 60_000),
      closesAt: new Date(Date.now() - 60 * 60_000),
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('pickupRequests/2026-07-14_e3', {
      parentUid: 'parent1', eleveId: 'e3', serviceDate: '2026-07-14',
      status: 'cancelled', arrivedAt: new Date(), cancelledAt: new Date(), updatedAt: new Date(),
    }),
    seed('pickupRequests/2026-07-14_e4', {
      parentUid: 'parent1', eleveId: 'e4', serviceDate: '2026-07-14',
      status: 'waiting', arrivedAt: new Date(), updatedAt: new Date(),
    }),
    // Note légitime de prof1 (sa classe, sa matière, son élève)
    seed('notes/n1', { eleveId: 'e1', classe: '1A', matiere: 'Maths', note: 12 }),
    // Note de prof2 dans SA classe — cible du détournement par prof1
    seed('notes/n2', { eleveId: 'e2', classe: '2B', matiere: 'PC', note: 15 }),
    seed('notes/n7', { eleveId: 'e7', classe: '3C', matiere: 'Français', note: 17 }),
    seed('notes/n8', { eleveId: 'e8', classe: '4D', matiere: 'Anglais', note: 16 }),
    seed('absences/a1', { eleveId: 'e1', classe: '1A', date: '2026-07-10', seance: 'S1', statut: 'present' }),
    seed('absences/a2', { eleveId: 'e2', classe: '2B', date: '2026-07-10', seance: 'S1', statut: 'absent' }),
    seed('absences/a7', { eleveId: 'e7', classe: '3C', date: '2026-07-10', seance: 'S1', statut: 'absent' }),
    seed('absences/a8', { eleveId: 'e8', classe: '4D', date: '2026-07-10', seance: 'S1', statut: 'retard' }),
    seed('comportements/c7', { eleveId: 'e7', classe: '3C', kind: 'merite', teacherId: 'prof2' }),
    seed('comportements/c8', { eleveId: 'e8', classe: '4D', kind: 'merite', teacherId: 'prof2' }),
    seed('bulletins/b7', { eleveId: 'e7', classe: '3C', semestre: 'S1' }),
    seed('bulletins/b8', { eleveId: 'e8', classe: '4D', semestre: 'S1' }),
    seed('devoirs/d3c', {
      classeId: '3C', teacherId: 'prof2', titre: 'Devoir 3C', academicYear: '2025-2026',
    }),
    seed('devoirs/d4d', {
      classeId: '4D', teacherId: 'prof2', titre: 'Devoir 4D', academicYear: '2025-2026',
    }),
    seed('devoirs/d2b', {
      classeId: '2B', teacherId: 'prof2', titre: 'Devoir 2B', academicYear: '2025-2026',
    }),
    seed('ressources/res3c', {
      classeId: '3C', teacherId: 'prof2', titre: 'Ressource 3C', academicYear: '2025-2026', viewedBy: [],
    }),
    seed('ressources/res4d', {
      classeId: '4D', teacherId: 'prof2', titre: 'Ressource 4D', academicYear: '2025-2026', viewedBy: [],
    }),
    seed('ressources/res2b', {
      classeId: '2B', teacherId: 'prof2', titre: 'Ressource 2B', academicYear: '2025-2026', viewedBy: [],
    }),
    // Message privé déjà envoyé par parent1 à prof1 — cible des mutations
    seed('messages/m1', {
      type: 'direct', subject: 'Q', body: 'B', fromId: 'parent1', fromRole: 'parent',
      toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
    }),
    // Ancien message 100% legacy (toId string, pas de toType/toIds)
    seed('messages/legacy1', {
      subject: 'Ancien', body: 'Format legacy', fromId: 'admin1', toId: 'prof1',
    }),
    seed('messages/parentsBroadcast', {
      type: 'announcement', subject: 'Parents', body: 'Information parents',
      fromId: 'admin1', fromRole: 'admin', toType: 'parents', toIds: [],
      readBy: [], status: 'sent',
    }),
    seed('absenceRequests/r1', {
      parentUid: 'parent1', eleveId: 'e1', classe: '1A',
      date: '2026-07-10', status: 'pending', reason: 'maladie',
    }),
    seed('absenceRequests/r7', {
      parentUid: 'profParent', eleveId: 'e7', classe: '3C',
      date: '2026-07-15', status: 'pending', reason: 'rendez-vous',
    }),
    // parent1 est aussi chauffeur : son rôle parent reste intact.
    seed('driverProfiles/parent1', { uid: 'parent1', active: true, routeIds: ['R1'], vehicleId: 'V1' }),
    seed('driverProfiles/driver2', { uid: 'driver2', active: true, routeIds: ['R2'], vehicleId: 'V2' }),
    seed('driverProfiles/driverParent', { uid: 'driverParent', active: true, routeIds: ['R3'], vehicleId: 'V3' }),
    seed('transportTrips/trip1', {
      driverUid: 'parent1', serviceDate: '2026-07-14', direction: 'from_school',
      routeId: 'R1', routeLabel: 'Centre', vehicleId: 'V1', vehicleLabel: 'Navette 1',
      stops: [{ id: 'centre', label: 'Centre', sequence: 1 }], stopIds: ['centre'],
      scheduledTime: '16:30', status: 'scheduled', createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('transportTrips/trip1/passengers/e1', {
      tripId: 'trip1', eleveId: 'e1', elevePrenom: 'A', classe: '1A',
      serviceDate: '2026-07-14', direction: 'from_school', routeLabel: 'Centre',
      vehicleLabel: 'Navette 1', scheduledTime: '16:30', stopId: 'centre', stopLabel: 'Centre', status: 'scheduled',
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('transportTrips/trip1/passengers/e2', {
      tripId: 'trip1', eleveId: 'e2', elevePrenom: 'B', classe: '2B',
      serviceDate: '2026-07-14', direction: 'from_school', routeLabel: 'Centre',
      vehicleLabel: 'Navette 1', scheduledTime: '16:30', stopId: 'centre', stopLabel: 'Centre', status: 'scheduled',
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('transportTrips/trip1/passengers/e7', {
      tripId: 'trip1', eleveId: 'e7', elevePrenom: 'G', classe: '3C',
      serviceDate: '2026-07-14', direction: 'from_school', routeLabel: 'Centre',
      vehicleLabel: 'Navette 1', scheduledTime: '16:30', stopId: 'centre', stopLabel: 'Centre', status: 'scheduled',
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('transportTrips/trip1/passengers/e8', {
      tripId: 'trip1', eleveId: 'e8', elevePrenom: 'H', classe: '4D',
      serviceDate: '2026-07-14', direction: 'from_school', routeLabel: 'Centre',
      vehicleLabel: 'Navette 1', scheduledTime: '16:30', stopId: 'centre', stopLabel: 'Centre', status: 'scheduled',
      createdAt: new Date(), updatedAt: new Date(),
    }),
    seed('transportTrips/trip2', {
      driverUid: 'driver2', serviceDate: '2026-07-14', direction: 'to_school',
      routeId: 'R2', routeLabel: 'Martil', vehicleId: 'V2', vehicleLabel: 'Navette 2',
      stops: [{ id: 'martil', label: 'Martil', sequence: 1 }], stopIds: ['martil'],
      scheduledTime: '07:00', status: 'scheduled', createdAt: new Date(), updatedAt: new Date(),
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
    eleveId: 'e1', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await deny('persona parent sans preuve eleveId live',
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
    eleveId: 'e1', toType: 'user', toIds: Array.from({ length: 11 }, (_, i) => `u${i}`), readBy: [], status: 'sent',
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
    eleveId: 'e1', toType: 'user', toIds: ['prof1'], toId: 'all', readBy: [], status: 'sent',
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
    eleveId: 'e1', fromNom: 'Administration', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await allow('parent signe de son vrai nom (prénom nom, flux compose)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    eleveId: 'e1', fromNom: 'Pa Rent', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))
await allow('parent signe nom prénom (ordre inverse toléré)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    eleveId: 'e1', fromNom: 'Rent Pa', toType: 'user', toIds: ['prof1'], readBy: [], status: 'sent',
  }))

console.log('\n── 10. Non-régression lectures ──')
await allow('parent lit la note de SON enfant',
  getDoc(doc(asUser('parent1'), 'notes/n1')))
await deny('parent lit la note d\'un autre enfant',
  getDoc(doc(asUser('parent1'), 'notes/n2')))
await allow('destinataire lit son message',
  getDoc(doc(asUser('prof1'), 'messages/m1')))

console.log('\n── 10b. Capacité parent additive : prof/chauffeur liés uniquement ──')
await allow('prof-parent lit son entitlement de classes',
  getDoc(doc(asUser('profParent'), 'guardianAccess/profParent')))
await deny('prof sans enfant lit l\'entitlement d\'un autre',
  getDoc(doc(asUser('prof2'), 'guardianAccess/profParent')))
await deny('prof-parent fabrique son entitlement côté client',
  setDoc(doc(asUser('profParent'), 'guardianAccess/profParent'), {
    uid: 'profParent', childIds: ['e7', 'e2'], classes: ['3C', '2B'],
  }, { merge: true }))
await allow('chauffeur-parent lit l\'annuaire depuis son espace parent',
  getDoc(doc(asUser('driverParent'), 'directory/staff')))
await deny('chauffeur sans enfant lit l\'annuaire parent',
  getDoc(doc(asUser('driver2'), 'directory/staff')))
await deny('compte rôle parent sans enfant lit l\'annuaire parent',
  getDoc(doc(asUser('orphanParent'), 'directory/staff')))

await allow('prof-parent interroge ses enfants via parentUid',
  getDocs(query(collection(asUser('profParent'), 'eleves'), where('parentUid', '==', 'profParent'))))
await allow('chauffeur-parent lit SON enfant',
  getDoc(doc(asUser('driverParent'), 'eleves/e8')))
await deny('prof-parent lit l\'enfant du chauffeur-parent',
  getDoc(doc(asUser('profParent'), 'eleves/e8')))
await deny('chauffeur sans enfant lit l\'enfant du chauffeur-parent',
  getDoc(doc(asUser('driver2'), 'eleves/e8')))

await allow('prof-parent lit la note de SON enfant hors de ses classes enseignées',
  getDoc(doc(asUser('profParent'), 'notes/n7')))
await allow('chauffeur-parent lit la note de SON enfant',
  getDoc(doc(asUser('driverParent'), 'notes/n8')))
await deny('prof-parent lit la note de l\'enfant du chauffeur',
  getDoc(doc(asUser('profParent'), 'notes/n8')))
await deny('chauffeur-parent lit la note de l\'enfant du prof',
  getDoc(doc(asUser('driverParent'), 'notes/n7')))
await allow('prof-parent requête les notes bornées à SON enfant',
  getDocs(query(collection(asUser('profParent'), 'notes'), where('eleveId', '==', 'e7'))))
await deny('prof-parent requête les notes d\'un enfant non lié',
  getDocs(query(collection(asUser('profParent'), 'notes'), where('eleveId', '==', 'e8'))))

await allow('prof-parent lit l\'absence de SON enfant',
  getDoc(doc(asUser('profParent'), 'absences/a7')))
await allow('chauffeur-parent lit le comportement de SON enfant',
  getDoc(doc(asUser('driverParent'), 'comportements/c8')))
await allow('prof-parent lit le bulletin de SON enfant',
  getDoc(doc(asUser('profParent'), 'bulletins/b7')))
await deny('chauffeur-parent lit le bulletin d\'un autre enfant',
  getDoc(doc(asUser('driverParent'), 'bulletins/b7')))

await allow('prof-parent lit les devoirs de la classe de SON enfant',
  getDocs(query(collection(asUser('profParent'), 'devoirs'), where('classeId', '==', '3C'))))
await allow('chauffeur-parent lit les devoirs de la classe de SON enfant',
  getDocs(query(collection(asUser('driverParent'), 'devoirs'), where('classeId', '==', '4D'))))
await allow('parent classique lit les devoirs de la classe de SON enfant',
  getDocs(query(collection(asUser('parent1'), 'devoirs'), where('classeId', '==', '1A'))))
await deny('parent classique lit les devoirs d\'une classe non liée',
  getDocs(query(collection(asUser('parent1'), 'devoirs'), where('classeId', '==', '2B'))))
await deny('compte rôle parent sans enfant lit des devoirs',
  getDocs(query(collection(asUser('orphanParent'), 'devoirs'), where('classeId', '==', '3C'))))
await deny('prof-parent lit les devoirs d\'une classe ni enseignée ni liée',
  getDocs(query(collection(asUser('profParent'), 'devoirs'), where('classeId', '==', '2B'))))
await deny('chauffeur-parent lit les devoirs d\'une classe non liée',
  getDocs(query(collection(asUser('driverParent'), 'devoirs'), where('classeId', '==', '2B'))))
await allow('prof-parent lit les ressources de la classe de SON enfant',
  getDocs(query(collection(asUser('profParent'), 'ressources'), where('classeId', '==', '3C'))))
await allow('chauffeur-parent lit les ressources de la classe de SON enfant',
  getDocs(query(collection(asUser('driverParent'), 'ressources'), where('classeId', '==', '4D'))))
await deny('chauffeur-parent lit les ressources d\'une classe non liée',
  getDocs(query(collection(asUser('driverParent'), 'ressources'), where('classeId', '==', '2B'))))

await allow('prof-parent lit sa déclaration d\'absence existante',
  getDoc(doc(asUser('profParent'), 'absenceRequests/r7')))
await allow('prof-parent interroge ses déclarations bornées à SON enfant',
  getDocs(query(
    collection(asUser('profParent'), 'absenceRequests'),
    where('parentUid', '==', 'profParent'),
    where('eleveId', '==', 'e7'),
  )))
await deny('prof-parent tente une requête non bornée à un enfant live',
  getDocs(query(
    collection(asUser('profParent'), 'absenceRequests'),
    where('parentUid', '==', 'profParent'),
  )))
await allow('prof-parent déclare une absence pour SON enfant',
  setDoc(doc(asUser('profParent'), 'absenceRequests/new_r7'), {
    parentUid: 'profParent', eleveId: 'e7', classe: '3C',
    date: '2026-07-16', reason: 'médical', status: 'pending',
  }))
await allow('chauffeur-parent déclare une absence pour SON enfant',
  setDoc(doc(asUser('driverParent'), 'absenceRequests/new_r8'), {
    parentUid: 'driverParent', eleveId: 'e8', classe: '4D',
    date: '2026-07-16', reason: 'médical', status: 'pending',
  }))
await deny('chauffeur sans enfant déclare une absence pour un enfant non lié',
  setDoc(doc(asUser('driver2'), 'absenceRequests/forged_r8'), {
    parentUid: 'driver2', eleveId: 'e8', classe: '4D',
    date: '2026-07-16', reason: 'faux', status: 'pending',
  }))

await allow('prof-parent annonce la sortie de SON enfant',
  setDoc(doc(asUser('profParent'), 'pickupRequests/2026-07-14_e7'), {
    parentUid: 'profParent', eleveId: 'e7', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('chauffeur-parent annonce la sortie de SON enfant',
  setDoc(doc(asUser('driverParent'), 'pickupRequests/2026-07-14_e8'), {
    parentUid: 'driverParent', eleveId: 'e8', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur sans enfant annonce la sortie d\'un enfant non lié',
  setDoc(doc(asUser('driver2'), 'pickupRequests/2026-07-14_e8'), {
    parentUid: 'driver2', eleveId: 'e8', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('prof-parent suit sa demande de sortie bornée à SON enfant',
  getDocs(query(
    collection(asUser('profParent'), 'pickupRequests'),
    where('parentUid', '==', 'profParent'),
    where('serviceDate', '==', '2026-07-14'),
    where('eleveId', '==', 'e7'),
  )))

await allow('prof-parent lit le passager transport de SON enfant',
  getDoc(doc(asUser('profParent'), 'transportTrips/trip1/passengers/e7')))
await allow('chauffeur-parent suit le transport de SON enfant via collectionGroup',
  getDocs(query(
    collectionGroup(asUser('driverParent'), 'passengers'),
    where('eleveId', '==', 'e8'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await deny('chauffeur sans enfant lit un passager non assigné',
  getDoc(doc(asUser('driver2'), 'transportTrips/trip1/passengers/e8')))
await deny('prof-parent lit le document global de la tournée',
  getDoc(doc(asUser('profParent'), 'transportTrips/trip1')))

await allow('prof-parent lit une diffusion destinée aux parents',
  getDoc(doc(asUser('profParent'), 'messages/parentsBroadcast')))
await allow('chauffeur-parent lit une diffusion destinée aux parents',
  getDoc(doc(asUser('driverParent'), 'messages/parentsBroadcast')))
await allow('parent classique lié lit une diffusion destinée aux parents',
  getDoc(doc(asUser('parent1'), 'messages/parentsBroadcast')))
await deny('prof sans enfant lit une diffusion destinée aux parents',
  getDoc(doc(asUser('prof2'), 'messages/parentsBroadcast')))
await deny('chauffeur sans enfant lit une diffusion destinée aux parents',
  getDoc(doc(asUser('driver2'), 'messages/parentsBroadcast')))
await deny('compte rôle parent sans enfant lit une diffusion destinée aux parents',
  getDoc(doc(asUser('orphanParent'), 'messages/parentsBroadcast')))
await allow('prof-parent écrit comme parent avec preuve eleveId live',
  addDoc(collection(asUser('profParent'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'profParent', fromNom: 'Prof Parent',
    fromRole: 'parent', eleveId: 'e7', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await allow('chauffeur-parent écrit comme parent avec preuve eleveId live',
  addDoc(collection(asUser('driverParent'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'driverParent', fromNom: 'Driver Parent',
    fromRole: 'parent', eleveId: 'e8', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await deny('prof usurpe la persona parent sans eleveId',
  addDoc(collection(asUser('profParent'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'profParent', fromNom: 'Prof Parent',
    fromRole: 'parent', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await deny('prof usurpe la persona parent avec un enfant non lié',
  addDoc(collection(asUser('prof2'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'prof2',
    fromRole: 'parent', eleveId: 'e7', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await deny('prof-parent contourne la borne parent avec 11 destinataires',
  addDoc(collection(asUser('profParent'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'profParent', fromNom: 'Prof Parent',
    fromRole: 'parent', eleveId: 'e7', toType: 'user',
    toIds: Array.from({ length: 11 }, (_, i) => `u${i}`), readBy: [], status: 'sent',
  }))

console.log('\n── 11. Smart Pickup : parent, admin et compte hybride ──')
await allow('parent annonce son arrivée pour SON enfant',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1'), {
    parentUid: 'parent1', eleveId: 'e1', serviceDate: '2026-07-14',
    status: 'waiting', vehicleDescription: 'Voiture blanche',
    arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('parent annonce l’arrivée pour l’enfant d’un autre parent',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e2'), {
    parentUid: 'parent1', eleveId: 'e2', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('parent contourne l’unicité avec un ID de demande libre',
  setDoc(doc(asUser('parent1'), 'pickupRequests/id-libre'), {
    parentUid: 'parent1', eleveId: 'e1', serviceDate: '2026-07-16',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('parent crée directement une demande prête',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-17_e1'), {
    parentUid: 'parent1', eleveId: 'e1', serviceDate: '2026-07-17',
    status: 'ready', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('parent interroge uniquement ses demandes du jour',
  getDocs(query(
    collection(asUser('parent1'), 'pickupRequests'),
    where('parentUid', '==', 'parent1'),
    where('serviceDate', '==', '2026-07-14'),
    where('eleveId', '==', 'e1'),
  )))
await deny('parent tente une file du jour non filtrée par parent',
  getDocs(query(
    collection(asUser('parent1'), 'pickupRequests'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await deny('parent forge une arrivée future sans session ouverte',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-15_e5'), {
    parentUid: 'parent1', eleveId: 'e5', serviceDate: '2026-07-15',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('parent ne peut pas ouvrir lui-même la session Smart Pickup',
  setDoc(doc(asUser('parent1'), 'pickupSessions/2026-07-15'), {
    serviceDate: '2026-07-15', isOpen: true, openedByUid: 'parent1',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('admin ne peut pas ouvrir un créneau de plus de 6 heures',
  setDoc(doc(asUser('admin1'), 'pickupSessions/too-long'), {
    serviceDate: 'too-long', isOpen: true, openedByUid: 'admin1',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 7 * 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('admin rouvre une session restée isOpen après expiration',
  updateDoc(doc(asUser('admin1'), 'pickupSessions/expired'), {
    openedByUid: 'admin1', opensAt: serverTimestamp(),
    closesAt: new Date(Date.now() + 60 * 60_000), updatedAt: serverTimestamp(),
  }))
await allow('parent annule tant que l’enfant est en attente',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('parent ré-annonce après SA propre annulation',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    cancelledAt: deleteField(), vehicleDescription: 'Dacia blanche',
  }))
await deny('parent se fait passer pour l’admin et appelle l’élève',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'called', calledAt: serverTimestamp(), managedByUid: 'parent1',
    updatedAt: serverTimestamp(),
  }))
await allow('admin appelle l’élève suivant',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'called', calledAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('parent ne peut plus annuler après l’appel',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('admin marque l’élève prêt',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'ready', readyAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await allow('admin confirme la remise',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e1'), {
    status: 'completed', completedAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await allow('parent lit le statut terminé de SON enfant',
  getDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e1')))
await deny('autre parent lit la demande nominative',
  getDoc(doc(asUser('parent2'), 'pickupRequests/2026-07-14_e1')))

await allow('parent crée une seconde demande du jour pour tester la machine d’état',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e5'), {
    parentUid: 'parent1', eleveId: 'e5', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('admin saute waiting → ready',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e5'), {
    status: 'ready', readyAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('admin préremplit readyAt pendant waiting → called',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e5'), {
    status: 'called', calledAt: serverTimestamp(), readyAt: serverTimestamp(),
    managedByUid: 'admin1', updatedAt: serverTimestamp(),
  }))
await allow('admin appelle la seconde demande avec son seul horodatage',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e5'), {
    status: 'called', calledAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('admin réécrit calledAt pendant called → ready',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e5'), {
    status: 'ready', calledAt: serverTimestamp(), readyAt: serverTimestamp(),
    managedByUid: 'admin1', updatedAt: serverTimestamp(),
  }))

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await Promise.all([
    updateDoc(doc(db, 'eleves/e3'), { parentUid: 'parent2' }),
    updateDoc(doc(db, 'eleves/e4'), { parentUid: 'parent2' }),
  ])
})
await deny('ancien parent ne lit plus la demande après réattribution',
  getDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e4')))
await deny('ancien parent ne peut plus annuler après réattribution',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e4'), {
    status: 'cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('admin ne peut pas avancer une demande devenue obsolète après réattribution',
  updateDoc(doc(asUser('admin1'), 'pickupRequests/2026-07-14_e4'), {
    status: 'called', calledAt: serverTimestamp(), managedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('ancien parent ne peut pas réannoncer après réattribution',
  updateDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e3'), {
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    cancelledAt: deleteField(),
  }))
await allow('admin ferme la session du jour',
  updateDoc(doc(asUser('admin1'), 'pickupSessions/2026-07-14'), {
    isOpen: false, closedAt: serverTimestamp(), closedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('parent ne peut plus annoncer après fermeture',
  setDoc(doc(asUser('parent1'), 'pickupRequests/2026-07-14_e6'), {
    parentUid: 'parent1', eleveId: 'e6', serviceDate: '2026-07-14',
    status: 'waiting', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

console.log('\n── 12. Transport : chauffeur assigné seulement ──')
await allow('parent-chauffeur lit son profil chauffeur additif',
  getDoc(doc(asUser('parent1'), 'driverProfiles/parent1')))
await deny('parent lit le profil chauffeur d’un autre compte',
  getDoc(doc(asUser('parent2'), 'driverProfiles/parent1')))
await deny('parent s’auto-active comme chauffeur',
  setDoc(doc(asUser('parent2'), 'driverProfiles/parent2'), {
    uid: 'parent2', active: true, routeIds: ['R1'],
  }))
await allow('admin ajuste les circuits d’un chauffeur',
  updateDoc(doc(asUser('admin1'), 'driverProfiles/parent1'), { routeIds: ['R1', 'R3'] }))

await allow('chauffeur hybride interroge uniquement ses tournées',
  getDocs(query(
    collection(asUser('parent1'), 'transportTrips'),
    where('driverUid', '==', 'parent1'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await deny('chauffeur tente de lister toutes les tournées du jour',
  getDocs(query(
    collection(asUser('parent1'), 'transportTrips'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await allow('chauffeur lit sa tournée assignée',
  getDoc(doc(asUser('parent1'), 'transportTrips/trip1')))
await deny('autre chauffeur lit une tournée non assignée',
  getDoc(doc(asUser('driver2'), 'transportTrips/trip1')))
await deny('parent passager ne lit pas le document global de la tournée',
  getDoc(doc(asUser('parent2'), 'transportTrips/trip1')))
await deny('chauffeur crée lui-même une tournée',
  setDoc(doc(asUser('parent1'), 'transportTrips/forged-trip'), {
    driverUid: 'parent1', serviceDate: '2026-07-14', direction: 'from_school',
    routeId: 'R1', routeLabel: 'Centre', vehicleLabel: 'Navette 1',
    stops: [{ id: 'centre', label: 'Centre', sequence: 1 }], stopIds: ['centre'],
    scheduledTime: '17:00', status: 'scheduled',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne peut pas contourner la callable pour démarrer l’embarquement',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    status: 'boarding', boardingAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur réassigne la tournée à un autre UID',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    driverUid: 'driver2', updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne peut pas injecter un état arrivé directement',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    status: 'arrived', arrivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne contourne pas la callable de retard',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    delayMinutes: 10, delayReason: 'Circulation', updatedAt: serverTimestamp(),
  }))
await deny('chauffeur injecte un retard excessif',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    delayMinutes: 9999, updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne démarre pas le trajet sans horodatage via accès direct',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    status: 'in_transit', updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne démarre pas non plus avec un horodatage client',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    status: 'in_transit', startedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'transportTrips/trip1'), {
    status: 'boarding', boardingAt: new Date(), updatedAt: new Date(),
  })
})

await allow('chauffeur assigné lit la liste minimale de passagers',
  getDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e2')))
await allow('parent lit uniquement la fiche trajet de SON enfant',
  getDoc(doc(asUser('parent2'), 'transportTrips/trip1/passengers/e2')))
await allow('parent suit les trajets du jour avec une requête bornée à SON enfant',
  getDocs(query(
    collectionGroup(asUser('parent2'), 'passengers'),
    where('eleveId', '==', 'e2'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await deny('parent tente de lister tous les passagers du jour',
  getDocs(query(
    collectionGroup(asUser('parent2'), 'passengers'),
    where('serviceDate', '==', '2026-07-14'),
  )))
await deny('parent lit la fiche trajet d’un autre enfant',
  getDoc(doc(asUser('parent2'), 'transportTrips/trip1/passengers/e1')))
await deny('chauffeur non assigné lit un passager',
  getDoc(doc(asUser('driver2'), 'transportTrips/trip1/passengers/e1')))
await deny('parent modifie le statut transport de son enfant',
  updateDoc(doc(asUser('parent2'), 'transportTrips/trip1/passengers/e2'), {
    status: 'boarded', boardedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('chauffeur confirme la montée',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e1'), {
    status: 'boarded', boardedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne peut pas réécrire boardedAt au même état',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e1'), {
    boardedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('statut absent sans absentAt serveur est refusé',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e2'), {
    status: 'absent', updatedAt: serverTimestamp(),
  }))
await allow('chauffeur marque un absent avec son horodatage serveur',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e2'), {
    status: 'absent', absentAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur non assigné confirme une montée',
  updateDoc(doc(asUser('driver2'), 'transportTrips/trip1/passengers/e2'), {
    status: 'boarded', boardedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'transportTrips/trip1'), {
    status: 'in_transit', startedAt: new Date(), updatedAt: new Date(),
  })
})
await deny('même état ne peut pas réécrire startedAt',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    startedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('admin ne peut pas ajouter un passager après le départ',
  setDoc(doc(asUser('admin1'), 'transportTrips/trip1/passengers/e5'), {
    tripId: 'trip1', eleveId: 'e5', elevePrenom: 'E', classe: '1A',
    serviceDate: '2026-07-14', direction: 'from_school', routeLabel: 'Centre',
    vehicleLabel: 'Navette 1', scheduledTime: '16:30', stopId: 'centre',
    stopLabel: 'Centre', status: 'scheduled',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('chauffeur confirme la descente après la montée',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e1'), {
    status: 'dropped_off', droppedOffAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne peut pas réécrire l’identité du passager',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1/passengers/e2'), {
    elevePrenom: 'Falsifié', updatedAt: serverTimestamp(),
  }))

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'transportTrips/trip1'), {
    status: 'arrived', arrivedAt: new Date(), updatedAt: new Date(),
  })
})
await deny('client ne termine jamais directement une tournée',
  updateDoc(doc(asUser('parent1'), 'transportTrips/trip1'), {
    status: 'completed', completedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

// ── Bilan ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
await testEnv.cleanup()
process.exit(0)
