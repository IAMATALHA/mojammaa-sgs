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
 *  6. devoirs : preuve parent + validation finale du professeur propriétaire
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
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, collectionGroup, query, where,
  orderBy, limit,
  arrayUnion, writeBatch, serverTimestamp, deleteField, documentId,
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
    seed('users/profSameClass', {
      uid: 'profSameClass', role: 'professeur', classes: ['1A'], matiere: 'Maths',
    }),
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
    seed('devoirs/d1a', {
      classeId: '1A', teacherId: 'prof1', titre: 'Devoir 1A',
      dateLimite: '2026-07-18', academicYear: '2025-2026',
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
    // Notification de devoir de prof1 aux parents de 1A (cf. manageHomework)
    seed('messages/hw1a', {
      type: 'announcement', category: 'homework', subject: 'Nouveau devoir', body: 'B',
      fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'],
      classe: '1A', readBy: [], status: 'sent',
    }),
    // Annonce de l'administration à la classe 1A (compose web admin)
    seed('messages/admin1a', {
      type: 'announcement', category: 'admin', subject: 'Sortie', body: 'B',
      fromId: 'admin1', fromRole: 'admin', toType: 'user', toIds: ['parent1'],
      classe: '1A', readBy: [], status: 'sent',
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
const asGuest = () => testEnv.unauthenticatedContext().firestore()

// ── Mini harness ──────────────────────────────────────────────────────────
let passed = 0
const failed = []
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed.push(name); console.error(`  ❌ ${name}\n     ${e.message}`) }
}
const allow = (name, p) => test(`[AUTORISÉ] ${name}`, () => assertSucceeds(p))
const deny  = (name, p) => test(`[REFUSÉ]  ${name}`, () => assertFails(p))

const mathComponent = (ordinal, note, overrides = {}) => ({
  slot: `written_${ordinal}`,
  category: 'control',
  kind: 'written',
  ordinal,
  label: `Contrôle écrit ${ordinal}`,
  note,
  bareme: 20,
  ...overrides,
})

const structuredMathNote = (evaluations, overrides = {}) => ({
  eleveId: 'e1',
  classe: '1A',
  cycle: 'college',
  niveau: '1AC',
  matiere: 'Maths',
  note: evaluations.reduce((sum, item) => sum + Number(item.note || 0), 0) / evaluations.length,
  bareme: 20,
  schemaVersion: 2,
  gradeSource: 'structured',
  evaluationPolicyVersion: 'college-evaluation-2025-2026-v1',
  subjectKey: 'mathematiques',
  evaluations,
  activitesIntegrees: null,
  calculation: {
    status: evaluations.length === 3 ? 'complete' : 'provisional',
    completed: evaluations.length,
    expected: 3,
    completionRate: Math.round((evaluations.length / 3) * 100),
  },
  ...overrides,
})

console.log('\n── 1. Messages : enveloppe immuable ──')
await allow('parent crée un message direct (flux compose parent)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    eleveId: 'e1', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await deny('persona parent sans preuve eleveId live',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
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

console.log('\n── 4a. Notes v2 : composantes bornées et rétrocompatibilité ──')
await allow('prof crée une note v2 provisoire avec C1 seulement',
  setDoc(doc(asUser('prof1'), 'notes/v2_provisional'),
    structuredMathNote([mathComponent(1, 14)])))
await allow('prof crée une note v2 complète C1/C2/C3',
  setDoc(doc(asUser('prof1'), 'notes/v2_complete'),
    structuredMathNote([
      mathComponent(1, 10),
      mathComponent(2, 12),
      mathComponent(3, 14),
    ])))
await allow('prof met à jour une note v2 complète (flux modal/import)',
  setDoc(doc(asUser('prof1'), 'notes/v2_complete'),
    structuredMathNote([
      mathComponent(1, 11),
      mathComponent(2, 13),
      mathComponent(3, 15),
    ]), { merge: true }))
await allow('admin crée une note v2 avec activité intégrée valide',
  setDoc(doc(asUser('admin1'), 'notes/v2_integrated'), {
    ...structuredMathNote([
      mathComponent(1, 12),
      {
        slot: 'integrated_activities',
        category: 'integrated',
        kind: 'integrated_activity',
        ordinal: 2,
        label: 'Activités intégrées',
        note: 16,
        bareme: 20,
      },
    ], {
      matiere: 'Arabe',
      subjectKey: 'arabe',
      note: 14,
      activitesIntegrees: { note: 16, label: 'Activités intégrées' },
      calculation: {
        status: 'provisional', completed: 2, expected: 3, completionRate: 67,
      },
    }),
  }))
await deny('admin ne peut pas appliquer le schéma v2 collège au primaire AEP',
  setDoc(doc(asUser('admin1'), 'notes/v2_primary_scale'), structuredMathNote([
    mathComponent(1, 7, { bareme: 10 }),
  ], {
    classe: '5AEP-1',
    cycle: 'primaire',
    niveau: '5AEP',
    note: 7,
    bareme: 10,
  })))
await deny('admin ne peut pas déclarer une classe AEP sur 20',
  setDoc(doc(asUser('admin1'), 'notes/v2_primary_wrong_scale'),
    structuredMathNote([mathComponent(1, 14)], {
      classe: '5AEP-1',
      cycle: 'primaire',
      niveau: '5AEP',
      note: 14,
      bareme: 20,
    })))
await deny('admin ne peut pas déclarer une classe non-AEP sur 10',
  setDoc(doc(asUser('admin1'), 'notes/v2_college_wrong_scale'), structuredMathNote([
    mathComponent(1, 7, { bareme: 10 }),
  ], {
    classe: '1APIC-1',
    note: 7,
    bareme: 10,
  })))
await deny('admin ne peut pas appliquer le schéma v2 collège au préscolaire',
  setDoc(doc(asUser('admin1'), 'notes/v2_preschool'), structuredMathNote([
    mathComponent(1, 12),
  ], {
    classe: 'GS-1',
    cycle: 'prescolaire',
    niveau: 'GS',
    note: 12,
  })))
await deny('prof envoie une moyenne supérieure au barème',
  setDoc(doc(asUser('prof1'), 'notes/v2_bad_average'),
    structuredMathNote([mathComponent(1, 14)], { note: 21 })))
await deny('prof envoie une composante négative',
  setDoc(doc(asUser('prof1'), 'notes/v2_negative_component'),
    structuredMathNote([mathComponent(1, -1)], { note: 0 })))
await deny('prof envoie une composante sous forme de chaîne',
  setDoc(doc(asUser('prof1'), 'notes/v2_string_component'),
    structuredMathNote([mathComponent(1, '14')], { note: 14 })))
await deny('prof envoie un barème non réglementaire',
  setDoc(doc(asUser('prof1'), 'notes/v2_bad_scale'),
    structuredMathNote([mathComponent(1, 10)], { bareme: 12 })))
await deny('prof envoie une liste de composantes vide',
  setDoc(doc(asUser('prof1'), 'notes/v2_empty'),
    structuredMathNote([], {
      note: 0,
      calculation: { status: 'provisional', completed: 1, expected: 3, completionRate: 0 },
    })))
await deny('admin ne contourne pas la limite de cinq composantes',
  setDoc(doc(asUser('admin1'), 'notes/v2_too_many'),
    structuredMathNote(Array.from({ length: 6 }, (_, index) =>
      mathComponent(index + 1, 10, { slot: `slot_${index + 1}`, ordinal: Math.min(index + 1, 5) })), {
      calculation: { status: 'complete', completed: 5, expected: 5, completionRate: 100 },
    })))
await deny('prof envoie une catégorie de composante inconnue',
  setDoc(doc(asUser('prof1'), 'notes/v2_bad_category'),
    structuredMathNote([mathComponent(1, 14, { category: 'exam' })])))
await deny('prof ajoute un champ libre dans une composante',
  setDoc(doc(asUser('prof1'), 'notes/v2_extra_component_field'),
    structuredMathNote([mathComponent(1, 14, { secret: 'x' })])))
await deny('admin envoie une activité intégrée hors barème',
  setDoc(doc(asUser('admin1'), 'notes/v2_bad_integrated'),
    structuredMathNote([
      mathComponent(1, 12),
      {
        slot: 'integrated_activities',
        category: 'integrated',
        kind: 'integrated_activity',
        ordinal: 2,
        label: 'Activités intégrées',
        note: 25,
        bareme: 20,
      },
    ], {
      matiere: 'Arabe',
      subjectKey: 'arabe',
      note: 12,
      activitesIntegrees: { note: 25, label: 'Activités intégrées' },
      calculation: {
        status: 'provisional', completed: 2, expected: 3, completionRate: 67,
      },
    })))
await deny('prof duplique le même slot de contrôle',
  setDoc(doc(asUser('prof1'), 'notes/v2_duplicate_slot'),
    structuredMathNote([
      mathComponent(1, 10),
      mathComponent(2, 12, { slot: 'written_1' }),
    ])))
await deny('un document v2 ne peut pas être rétrogradé en legacy',
  updateDoc(doc(asUser('prof1'), 'notes/v2_complete'), {
    schemaVersion: deleteField(),
    evaluations: deleteField(),
    evaluationPolicyVersion: deleteField(),
    subjectKey: deleteField(),
    calculation: deleteField(),
  }))
for (const [field, value] of [
  ['evaluationPolicyVersion', 'college-evaluation-2025-2026-v1'],
  ['policyVersion', 'college-evaluation-2025-2026-v1'],
  ['subjectKey', 'mathematiques'],
  ['evaluations', [mathComponent(1, 14)]],
]) {
  await deny(`un document legacy sans schemaVersion ne peut pas porter ${field}`,
    setDoc(doc(asUser('admin1'), `notes/legacy_hidden_${field}`), {
      eleveId: 'e1',
      classe: '1A',
      matiere: 'Maths',
      note: 14,
      [field]: value,
    }))
  await deny(`un document schemaVersion 1 ne peut pas porter ${field}`,
    setDoc(doc(asUser('admin1'), `notes/legacy_v1_hidden_${field}`), {
      eleveId: 'e1',
      classe: '1A',
      matiere: 'Maths',
      note: 14,
      schemaVersion: 1,
      [field]: value,
    }))
}

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
    eleveId: 'e1', toType: 'user', toIds: ['admin1'], toId: 'all', readBy: [], status: 'sent',
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
    eleveId: 'e1', fromNom: 'Administration', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await allow('parent signe de son vrai nom (prénom nom, flux compose)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    eleveId: 'e1', fromNom: 'Pa Rent', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))
await allow('parent signe nom prénom (ordre inverse toléré)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'parent1', fromRole: 'parent',
    eleveId: 'e1', fromNom: 'Rent Pa', toType: 'user', toIds: ['admin1'], readBy: [], status: 'sent',
  }))

console.log('\n── 10. Non-régression lectures ──')
await allow('parent lit la note de SON enfant',
  getDoc(doc(asUser('parent1'), 'notes/n1')))
await deny('parent lit la note d\'un autre enfant',
  getDoc(doc(asUser('parent1'), 'notes/n2')))
await allow('destinataire lit son message',
  getDoc(doc(asUser('prof1'), 'messages/m1')))

console.log('\n── 10-bis. Cloison entre profs d\'une même classe (27/09/2026) ──')
await allow('prof lit SON devoir',
  getDoc(doc(asUser('prof1'), 'devoirs/d1a')))
await allow('prof liste SES devoirs (teacherId + année)',
  getDocs(query(collection(asUser('prof1'), 'devoirs'),
    where('teacherId', '==', 'prof1'), where('academicYear', 'in', ['2025-2026']))))
await deny('collègue de la même classe lit le devoir d\'un autre prof',
  getDoc(doc(asUser('profSameClass'), 'devoirs/d1a')))
await deny('collègue de la même classe liste les devoirs de la classe',
  getDocs(query(collection(asUser('profSameClass'), 'devoirs'), where('classeId', '==', '1A'))))
await allow('auteur lit sa notification de devoir',
  getDoc(doc(asUser('prof1'), 'messages/hw1a')))
await deny('collègue de la même classe lit la notification de devoir d\'un autre prof',
  getDoc(doc(asUser('profSameClass'), 'messages/hw1a')))
await deny('collègue interroge tous les messages tagués de sa classe',
  getDocs(query(collection(asUser('profSameClass'), 'messages'), where('classe', '==', '1A'))))
await allow('prof lit l\'annonce de l\'administration à SA classe',
  getDoc(doc(asUser('profSameClass'), 'messages/admin1a')))
await allow('prof interroge les annonces admin de SA classe (requête web)',
  getDocs(query(collection(asUser('profSameClass'), 'messages'),
    where('classe', '==', '1A'), where('fromRole', '==', 'admin'), where('category', '==', 'admin'))))
await deny('prof interroge les annonces admin d\'une classe qu\'il n\'enseigne pas',
  getDocs(query(collection(asUser('prof2'), 'messages'),
    where('classe', '==', '1A'), where('fromRole', '==', 'admin'), where('category', '==', 'admin'))))
await allow('parent destinataire lit toujours la notification de devoir',
  getDoc(doc(asUser('parent1'), 'messages/hw1a')))

console.log('\n── 10a. Devoirs : preuve parent et décision professeur ──')
const STORAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/'
const proofFile = (name, uid = 'parent1', mime = 'image/jpeg') => ({
  url: `${STORAGE_URL}homework-submissions%2F${uid}%2F1759000000000_${name}?alt=media&token=t`, name, mime,
})
const homeworkProof = (eleveId = 'e1', parentUid = 'parent1') => ({
  homeworkId: 'd1a',
  eleveId,
  classeId: '1A',
  parentUid,
  teacherId: 'prof1',
  status: 'submitted',
  attachments: [proofFile('proof.jpg', parentUid)],
  parentComment: 'Travail joint',
  submittedAt: serverTimestamp(),
  submittedByUid: parentUid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

await allow('parent envoie une preuve pour SON enfant',
  setDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e1'), homeworkProof()))
await deny('parent forge l’identifiant déterministe de la soumission',
  setDoc(doc(asUser('parent1'), 'homeworkSubmissions/id-libre'), homeworkProof()))
await deny('parent envoie une preuve sans pièce jointe',
  setDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e3'), {
    ...homeworkProof('e3'), attachments: [],
  }))
await deny('autre parent soumet pour un enfant qui ne lui appartient pas',
  setDoc(doc(asUser('parent2'), 'homeworkSubmissions/d1a_e3'), homeworkProof('e3', 'parent2')))
await allow('parent lit la soumission de SON enfant',
  getDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e1')))
await deny('autre parent lit une preuve nominative',
  getDoc(doc(asUser('parent2'), 'homeworkSubmissions/d1a_e1')))
await allow('parent interroge uniquement ses soumissions',
  getDocs(query(
    collection(asUser('parent1'), 'homeworkSubmissions'),
    where('parentUid', '==', 'parent1'),
    where('eleveId', '==', 'e1'),
  )))
await deny('parent tente de lister toutes les soumissions',
  getDocs(collection(asUser('parent1'), 'homeworkSubmissions')))
await allow('prof propriétaire interroge les rendus de SON devoir',
  getDocs(query(
    collection(asUser('prof1'), 'homeworkSubmissions'),
    where('homeworkId', '==', 'd1a'),
  )))
await deny('prof de la même classe lit le rendu d’un devoir qu’il ne possède pas',
  getDoc(doc(asUser('profSameClass'), 'homeworkSubmissions/d1a_e1')))
await deny('parent auto-valide son devoir comme rendu',
  updateDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e1'), {
    status: 'graded',
    reviewedAt: serverTimestamp(),
    reviewedByUid: 'parent1',
    updatedAt: serverTimestamp(),
  }))
await allow('prof propriétaire valide le rendu',
  updateDoc(doc(asUser('prof1'), 'homeworkSubmissions/d1a_e1'), {
    status: 'graded',
    reviewedAt: serverTimestamp(),
    reviewedByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('parent ne réécrit plus une décision validée',
  updateDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e1'), {
    status: 'submitted',
    attachments: [proofFile('new.jpg')],
    parentComment: 'Nouvelle version',
    submittedAt: serverTimestamp(),
    submittedByUid: 'parent1',
    updatedAt: serverTimestamp(),
  }))
await allow('prof marque un autre élève non rendu',
  setDoc(doc(asUser('prof1'), 'homeworkSubmissions/d1a_e3'), {
    homeworkId: 'd1a', eleveId: 'e3', classeId: '1A',
    parentUid: 'parent1', teacherId: 'prof1', status: 'not_submitted',
    attachments: [], parentComment: '',
    reviewedAt: serverTimestamp(), reviewedByUid: 'prof1',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('parent répond à non rendu avec une preuve tardive à revalider',
  updateDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e3'), {
    status: 'submitted_late',
    attachments: [proofFile('late.pdf', 'parent1', 'application/pdf')],
    parentComment: 'Envoi tardif',
    submittedAt: serverTimestamp(),
    submittedByUid: 'parent1',
    updatedAt: serverTimestamp(),
  }))
await deny('prof non propriétaire modifie le statut',
  updateDoc(doc(asUser('profSameClass'), 'homeworkSubmissions/d1a_e3'), {
    status: 'graded',
    reviewedAt: serverTimestamp(),
    reviewedByUid: 'profSameClass',
    updatedAt: serverTimestamp(),
  }))
await allow('prof propriétaire valide la preuve tardive',
  updateDoc(doc(asUser('prof1'), 'homeworkSubmissions/d1a_e3'), {
    status: 'graded',
    reviewedAt: serverTimestamp(),
    reviewedByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await allow('admin conserve la lecture globale pour les statistiques',
  getDocs(collection(asUser('admin1'), 'homeworkSubmissions')))

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

console.log('\n── 13. Prière : suivi manuel de classe, sans donnée élève ──')
const prayerStart = (startedByUid, classe = '1A', extra = {}) => ({
  serviceDate: '2026-07-16',
  classe,
  status: 'going',
  startedAt: serverTimestamp(),
  startedByUid,
  updatedAt: serverTimestamp(),
  ...extra,
})

// La création passe exclusivement par la callable Admin SDK, qui vérifie le
// créneau en cours. Toute écriture Firestore directe est refusée, même si le
// document présenté serait par ailleurs bien formé.
await deny('prof ne crée jamais directement une session de SA classe',
  setDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A-direct'),
    prayerStart('prof1')))
await deny('autre prof ne crée jamais directement une session',
  setDoc(doc(asUser('prof2'), 'prayerClassSessions/2026-07-16_2B-direct'),
    prayerStart('prof2', '2B')))
await deny('admin ne crée jamais directement une session',
  setDoc(doc(asUser('admin1'), 'prayerClassSessions/2026-07-16_admin-attempt'),
    prayerStart('admin1')))
await deny('parent ne crée jamais directement une session',
  setDoc(doc(asUser('parent1'), 'prayerClassSessions/2026-07-16_parent-attempt'),
    prayerStart('parent1')))
await deny('chauffeur ne crée jamais directement une session',
  setDoc(doc(asUser('driver2'), 'prayerClassSessions/2026-07-16_driver-attempt'),
    prayerStart('driver2')))
await deny('visiteur ne crée jamais directement une session',
  setDoc(doc(asGuest(), 'prayerClassSessions/2026-07-16_guest-attempt'),
    prayerStart('guest')))

// Simulation des documents créés par la callable (Admin SDK contourne les
// rules). Les transitions client suivantes exercent ensuite les vraies rules.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const seededAt = new Date('2026-07-16T11:00:00.000Z')
  await Promise.all([
    setDoc(doc(ctx.firestore(), 'prayerClassSessions/2026-07-16_1A'), {
      serviceDate: '2026-07-16', classe: '1A', status: 'going',
      startedAt: seededAt, startedByUid: 'prof1', updatedAt: seededAt,
    }),
    setDoc(doc(ctx.firestore(), 'prayerClassSessions/2026-07-16_2B'), {
      serviceDate: '2026-07-16', classe: '2B', status: 'going',
      startedAt: seededAt, startedByUid: 'prof2', updatedAt: seededAt,
    }),
  ])
})

await allow('prof lit la session de SA classe',
  getDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A')))
await deny('prof ne lit pas la session d’une autre classe',
  getDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_2B')))
await deny('parent ne lit aucune session de classe',
  getDoc(doc(asUser('parent1'), 'prayerClassSessions/2026-07-16_1A')))
await deny('chauffeur ne lit aucune session de classe',
  getDoc(doc(asUser('driver2'), 'prayerClassSessions/2026-07-16_1A')))
await deny('visiteur non connecté ne lit aucune session de classe',
  getDoc(doc(asGuest(), 'prayerClassSessions/2026-07-16_1A')))
await allow('admin liste les sessions de la journée',
  getDocs(query(
    collection(asUser('admin1'), 'prayerClassSessions'),
    where('serviceDate', '==', '2026-07-16'),
    orderBy('startedAt', 'asc'),
  )))
await allow('prof liste uniquement les sessions de SA classe',
  getDocs(query(
    collection(asUser('prof1'), 'prayerClassSessions'),
    where('serviceDate', '==', '2026-07-16'),
    where('classe', '==', '1A'),
  )))
await allow('prof interroge sa classe sans session (état idle)',
  getDocs(query(
    collection(asUser('prof1'), 'prayerClassSessions'),
    where('serviceDate', '==', '2026-07-18'),
    where('classe', '==', '1A'),
    orderBy('startedAt', 'desc'),
    limit(1),
  )))
await deny('prof ne peut pas lister toutes les classes du jour',
  getDocs(query(
    collection(asUser('prof1'), 'prayerClassSessions'),
    where('serviceDate', '==', '2026-07-16'),
  )))

await deny('transition going → returned interdite',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'returned', returnedAt: serverTimestamp(), returnedByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('parent ne peut pas faire avancer une session',
  updateDoc(doc(asUser('parent1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'parent1',
    updatedAt: serverTimestamp(),
  }))
await deny('chauffeur ne peut pas faire avancer une session',
  updateDoc(doc(asUser('driver2'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'driver2',
    updatedAt: serverTimestamp(),
  }))
await deny('prof d’une autre classe ne fait pas avancer la session',
  updateDoc(doc(asUser('prof2'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'prof2',
    updatedAt: serverTimestamp(),
  }))
await deny('prof de la même classe mais non-créateur ne fait pas avancer la session',
  updateDoc(doc(asUser('profSameClass'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'profSameClass',
    updatedAt: serverTimestamp(),
  }))
await deny('admin est en lecture seule et ne fait pas avancer la session',
  updateDoc(doc(asUser('admin1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('acteur praying falsifié refusé',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('horodatage client praying refusé',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: new Date(), prayingByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('identité de classe immuable pendant la transition',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    classe: '2B', status: 'praying', prayingAt: serverTimestamp(),
    prayingByUid: 'prof1', updatedAt: serverTimestamp(),
  }))
await deny('acteur du départ reste immuable pendant la transition',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    startedByUid: 'admin1', status: 'praying', prayingAt: serverTimestamp(),
    prayingByUid: 'prof1', updatedAt: serverTimestamp(),
  }))
await allow('prof avance going → praying avec acteur et temps serveur',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('acteur returned falsifié refusé',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'returned', returnedAt: serverTimestamp(), returnedByUid: 'admin1',
    updatedAt: serverTimestamp(),
  }))
await deny('prayingAt reste immuable au retour',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'returned', prayingAt: serverTimestamp(), returnedAt: serverTimestamp(),
    returnedByUid: 'prof1', updatedAt: serverTimestamp(),
  }))
await allow('prof confirme praying → returned avec sa propre signature',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'returned', returnedAt: serverTimestamp(), returnedByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('une session returned est terminale',
  updateDoc(doc(asUser('prof1'), 'prayerClassSessions/2026-07-16_1A'), {
    status: 'praying', prayingAt: serverTimestamp(), prayingByUid: 'prof1',
    updatedAt: serverTimestamp(),
  }))
await deny('aucun client, même admin, ne supprime une session',
  deleteDoc(doc(asUser('admin1'), 'prayerClassSessions/2026-07-16_1A')))

// ══════════════════════════════════════════════════════════════════════════
//  Durcissement 2026-07-25 (audit) — classStats, suivis, auditLog
// ══════════════════════════════════════════════════════════════════════════
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const seed = (path, data) => setDoc(doc(db, path), data)
  await Promise.all([
    // Agrégats de classe : le doc porte `classe` (cf. refreshClassStats).
    seed('classStats/2026-2027__1A__S1', {
      academicYear: '2026-2027', classe: '1A', semestre: 'S1',
      subjectAvgs: { Maths: 12.5 }, studentAvgs: [9, 12, 16], students: 3,
      notesCount: 9, bareme: 20, updatedAt: new Date(),
    }),
    seed('classStats/2026-2027__2B__S1', {
      academicYear: '2026-2027', classe: '2B', semestre: 'S1',
      subjectAvgs: { PC: 11 }, studentAvgs: [8, 11, 14], students: 3,
      notesCount: 9, bareme: 20, updatedAt: new Date(),
    }),
    // Journal de suivi : nominatif et sensible (notes internes).
    seed('suivis/s1A', {
      eleveId: 'e1', eleveNom: 'A A', classe: '1A', type: 'contact',
      note: 'Entretien avec le responsable légal', statut: 'ouvert',
      createdBy: 'prof1', createdByNom: 'Prof Un', createdAt: new Date(),
    }),
    seed('suivis/s2B', {
      eleveId: 'e2', eleveNom: 'B B', classe: '2B', type: 'convocation',
      note: 'Plan d’accompagnement', statut: 'ouvert',
      createdBy: 'prof2', createdByNom: 'Prof Deux', createdAt: new Date(),
    }),
    seed('auditLog/entry1', {
      actorUid: 'admin1', action: 'test', at: new Date(),
    }),
  ])
})

// classStats — un agrégat « anonyme » reste ré-identifiable en petit effectif :
// il ne doit sortir que du périmètre réel du lecteur.
await allow('parent lit l’agrégat de la classe de SON enfant',
  getDoc(doc(asUser('parent1'), 'classStats/2026-2027__1A__S1')))
await deny('parent ne lit PAS l’agrégat d’une autre classe',
  getDoc(doc(asUser('parent1'), 'classStats/2026-2027__2B__S1')))
await allow('prof lit l’agrégat d’une classe qu’il enseigne',
  getDoc(doc(asUser('prof1'), 'classStats/2026-2027__1A__S1')))
await deny('prof ne lit PAS l’agrégat d’une classe qu’il n’enseigne pas',
  getDoc(doc(asUser('prof2'), 'classStats/2026-2027__1A__S1')))
await allow('admin lit n’importe quel agrégat',
  getDoc(doc(asUser('admin1'), 'classStats/2026-2027__2B__S1')))
await deny('chauffeur sans enfant ne lit aucun agrégat',
  getDoc(doc(asUser('driver2'), 'classStats/2026-2027__1A__S1')))
await deny('aucun client n’écrit un agrégat (Admin SDK uniquement)',
  setDoc(doc(asUser('admin1'), 'classStats/2026-2027__1A__S1'), { notesCount: 0 }))

// suivis — registre interne : chaque prof était capable de lire TOUTE l’école.
await allow('admin lit tout le journal de suivi',
  getDoc(doc(asUser('admin1'), 'suivis/s2B')))
await allow('prof lit le suivi qu’il a lui-même créé',
  getDoc(doc(asUser('prof1'), 'suivis/s1A')))
await allow('prof lit le suivi d’un collègue sur une classe qu’il enseigne',
  getDoc(doc(asUser('profSameClass'), 'suivis/s1A')))
await deny('prof ne lit PAS le suivi d’une classe qu’il n’enseigne pas',
  getDoc(doc(asUser('prof2'), 'suivis/s1A')))
await deny('parent n’accède jamais au journal de suivi',
  getDoc(doc(asUser('parent1'), 'suivis/s1A')))
await deny('responsable légal (compte prof) n’accède pas au suivi via sa capacité parent',
  getDoc(doc(asUser('driverParent'), 'suivis/s1A')))

// auditLog — un journal falsifiable par ceux qu’il surveille ne vaut rien.
await deny('parent n’injecte plus d’entrée dans le journal d’audit',
  addDoc(collection(asUser('parent1'), 'auditLog'), {
    actorUid: 'parent1', action: 'faux', at: new Date(),
  }))
await deny('prof n’injecte plus d’entrée dans le journal d’audit',
  addDoc(collection(asUser('prof1'), 'auditLog'), {
    actorUid: 'prof1', action: 'faux', at: new Date(),
  }))
await deny('même l’admin n’écrit pas dans le journal d’audit',
  addDoc(collection(asUser('admin1'), 'auditLog'), {
    actorUid: 'admin1', action: 'faux', at: new Date(),
  }))
await deny('un non-superadmin ne lit pas le journal d’audit',
  getDoc(doc(asUser('admin1'), 'auditLog/entry1')))
await allow('le superadmin lit le journal d’audit',
  getDoc(doc(asUser('super1'), 'auditLog/entry1')))

// Premier lot : routage administration, alertes serveur et suivi infalsifiable.
const parentMessage = {
  type: 'direct', subject: 'Demande', body: 'Question', fromId: 'parent1',
  fromRole: 'parent', fromNom: 'Pa Rent', eleveId: 'e1',
  toType: 'administration', toIds: [], readBy: [], status: 'sent',
}
await allow('parent écrit dans la boîte commune administration',
  setDoc(doc(asUser('parent1'), 'messages/adminInbox'), parentMessage))
await allow('admin lit la boîte commune via la requête réelle',
  getDocs(query(collection(asUser('admin1'), 'messages'), where('toType', 'in', ['all', 'parents', 'teachers', 'administration']))))
await deny('prof ne lit pas les demandes à l’administration',
  getDoc(doc(asUser('prof1'), 'messages/adminInbox')))
await allow('parent relit sa propre demande', getDoc(doc(asUser('parent1'), 'messages/adminInbox')))
await deny('parent ne contacte pas directement un professeur',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, toType: 'user', toIds: ['prof1'] }))
await deny('parent ne contourne pas le routage en omettant fromRole',
  addDoc(collection(asUser('parent1'), 'messages'), { ...Object.fromEntries(Object.entries(parentMessage).filter(([key]) => key !== 'fromRole')), toType: 'user', toIds: ['prof1'] }))
await deny('parent ne mélange pas administrateur et professeur',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, toType: 'user', toIds: ['admin1', 'prof1'] }))
await deny('parent ne rend pas sa demande lisible à une classe',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, classe: '1A' }))
await deny('prof utilisant son espace parent ne contacte pas un collègue',
  addDoc(collection(asUser('profParent'), 'messages'), {
    ...parentMessage, fromId: 'profParent', fromNom: 'Prof Parent', eleveId: 'e7', toType: 'user', toIds: ['prof1'],
  }))
await allow('prof peut toujours informer un parent',
  setDoc(doc(asUser('prof1'), 'messages/teacherNotice'), {
    type: 'direct', subject: 'Information', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['parent1'], readBy: [],
  }))
await allow('admin répond au parent',
  setDoc(doc(asUser('admin1'), 'messages/adminReply'), {
    type: 'direct', subject: 'Réponse', body: 'B', fromId: 'admin1', fromRole: 'admin',
    toType: 'user', toIds: ['parent1'], readBy: [],
  }))
await allow('parent répond à un administrateur',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, toType: 'user', toIds: ['admin1'] }))
for (const type of ['attendance', 'behavior']) {
  await deny(`client prof ne double plus l’alerte automatique ${type}`,
    addDoc(collection(asUser('prof1'), 'messages'), {
      type, subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'],
    }))
}
await deny('client ne falsifie pas le suivi au create',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, push: { status: 'transmitted' } }))
await deny('même un admin ne falsifie pas le suivi après envoi',
  updateDoc(doc(asUser('admin1'), 'messages/adminReply'), { push: { status: 'transmitted' } }))
await allow('admin accuse lecture de la boîte commune',
  updateDoc(doc(asUser('admin1'), 'messages/adminInbox'), { readBy: arrayUnion('admin1') }))
await allow('prof lit son identifiant neuf pour une création unique de mérite',
  getDoc(doc(asUser('prof1'), 'comportements/newOperationId')))
for (const collectionName of ['messageDeliveryJobs', 'schoolAlertState', 'pushDevices', 'pushTokenOwners', 'attendanceOperations']) {
  await deny(`parent ne lit pas ${collectionName}`, getDoc(doc(asUser('parent1'), collectionName, 'private')))
  await deny(`admin client ne modifie pas ${collectionName}`, setDoc(doc(asUser('admin1'), collectionName, 'private'), { forged: true }))
}

// Dernier lot : rendez-vous privés et annulations de mérite auditées.
for (const col of ['appointments', 'appointmentOperations', 'appointmentBookings', 'appointmentFamilies']) {
  for (const uid of ['parent1', 'prof1', 'admin1']) {
    await deny(`${uid} ne lit pas directement ${col}`, getDoc(doc(asUser(uid), col, 'private')))
    await deny(`${uid} ne forge pas ${col}`, setDoc(doc(asUser(uid), col, 'private'), { parentUid: uid, status: 'confirmed' }))
  }
}
await deny('prof ne supprime pas un mérite sans trace', deleteDoc(doc(asUser('prof2'), 'comportements/c7')))
await deny('admin ne supprime pas un mérite sans trace', deleteDoc(doc(asUser('admin1'), 'comportements/c7')))
await deny('admin ne contourne pas l’annulation auditée', updateDoc(doc(asUser('admin1'), 'comportements/c7'), { cancelledBy: 'forged', cancelledAt: new Date() }))
await deny('prof ne forge pas une annulation au create', addDoc(collection(asUser('prof1'), 'comportements'), {
  eleveId: 'e1', classe: '1A', kind: 'merite', teacherId: 'prof1', cancelledAt: new Date(),
}))
await deny('client admin ne forge pas un avis de rendez-vous', addDoc(collection(asUser('admin1'), 'messages'), {
  type: 'appointment', subject: 'Fake', body: 'Fake', fromId: 'admin1', fromRole: 'admin', toType: 'user', toIds: ['parent1'],
}))
await deny('client ne détourne pas le routage rendez-vous via un message direct', addDoc(collection(asUser('parent1'), 'messages'), {
  ...parentMessage, appointmentAudience: 'parent', appointmentId: 'forged',
}))

// Homework mutations must use the authenticated server transaction.
await allow('prof creates own homework', setDoc(doc(asUser('prof1'), 'devoirs/newOwn'), { classeId: '1A', teacherId: 'prof1', titre: 'Test' }))
await deny('prof cannot impersonate colleague on create', setDoc(doc(asUser('prof1'), 'devoirs/forged'), { classeId: '1A', teacherId: 'profSameClass', titre: 'Test' }))
// Anciennes installations (addDoc) : pièces jointes limitées aux fichiers de l'app.
const hwFile = path => ({ url: `https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/${path}?alt=media&token=t`, name: 'consigne.pdf', mime: 'application/pdf', size: 4 * 1024 * 1024 })
const hwCreate = (id, attachments, uid = 'prof1') => setDoc(doc(asUser(uid), `devoirs/${id}`), { classeId: '1A', teacherId: uid, titre: 'Test', attachments })
await allow('prof creates homework with an app attachment', hwCreate('hwAttOk', [hwFile('devoirs%2Fprof1%2F1_cours..v2.pdf')]))
await allow('prof creates homework without attachments', hwCreate('hwAttNone', []))
// Limite exacte du pont (anciennes installations) : doit tenir dans les 1 000 expressions de Firestore.
await allow('prof creates homework with 10 app attachments (bridge limit)', hwCreate('hwAtt10', Array.from({ length: 10 }, (_, i) => hwFile(`devoirs%2Fprof1%2F${i}_page.jpg`))))
await deny('prof cannot create homework with 11 attachments', hwCreate('hwAtt11', Array.from({ length: 11 }, (_, i) => hwFile(`devoirs%2Fprof1%2F${i}_page.jpg`))))
await deny('prof cannot hide an external URL at the last position (index 9)', hwCreate('hwAttLast', [
  ...Array.from({ length: 9 }, (_, i) => hwFile(`devoirs%2Fprof1%2F${i}_page.jpg`)), { ...hwFile('devoirs%2Fx'), url: 'https://evil.example/x.pdf' }]))
for (const [label, attachment] of [
  ['external URL', { ...hwFile('devoirs%2Fx'), url: 'https://evil.example/consigne.pdf' }],
  ['raw dot-segment escape', hwFile('devoirs%2F../../../../../b/attacker/o/phish.html')],
  ['backslash', { ...hwFile('devoirs%2Fx'), url: hwFile('devoirs%2F..').url.replace('%2F..', '%2F..\\..\\x') }],
  ['other folder', hwFile('notes-imports%2Fx.xlsx')],
  ['other bucket', { ...hwFile('devoirs%2Fx'), url: hwFile('devoirs%2Fx').url.replace('mojammaa-sgs.firebasestorage.app', 'other.appspot.com') }],
  ['userinfo host', { ...hwFile('devoirs%2Fx'), url: 'https://firebasestorage.googleapis.com@evil.example/v0/b/mojammaa-sgs.firebasestorage.app/o/devoirs%2Fx' }],
]) await deny(`prof cannot create homework with ${label}`, hwCreate(`hwAtt-${label.replace(/\W+/g, '-')}`, [attachment]))
// Métadonnées : l'app appelle mime.startsWith et affiche name/mime en texte ; un mauvais
// type fait planter l'écran des familles (TypeError), quelle que soit la taille du document.
for (const [label, bad] of [
  ['numeric mime', { mime: 42 }], ['missing mime', { mime: undefined }], ['object name', { name: { x: 1 } }],
  ['missing name', { name: undefined }], ['list name', { name: ['a'] }],
]) {
  const attachment = Object.fromEntries(Object.entries({ ...hwFile('devoirs%2Fprof1%2F1_a.pdf'), ...bad }).filter(([, v]) => v !== undefined))
  await deny(`prof cannot create homework with ${label}`, hwCreate(`hwMeta-${label.replace(/\W+/g, '-')}`, [attachment]))
}
await deny('a malformed attachment at the last position (index 9) is refused', hwCreate('hwMetaLast', [
  ...Array.from({ length: 9 }, (_, i) => hwFile(`devoirs%2Fprof1%2F${i}_page.jpg`)), { ...hwFile('devoirs%2Fx'), mime: 42 }]))
{ const { size, ...noSize } = hwFile('devoirs%2Fprof1%2F1_a.pdf')
  await allow('size stays optional', hwCreate('hwMetaNoSize', [noSize])) }
// size n'est qu'affichée : la règle ne la contrôle pas (budget), l'app ignore une taille invalide.
await allow('a non-numeric size is tolerated by the rule (display only, sanitized by the app)', hwCreate('hwMetaSize', [{ ...hwFile('devoirs%2Fprof1%2F1_a.pdf'), size: '4 Mo' }]))
// Segments ENCODÉS (%2F..%2F, %2E%2E) : aucun navigateur ni client HTTP ne peut les normaliser
// (pas de « / » ni « \ » bruts) et le bucket est fixé dans l'URL. Refusés par manageHomework,
// tolérés par la règle ; risque résiduel : traitement interne du service Storage (non vérifiable).
await allow('encoded segments are tolerated by the rule (bucket fixed, no normalization)', hwCreate('hwAttEncoded', [hwFile('devoirs%2F..%2Fnotes-imports%2Fx')]))
await deny('admin client cannot create homework with an external attachment', hwCreate('hwAttAdmin', [{ ...hwFile('devoirs%2Fx'), url: 'https://evil.example/x' }], 'admin1'))
await deny('same-class colleague cannot directly edit homework', updateDoc(doc(asUser('profSameClass'), 'devoirs/d1a'), { titre: 'Changed' }))
await deny('owner cannot bypass server edit checks', updateDoc(doc(asUser('prof1'), 'devoirs/d1a'), { titre: 'Changed' }))
await deny('owner cannot bypass submission preservation', deleteDoc(doc(asUser('prof1'), 'devoirs/d1a')))
await testEnv.withSecurityRulesDisabled(async ctx => {
  await updateDoc(doc(ctx.firestore(), 'devoirs/d1a'), { cancelledAt: new Date() })
})
await deny('parent cannot submit work after cancellation', setDoc(doc(asUser('parent1'), 'homeworkSubmissions/d1a_e6'), {
  homeworkId: 'd1a', eleveId: 'e6', classeId: '1A', parentUid: 'parent1', teacherId: 'prof1',
  status: 'submitted', attachments: [proofFile('test.pdf', 'parent1', 'application/pdf')],
  parentComment: '', submittedAt: serverTimestamp(), submittedByUid: 'parent1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
}))

console.log('\n── 15. Audit 2026-09-28 : pièces jointes et ressources ──')
await testEnv.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'devoirs/dAudit'), { classeId: '1A', teacherId: 'prof1', titre: 'Audit' })
})
const auditProof = attachments => setDoc(doc(asUser('parent1'), 'homeworkSubmissions/dAudit_e6'), {
  ...homeworkProof('e6'), homeworkId: 'dAudit', attachments,
})
// F7 : uniquement les fichiers du parent connecté, dans son dossier Storage.
for (const [label, attachments] of [
  ['external URL (audit case)', [{ url: 'https://example.invalid/untrusted.jpg', name: 'a.jpg', mime: 'image/jpeg' }]],
  ['external URL hidden at the last position (index 4)', [...Array.from({ length: 4 }, (_, i) => proofFile(`${i}.jpg`)), { ...proofFile('x.jpg'), url: 'https://evil.example/x.jpg' }]],
  ["another parent's folder", [proofFile('a.jpg', 'parent2')]],
  ['homework folder instead of proofs', [{ ...proofFile('a.jpg'), url: `${STORAGE_URL}devoirs%2Fprof1%2Fa.pdf?alt=media` }]],
  ['encoded path escape', [{ ...proofFile('a.jpg'), url: `${STORAGE_URL}homework-submissions%2Fparent1%2F..%2F..%2Fdevoirs%2Fprof1%2Fa.pdf` }]],
  ['other bucket', [{ ...proofFile('a.jpg'), url: proofFile('a.jpg').url.replace('mojammaa-sgs.firebasestorage.app', 'other.appspot.com') }]],
  ['userinfo host', [{ ...proofFile('a.jpg'), url: proofFile('a.jpg').url.replace('https://firebasestorage.googleapis.com', 'https://firebasestorage.googleapis.com@evil.example') }]],
  ['numeric mime', [{ ...proofFile('a.jpg'), mime: 42 }]],
  ['object name', [{ ...proofFile('a.jpg'), name: { x: 1 } }]],
  ['null entry', [null]],
  ['6 attachments', Array.from({ length: 6 }, (_, i) => proofFile(`${i}.jpg`))],
]) await deny(`F7 parent proof refused: ${label}`, auditProof(attachments))
// Limite exacte (5) : doit tenir dans le budget de 1 000 expressions.
await allow('F7 parent proof with 5 of his own uploaded files (limit)',
  auditProof(Array.from({ length: 5 }, (_, i) => proofFile(`${i}_page.jpg`))))
await deny('F7 teacher decision cannot carry attachments',
  setDoc(doc(asUser('prof1'), 'homeworkSubmissions/dAudit_e5'), {
    homeworkId: 'dAudit', eleveId: 'e5', classeId: '1A', parentUid: 'parent1', teacherId: 'prof1',
    status: 'not_submitted', attachments: [proofFile('x.jpg')], parentComment: '',
    reviewedAt: serverTimestamp(), reviewedByUid: 'prof1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('F7 teacher decision without attachments still works',
  setDoc(doc(asUser('prof1'), 'homeworkSubmissions/dAudit_e5'), {
    homeworkId: 'dAudit', eleveId: 'e5', classeId: '1A', parentUid: 'parent1', teacherId: 'prof1',
    status: 'not_submitted', attachments: [], parentComment: '',
    reviewedAt: serverTimestamp(), reviewedByUid: 'prof1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

// F5 : pièces jointes de message = affiches de l'administration uniquement.
const poster = (name, uid = 'admin1', extra = {}) => ({
  url: `${STORAGE_URL}annonces%2F${uid}%2F1759000000000_${name}?alt=media&token=t`, name, mime: 'image/jpeg', ...extra,
})
const adminAnnouncement = attachments => addDoc(collection(asUser('admin1'), 'messages'), {
  type: 'announcement', subject: 'S', body: 'B', fromId: 'admin1', fromRole: 'admin',
  toType: 'all', toIds: [], readBy: [], status: 'sent', attachments,
})
await deny('F5 parent message with a malformed attachment (audit case)',
  addDoc(collection(asUser('parent1'), 'messages'), {
    ...parentMessage, attachments: [{ url: 'https://example.invalid/a', name: 'a', mime: 42 }],
  }))
await deny('F5 parent message with a well-formed attachment (parents never attach)',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, attachments: [poster('a.jpg', 'parent1')] }))
await deny('F5 teacher message with an attachment',
  addDoc(collection(asUser('prof1'), 'messages'), {
    type: 'direct', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur',
    toType: 'user', toIds: ['parent1'], readBy: [], status: 'sent', attachments: [poster('a.jpg', 'prof1')],
  }))
await allow('F5 parent message without attachments still works',
  addDoc(collection(asUser('parent1'), 'messages'), parentMessage))
await allow('F5 admin announcement with 3 posters (limit)',
  adminAnnouncement([poster('1.jpg'), poster('2.jpg'), poster('3.jpg')]))
for (const [label, attachments] of [
  ['4 posters', [poster('1.jpg'), poster('2.jpg'), poster('3.jpg'), poster('4.jpg')]],
  ['numeric mime', [poster('1.jpg', 'admin1', { mime: 42 })]],
  ['external URL', [{ ...poster('1.jpg'), url: 'https://evil.example/p.jpg' }]],
  ["another admin's folder", [poster('1.jpg', 'admin2')]],
  ['null entry', [null]],
  ['not a list', 'x'],
]) await deny(`F5 admin announcement refused: ${label}`, adminAnnouncement(attachments))
await testEnv.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'messages/withPoster'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'admin1', fromRole: 'admin',
    toType: 'all', toIds: [], readBy: [], status: 'sent', attachments: [poster('1.jpg')],
  })
})
await allow('F5 admin edits the body of an announcement with a poster',
  updateDoc(doc(asUser('admin1'), 'messages/withPoster'), { body: 'Corrigé' }))
await deny('F5 admin cannot replace a poster with a malformed attachment',
  updateDoc(doc(asUser('admin1'), 'messages/withPoster'), { attachments: [{ url: 'x', name: 'a', mime: 42 }] }))

// F6 : le prof propriétaire ne déplace pas sa ressource hors de ses classes.
await deny('F6 owner moves a resource to a class he does not teach (audit case)',
  updateDoc(doc(asUser('prof2'), 'ressources/res2b'), { classeId: '1A' }))
await deny('F6 owner reassigns a resource to a colleague',
  updateDoc(doc(asUser('prof2'), 'ressources/res2b'), { teacherId: 'prof1' }))
await allow('F6 owner still edits the title of his resource',
  updateDoc(doc(asUser('prof2'), 'ressources/res2b'), { titre: 'Ressource 2B v2' }))
await allow('F6 admin can still reassign a resource',
  updateDoc(doc(asUser('admin1'), 'ressources/res2b'), { classeId: '2B', teacherId: 'prof2' }))
await allow('F6 a family still records its view (viewedBy self-append)',
  updateDoc(doc(asUser('parent2'), 'ressources/res2b'), { viewedBy: arrayUnion('parent2') }))

console.log('\n── 14. Connexion parent par téléphone : champs serveur ──')
await deny('parent ne s’attribue pas un mobile de connexion',
  updateDoc(doc(asUser('parent1'), 'users/parent1'), { authPhoneE164: '+212612345678' }))
await deny('parent ne s’accorde pas la connexion par téléphone',
  updateDoc(doc(asUser('parent1'), 'users/parent1'), { parentLoginEnabled: true }))
await deny('admin ordinaire ne change pas le mobile de connexion d’un parent',
  updateDoc(doc(asUser('admin1'), 'users/parent1'), { authPhoneE164: '+212600000000' }))
await deny('admin ordinaire ne change pas la capacité de connexion par téléphone',
  updateDoc(doc(asUser('admin1'), 'users/parent1'), { parentLoginEnabled: false }))
await allow('parent modifie toujours son téléphone de contact',
  updateDoc(doc(asUser('parent1'), 'users/parent1'), { telephone: '0612345678' }))
await allow('admin modifie toujours le nom d’un parent',
  updateDoc(doc(asUser('admin1'), 'users/parent1'), { nom: 'Rent' }))
await allow('superadmin peut couper la connexion par téléphone',
  updateDoc(doc(asUser('super1'), 'users/parent1'), { parentLoginEnabled: false }))
await deny('aucun client, même superadmin, ne lit les compteurs anti-bourrinage',
  getDoc(doc(asUser('super1'), 'parentPhoneAuthRateLimits/global-login')))
await deny('aucun client n’écrit les compteurs anti-bourrinage',
  setDoc(doc(asUser('admin1'), 'parentPhoneAuthRateLimits/global-login'), { count: 0 }))

console.log('\n── 16. Audit messagerie 2026-10-05 : champs à la création, accusés ──')
// F03 : un objet à la place d'un tableau faisait planter la boîte de réception.
await deny('F03 parent ne crée pas un message avec deletedBy non-tableau',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, deletedBy: { invalid: true } }))
await deny('F03 corps de message non textuel refusé',
  addDoc(collection(asUser('prof1'), 'messages'), { type: 'direct', subject: 'S', body: { html: 1 }, fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'], readBy: [] }))
await deny('F03 objet démesuré refusé',
  addDoc(collection(asUser('prof1'), 'messages'), { type: 'direct', subject: 'x'.repeat(301), body: 'B', fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'], readBy: [] }))
await deny('F03 date de création non horodatée refusée',
  addDoc(collection(asUser('prof1'), 'messages'), { type: 'direct', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'], readBy: [], createdAt: 'hier' }))
// F04b : l'expéditeur ne fabrique ni lecture ni suppression chez le destinataire.
await deny('F04b accusé de lecture prérempli refusé',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, readBy: ['admin1'] }))
await deny('F04b message masqué d’avance chez le destinataire refusé',
  addDoc(collection(asUser('parent1'), 'messages'), { ...parentMessage, deletedBy: ['admin1'] }))
await allow('message normal avec corbeille vide et date serveur accepté',
  addDoc(collection(asUser('prof1'), 'messages'), { type: 'direct', subject: 'S', body: 'B', fromId: 'prof1', fromRole: 'professeur', toType: 'user', toIds: ['parent1'], readBy: [], deletedBy: [], createdAt: serverTimestamp() }))
// F04a : s'ajouter aux accusés suppose d'être dans l'audience du message.
await deny('F04a compte tiers ne marque pas lu un message privé',
  updateDoc(doc(asUser('parent2'), 'messages/m1'), { readBy: arrayUnion('parent2') }))
await deny('F04a compte tiers ne masque pas un message privé',
  updateDoc(doc(asUser('parent2'), 'messages/m1'), { deletedBy: arrayUnion('parent2') }))
await deny('F04a prof d’une autre classe ne marque pas lue une annonce de classe',
  updateDoc(doc(asUser('prof2'), 'messages/admin1a'), { readBy: arrayUnion('prof2') }))
await allow('l’expéditeur masque son propre envoi',
  updateDoc(doc(asUser('parent1'), 'messages/m1'), { deletedBy: arrayUnion('parent1') }))
await allow('parent destinataire d’une diffusion « parents » la marque lue',
  updateDoc(doc(asUser('parent1'), 'messages/parentsBroadcast'), { readBy: arrayUnion('parent1') }))
await allow('prof de la classe marque lue l’annonce de l’administration',
  updateDoc(doc(asUser('profSameClass'), 'messages/admin1a'), { readBy: arrayUnion('profSameClass') }))
await allow('admin marque lue une demande de la boîte commune',
  updateDoc(doc(asUser('admin1'), 'messages/adminInbox'), { readBy: arrayUnion('admin1') }))
await allow('destinataire d’un ancien message legacy le marque lu',
  updateDoc(doc(asUser('prof1'), 'messages/legacy1'), { readBy: arrayUnion('prof1') }))

// F06 : l'envoi personnalisé idempotent (messagesService.sendPersonalizedOnce)
// s'appuie sur trois comportements réels des règles.
const personalized = {
  type: 'announcement', category: 'announcement', subject: 'Perso', body: 'Bonjour A', fromId: 'prof1',
  fromRole: 'professeur', fromNom: 'Un Prof', toType: 'user', toIds: ['parent1'], classe: '1A',
  eleveId: 'e1', readBy: [], deletedBy: [], status: 'sent',
}
await allow('F06 création d’un message personnalisé à identifiant fixe',
  setDoc(doc(asUser('prof1'), 'messages/f06-stable'), { ...personalized, createdAt: serverTimestamp() }))
await deny('F06 une reprise ne réécrit jamais un message déjà créé',
  setDoc(doc(asUser('prof1'), 'messages/f06-stable'), { ...personalized, createdAt: serverTimestamp() }))
await allow('F06 l’auteur vérifie son message sur le serveur (fromId + identifiant)',
  getDocs(query(collection(asUser('prof1'), 'messages'), where('fromId', '==', 'prof1'), where(documentId(), '==', 'f06-stable'))))
await allow('F06 admin : création d’un message personnalisé à identifiant fixe',
  setDoc(doc(asUser('admin1'), 'messages/f06-admin'), { ...personalized, fromId: 'admin1', fromRole: 'admin', fromNom: 'Admin', createdAt: serverTimestamp() }))
await deny('F06 admin : une reprise ne réécrit pas non plus un message déjà créé',
  setDoc(doc(asUser('admin1'), 'messages/f06-admin'), { ...personalized, fromId: 'admin1', fromRole: 'admin', fromNom: 'Admin', createdAt: serverTimestamp() }))
await deny('F06 un autre compte ne sonde pas les envois d’un professeur',
  getDocs(query(collection(asUser('parent2'), 'messages'), where('fromId', '==', 'prof1'), where(documentId(), '==', 'f06-stable'))))

// Requêtes exactes des nouveaux écrans mobiles d'administration (9 octobre).
// La lecture globale et la liste des superadmins restent hors portée des
// parents, professeurs et visiteurs, même en contournant la navigation.
await allow('admin mobile lit les élèves pour générer les codes parents',
  getDocs(collection(asUser('admin1'), 'eleves')))
await allow('admin mobile lit le bilan global de comportement',
  getDocs(collection(asUser('admin1'), 'comportements')))
await allow('admin mobile vérifie son habilitation superadmin',
  getDoc(doc(asUser('admin1'), 'config/superadmins')))
for (const [role, db] of [['parent', asUser('parent1')], ['professeur', asUser('prof1')], ['visiteur', asGuest()]]) {
  await deny(`${role} ne lit pas globalement les élèves comme l'administration`, getDocs(collection(db, 'eleves')))
  await deny(`${role} ne lit pas le bilan global de comportement`, getDocs(collection(db, 'comportements')))
  await deny(`${role} ne lit pas la liste des superadmins`, getDoc(doc(db, 'config/superadmins')))
}
await deny('admin mobile ne peut pas se déclarer superadmin',
  updateDoc(doc(asUser('admin1'), 'config/superadmins'), { uids: arrayUnion('admin1') }))

// ── Personnel administratif (rôle `staff`) : socle ────────────────────────
// Un compte staff n'a AUCUN droit par défaut. Ses droits (`droits`) et son
// poste (`poste`) sont écrits par le serveur ou un superadmin : ni le compte
// lui-même ni un admin ne les modifient depuis une application. Tant qu'aucune
// collection n'est ouverte au personnel, une case cochée ne donne rien.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await setDoc(doc(db, 'users/staff1'), {
    uid: 'staff1', role: 'staff', poste: 'surveillant_general', droits: ['absences.voir'], prenom: 'Sta', nom: 'Ff',
  })
  await setDoc(doc(db, 'users/staff0'), { uid: 'staff0', role: 'staff', poste: 'secretaire', droits: [] })
})
await deny('staff ne s’ajoute pas un droit',
  updateDoc(doc(asUser('staff1'), 'users/staff1'), { droits: arrayUnion('notes.voir') }))
await deny('staff sans droit ne s’en donne pas',
  updateDoc(doc(asUser('staff0'), 'users/staff0'), { droits: ['comptes.gerer'] }))
await deny('staff ne change pas son poste',
  updateDoc(doc(asUser('staff1'), 'users/staff1'), { poste: 'secretaire' }))
await deny('staff ne se déclare pas admin',
  updateDoc(doc(asUser('staff1'), 'users/staff1'), { role: 'admin' }))
await deny('professeur ne se donne pas de droits',
  updateDoc(doc(asUser('prof1'), 'users/prof1'), { droits: ['eleves.voir'] }))
await deny('parent ne se donne pas de poste',
  updateDoc(doc(asUser('parent1'), 'users/parent1'), { poste: 'secretaire' }))
await deny('admin ne donne pas de droits à un compte staff depuis une application',
  updateDoc(doc(asUser('admin1'), 'users/staff0'), { droits: ['eleves.voir'] }))
await deny('admin ne change pas le poste d’un compte staff depuis une application',
  updateDoc(doc(asUser('admin1'), 'users/staff0'), { poste: 'surveillant_general' }))
await deny('admin ne se donne pas de droits à lui-même',
  updateDoc(doc(asUser('admin1'), 'users/admin1'), { droits: ['comptes.gerer'] }))
await allow('superadmin attribue des droits et un poste',
  updateDoc(doc(asUser('super1'), 'users/staff0'), { poste: 'secretaire', droits: ['eleves.voir'] }))
await allow('staff modifie son propre nom (Mon profil intact)',
  updateDoc(doc(asUser('staff1'), 'users/staff1'), { prenom: 'Stéphane' }))
await allow('admin modifie le nom d’un compte staff (gestion des profils intacte)',
  updateDoc(doc(asUser('admin1'), 'users/staff1'), { nom: 'Fff' }))
await allow('staff lit sa propre fiche', getDoc(doc(asUser('staff1'), 'users/staff1')))
await deny('staff ne lit pas la fiche d’un autre compte', getDoc(doc(asUser('staff1'), 'users/admin1')))

// ── Personnel administratif : ce que chaque case ouvre ────────────────────
// Deux postes de départ (mojammaa-admin/functions/src/staffRights.ts) :
// surveillant général et relations parents. Chaque case ouvre exactement sa
// porte ; sans case, ou avec un champ `droits` mal formé ou posé sur un autre
// rôle, rien ne s'ouvre. Documents propres à cette section (préfixe st-).
const SG_RIGHTS = [
  'eleves.voir', 'absences.voir', 'absences.saisir', 'comportements.voir', 'comportements.saisir',
  'sortie', 'priere', 'suivis', 'notes.voir', 'edt.voir', 'messages.boite', 'messages.envoyer',
]
const RP_RIGHTS = ['eleves.voir', 'absences.voir', 'notes.voir', 'edt.voir', 'codes.parents', 'codes.professeurs']
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const seed = (path, data) => setDoc(doc(db, path), data)
  const at = new Date('2026-10-12T09:00:00.000Z')
  await Promise.all([
    seed('users/staffSG', { uid: 'staffSG', role: 'staff', droits: SG_RIGHTS, prenom: 'Sur', nom: 'Veillant' }),
    seed('users/staffSG2', { uid: 'staffSG2', role: 'staff', droits: SG_RIGHTS }),
    seed('users/staffRP', { uid: 'staffRP', role: 'staff', droits: RP_RIGHTS }),
    seed('users/staffNone', { uid: 'staffNone', role: 'staff', droits: [] }),
    seed('users/staffNoField', { uid: 'staffNoField', role: 'staff' }),
    // Texte au lieu d'une liste : ne doit jamais valoir par ressemblance.
    seed('users/staffBad', { uid: 'staffBad', role: 'staff', droits: 'eleves.voir absences.voir notes.voir' }),
    seed('users/staffScribe', { uid: 'staffScribe', role: 'staff', droits: ['eleves.voir', 'eleves.modifier', 'calendrier.modifier'] }),
    seed('users/profDroits', { uid: 'profDroits', role: 'professeur', classes: ['9Z'], matiere: 'Maths', droits: SG_RIGHTS }),
    seed('users/parentDroits', { uid: 'parentDroits', role: 'parent', droits: SG_RIGHTS }),
    seed('eleves/st-e1', { classe: '5S', parentUid: 'parent2', nom: 'St', prenom: 'Un' }),
    seed('absences/st-a1', { eleveId: 'st-e1', classe: '5S', date: '2026-10-12', seance: 'S1', statut: 'absent' }),
    seed('comportements/st-c1', { eleveId: 'st-e1', classe: '5S', kind: 'merite', teacherId: 'prof2' }),
    seed('absenceRequests/st-r1', { parentUid: 'parent2', eleveId: 'st-e1', classe: '5S', date: '2026-10-13', status: 'pending', reason: 'maladie' }),
    seed('absenceRequests/st-r2', { parentUid: 'parent2', eleveId: 'st-e1', classe: '5S', date: '2026-10-14', status: 'pending', reason: 'voyage' }),
    seed('suivis/st-s1', { eleveId: 'st-e1', classe: '5S', type: 'entretien-eleve', note: 'N', statut: 'ouvert', createdBy: 'admin1' }),
    seed('notes/st-n1', { eleveId: 'st-e1', classe: '5S', matiere: 'Maths', note: 14 }),
    seed('bulletins/st-b1', { eleveId: 'st-e1', classe: '5S', semestre: 'S1' }),
    seed('classStats/st-cs1', { classe: '5S', semestre: 'S1' }),
    seed('schedules/prof2', { slots: [] }),
    seed('stats/summary', { totalEleves: 1 }),
    seed('pickupRequests/2026-10-12_st-e1', {
      parentUid: 'parent2', eleveId: 'st-e1', serviceDate: '2026-10-12', status: 'waiting', arrivedAt: at, updatedAt: at,
    }),
    seed('prayerClassSessions/st-p1', { serviceDate: '2026-10-12', classe: '5S', status: 'going', startedAt: at, startedByUid: 'prof2', updatedAt: at }),
    seed('evenements/st-ev1', { titre: 'Réunion', type: 'reunion', dateDebut: '2026-10-20', dateFin: '2026-10-20', createdBy: 'admin1' }),
  ])
})
const sg = asUser('staffSG')
const rp = asUser('staffRP')
const scribe = asUser('staffScribe')
const absence = (id, extra = {}) => ({ eleveId: 'st-e1', classe: '5S', date: '2026-10-12', seance: id, statut: 'absent', ...extra })

// Surveillant général : vie scolaire, en lecture et en saisie.
for (const name of ['eleves', 'absences', 'comportements', 'absenceRequests', 'suivis', 'pickupRequests', 'prayerClassSessions', 'notes', 'bulletins']) {
  await allow(`surveillant général lit « ${name} »`, getDocs(collection(sg, name)))
}
await allow('surveillant général lit la fiche d’un élève', getDoc(doc(sg, 'eleves/st-e1')))
await allow('surveillant général lit les moyennes d’une classe', getDoc(doc(sg, 'classStats/st-cs1')))
await allow('surveillant général lit l’emploi du temps d’un professeur', getDoc(doc(sg, 'schedules/prof2')))
await allow('surveillant général saisit une absence', setDoc(doc(sg, 'absences/st-a-sg'), absence('S2', { professorId: 'staffSG' })))
await allow('surveillant général corrige une absence', updateDoc(doc(sg, 'absences/st-a1'), { statut: 'retard' }))
await allow('surveillant général saisit 25 absences d’un coup (aucune lecture par élève)', (() => {
  const batch = writeBatch(sg)
  for (let i = 0; i < 25; i++) batch.set(doc(sg, `absences/st-lot-${i}`), absence(`L${i}`))
  return batch.commit()
})())
await allow('surveillant général donne un avertissement',
  setDoc(doc(sg, 'comportements/st-c-sg'), { eleveId: 'st-e1', classe: '5S', kind: 'avertissement', teacherId: 'staffSG', reason: 'retard' }))
await allow('surveillant général traite une déclaration d’absence',
  updateDoc(doc(sg, 'absenceRequests/st-r1'), { status: 'approved', decidedBy: 'staffSG', decidedAt: serverTimestamp() }))
await deny('surveillant général ne signe pas une décision au nom d’un autre',
  updateDoc(doc(sg, 'absenceRequests/st-r2'), { status: 'approved', decidedBy: 'admin1', decidedAt: serverTimestamp() }))
await allow('surveillant général ouvre une action de suivi à son nom',
  setDoc(doc(sg, 'suivis/st-s-sg'), { eleveId: 'st-e1', classe: '5S', type: 'convocation', note: 'N', statut: 'ouvert', createdBy: 'staffSG' }))
await deny('surveillant général n’ouvre pas une action au nom d’un autre',
  setDoc(doc(sg, 'suivis/st-s-forge'), { eleveId: 'st-e1', classe: '5S', type: 'convocation', note: 'N', statut: 'ouvert', createdBy: 'admin1' }))
await allow('un autre surveillant clôt l’action de son collègue',
  updateDoc(doc(asUser('staffSG2'), 'suivis/st-s-sg'), { statut: 'clos' }))
await deny('un surveillant ne s’attribue pas l’action d’un autre',
  updateDoc(doc(asUser('staffSG2'), 'suivis/st-s-sg'), { createdBy: 'staffSG2' }))
await allow('surveillant général ouvre le créneau de sortie',
  setDoc(doc(sg, 'pickupSessions/2026-10-13'), {
    serviceDate: '2026-10-13', isOpen: true, openedByUid: 'staffSG',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await deny('surveillant général n’ouvre pas un créneau au nom d’un autre',
  setDoc(doc(sg, 'pickupSessions/2026-10-14'), {
    serviceDate: '2026-10-14', isOpen: true, openedByUid: 'admin1',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))
await allow('surveillant général appelle un élève à la sortie',
  updateDoc(doc(sg, 'pickupRequests/2026-10-12_st-e1'), {
    status: 'called', calledAt: serverTimestamp(), managedByUid: 'staffSG', updatedAt: serverTimestamp(),
  }))
await deny('surveillant général ne saute pas une étape de la sortie',
  updateDoc(doc(sg, 'pickupRequests/2026-10-12_st-e1'), {
    status: 'completed', completedAt: serverTimestamp(), managedByUid: 'staffSG', updatedAt: serverTimestamp(),
  }))

// Ce que le poste n'ouvre pas : modification des élèves, notes, calendrier,
// pilotage de l'école, comptes, transport — et aucune suppression.
await deny('surveillant général n’inscrit pas un élève', setDoc(doc(sg, 'eleves/st-e-sg'), { classe: '5S', nom: 'X', prenom: 'Y' }))
await deny('surveillant général ne modifie pas un élève', updateDoc(doc(sg, 'eleves/st-e1'), { nom: 'Autre' }))
await deny('surveillant général ne saisit pas une note', setDoc(doc(sg, 'notes/st-n-sg'), { eleveId: 'st-e1', classe: '5S', matiere: 'Maths', note: 20 }))
await deny('surveillant général ne modifie pas une note', updateDoc(doc(sg, 'notes/st-n1'), { note: 20 }))
await deny('surveillant général ne modifie pas un mérite déjà donné', updateDoc(doc(sg, 'comportements/st-c1'), { kind: 'avertissement' }))
await deny('surveillant général n’ajoute pas un événement au calendrier',
  setDoc(doc(sg, 'evenements/st-ev-sg'), { titre: 'X', type: 'autre', dateDebut: '2026-10-21', dateFin: '2026-10-21', createdBy: 'staffSG' }))
await deny('surveillant général ne modifie pas l’emploi du temps d’un professeur', setDoc(doc(sg, 'schedules/prof2'), { slots: [1] }))
for (const path of ['eleves/st-e1', 'absences/st-a1', 'notes/st-n1', 'comportements/st-c1', 'suivis/st-s1', 'absenceRequests/st-r2', 'pickupRequests/2026-10-12_st-e1', 'bulletins/st-b1']) {
  await deny(`surveillant général ne supprime pas ${path}`, deleteDoc(doc(sg, path)))
}
for (const name of ['users', 'messages', 'directoryAdmin', 'devoirs', 'homeworkSubmissions', 'transportTrips', 'driverProfiles', 'timetableConfigs', 'auditLog', 'config']) {
  await deny(`surveillant général ne lit pas « ${name} »`, getDocs(collection(sg, name)))
}
await deny('surveillant général ne lit pas le bilan de l’école', getDoc(doc(sg, 'stats/summary')))
await deny('surveillant général ne modifie pas les coefficients', setDoc(doc(sg, 'settings/coefficients'), { x: 1 }))
await deny('surveillant général ne crée pas de profil chauffeur', setDoc(doc(sg, 'driverProfiles/staffSG'), { uid: 'staffSG', active: true }))

// Relations parents : lire pour renseigner et imprimer, sans rien saisir.
for (const name of ['eleves', 'absences', 'absenceRequests', 'notes', 'bulletins']) {
  await allow(`relations parents lit « ${name} »`, getDocs(collection(rp, name)))
}
await allow('relations parents lit l’emploi du temps d’un professeur', getDoc(doc(rp, 'schedules/prof2')))
for (const name of ['comportements', 'suivis', 'pickupRequests', 'prayerClassSessions', 'users', 'messages']) {
  await deny(`relations parents ne lit pas « ${name} »`, getDocs(collection(rp, name)))
}
await deny('relations parents ne saisit pas une absence', setDoc(doc(rp, 'absences/st-a-rp'), absence('S3')))
await deny('relations parents ne corrige pas une absence', updateDoc(doc(rp, 'absences/st-a1'), { statut: 'present' }))
await deny('relations parents ne traite pas une déclaration d’absence',
  updateDoc(doc(rp, 'absenceRequests/st-r2'), { status: 'approved', decidedBy: 'staffRP', decidedAt: serverTimestamp() }))
await deny('relations parents ne donne pas d’avertissement',
  setDoc(doc(rp, 'comportements/st-c-rp'), { eleveId: 'st-e1', classe: '5S', kind: 'avertissement', teacherId: 'staffRP' }))
await deny('relations parents n’ouvre pas le créneau de sortie',
  setDoc(doc(rp, 'pickupSessions/2026-10-15'), {
    serviceDate: '2026-10-15', isOpen: true, openedByUid: 'staffRP',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

// Sans case, rien. Un champ `droits` mal formé, ou posé sur un autre rôle, ne vaut rien.
for (const uid of ['staffNone', 'staffNoField', 'staffBad', 'parentDroits']) {
  for (const name of ['eleves', 'absences', 'notes', 'comportements', 'suivis', 'pickupRequests']) {
    await deny(`${uid} ne lit pas « ${name} »`, getDocs(collection(asUser(uid), name)))
  }
  await deny(`${uid} ne saisit pas une absence`, setDoc(doc(asUser(uid), `absences/st-a-${uid}`), absence('S4')))
}
await deny('professeur avec un champ droits ne lit pas tous les élèves', getDocs(collection(asUser('profDroits'), 'eleves')))
await deny('professeur avec un champ droits ne lit pas toutes les notes', getDocs(collection(asUser('profDroits'), 'notes')))
await deny('professeur avec un champ droits ne saisit pas une absence hors de ses classes',
  setDoc(doc(asUser('profDroits'), 'absences/st-a-prof'), absence('S5')))
await deny('professeur avec un champ droits n’ouvre pas le créneau de sortie',
  setDoc(doc(asUser('profDroits'), 'pickupSessions/2026-10-16'), {
    serviceDate: '2026-10-16', isOpen: true, openedByUid: 'profDroits',
    opensAt: serverTimestamp(), closesAt: new Date(Date.now() + 60 * 60_000),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }))

// Élèves en modification, calendrier : cases d'un poste créé par l'établissement.
await allow('inscrire un élève (eleves.modifier), sans lien parent',
  setDoc(doc(scribe, 'eleves/st-e-new'), { classe: '5S', nom: 'Nouveau', prenom: 'Élève' }))
await allow('modifier la fiche d’un élève (eleves.modifier)', updateDoc(doc(scribe, 'eleves/st-e1'), { parentTel: '0600000000' }))
await deny('eleves.modifier ne rattache pas un élève à un compte', updateDoc(doc(scribe, 'eleves/st-e1'), { parentUid: 'staffScribe' }))
await deny('eleves.modifier ne détache pas un élève de son parent', updateDoc(doc(scribe, 'eleves/st-e1'), { parentUid: deleteField() }))
await deny('eleves.modifier n’inscrit pas un élève déjà rattaché à un compte',
  setDoc(doc(scribe, 'eleves/st-e-lie'), { classe: '5S', nom: 'X', prenom: 'Y', parentUid: 'staffScribe' }))
await deny('eleves.modifier ne supprime pas un élève', deleteDoc(doc(scribe, 'eleves/st-e-new')))
await allow('ajouter un événement (calendrier.modifier)',
  setDoc(doc(scribe, 'evenements/st-ev-new'), { titre: 'Fête', type: 'autre', dateDebut: '2026-11-18', dateFin: '2026-11-18', createdBy: 'staffScribe' }))
await allow('modifier un événement de l’administration (calendrier.modifier)', updateDoc(doc(scribe, 'evenements/st-ev1'), { titre: 'Réunion parents' }))
await allow('retirer un événement (calendrier.modifier)', deleteDoc(doc(scribe, 'evenements/st-ev1')))
await deny('ce poste-là ne lit pas les absences', getDocs(collection(scribe, 'absences')))
await deny('ce poste-là ne lit pas les notes', getDocs(collection(scribe, 'notes')))

// ── Personnel administratif : messagerie ──────────────────────────────────
// `messages.boite` : lire la boîte commune de l'administration, y répondre à
// un destinataire. `messages.envoyer` : écrire à un parent ou à une classe.
// Jamais de diffusion générale, de pièce jointe, ni de signature empruntée.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  const seed = (path, data) => setDoc(doc(db, path), data)
  const base = { type: 'direct', subject: 'S', body: 'B', readBy: [], status: 'sent' }
  await Promise.all([
    seed('users/staffBox', { uid: 'staffBox', role: 'staff', droits: ['messages.boite'] }),
    seed('users/staffSend', { uid: 'staffSend', role: 'staff', droits: ['messages.envoyer'] }),
    seed('messages/st-box1', { ...base, fromId: 'parent2', fromRole: 'parent', eleveId: 'st-e1', toType: 'administration', toIds: [] }),
    seed('messages/st-box2', { ...base, fromId: 'parent2', fromRole: 'parent', eleveId: 'st-e1', toType: 'administration', toIds: [] }),
    seed('messages/st-prive', { ...base, fromId: 'parent2', fromRole: 'parent', eleveId: 'st-e1', toType: 'user', toIds: ['prof2'] }),
    seed('messages/st-parents', { ...base, type: 'announcement', fromId: 'admin1', fromRole: 'admin', toType: 'parents', toIds: [] }),
    seed('messages/st-pour-sg', { ...base, fromId: 'admin1', fromRole: 'admin', toType: 'user', toIds: ['staffSG'] }),
  ])
})
const boite = (db) => getDocs(query(collection(db, 'messages'), where('toType', '==', 'administration')))
const staffMessage = (uid, extra = {}) => ({
  type: 'direct', subject: 'Information', body: 'Bonjour', fromId: uid, fromRole: 'staff', fromNom: 'Vie scolaire',
  toType: 'user', toIds: ['parent2'], readBy: [], deletedBy: [], status: 'sent', createdAt: serverTimestamp(), ...extra,
})
const manyParents = Array.from({ length: 40 }, (_, i) => `st-parent-${i}`)

await allow('surveillant général lit la boîte commune de l’administration', boite(sg))
await allow('surveillant général ouvre un message de la boîte', getDoc(doc(sg, 'messages/st-box1')))
await allow('surveillant général marque lu un message de la boîte', updateDoc(doc(sg, 'messages/st-box1'), { readBy: arrayUnion('staffSG') }))
await deny('surveillant général ne fabrique pas la lecture d’un autre', updateDoc(doc(sg, 'messages/st-box2'), { readBy: arrayUnion('admin1') }))
await deny('surveillant général ne modifie pas le texte d’un message reçu', updateDoc(doc(sg, 'messages/st-box2'), { body: 'Autre texte' }))
await deny('surveillant général ne supprime pas un message', deleteDoc(doc(sg, 'messages/st-box2')))
await allow('surveillant général lit les messages qui lui sont adressés',
  getDocs(query(collection(sg, 'messages'), where('toIds', 'array-contains', 'staffSG'))))
await allow('surveillant général relit ses propres envois',
  getDocs(query(collection(sg, 'messages'), where('fromId', '==', 'staffSG'))))
await deny('surveillant général ne lit pas un message privé entre un parent et un professeur', getDoc(doc(sg, 'messages/st-prive')))
await deny('surveillant général ne lit pas les diffusions aux parents',
  getDocs(query(collection(sg, 'messages'), where('toType', '==', 'parents'))))
await deny('surveillant général ne surveille pas les envois des professeurs',
  getDocs(query(collection(sg, 'messages'), where('fromRole', '==', 'professeur'))))

await allow('surveillant général répond à un parent', setDoc(doc(sg, 'messages/st-sg-rep'), staffMessage('staffSG')))
await allow('surveillant général écrit aux 40 parents d’une classe, texte long (marge d’évaluation des règles)',
  setDoc(doc(sg, 'messages/st-sg-classe'), staffMessage('staffSG', {
    type: 'announcement', category: 'admin', classe: '5S', toLabel: 'Parents de 5S', toIds: manyParents,
    subject: 'S'.repeat(300), body: 'B'.repeat(10000), subjectAr: 'ع'.repeat(300), bodyAr: 'ع'.repeat(10000),
  })))
await deny('surveillant général ne signe pas comme l’administration', setDoc(doc(sg, 'messages/st-sg-admin'), staffMessage('staffSG', { fromRole: 'admin' })))
await deny('surveillant général ne signe pas comme un professeur', setDoc(doc(sg, 'messages/st-sg-prof'), staffMessage('staffSG', { fromRole: 'professeur' })))
await deny('surveillant général n’écrit pas au nom d’un autre compte', setDoc(doc(sg, 'messages/st-sg-autre'), staffMessage('admin1')))
for (const toType of ['parents', 'all', 'teachers', 'administration']) {
  await deny(`surveillant général n’envoie pas de diffusion « ${toType} »`,
    setDoc(doc(sg, `messages/st-sg-${toType}`), staffMessage('staffSG', { toType, toIds: [] })))
}
await deny('surveillant général ne joint pas de fichier',
  setDoc(doc(sg, 'messages/st-sg-pj'), staffMessage('staffSG', { attachments: [poster('affiche.png', 'staffSG')] })))
await deny('surveillant général ne fabrique pas une alerte d’absence', setDoc(doc(sg, 'messages/st-sg-alerte'), staffMessage('staffSG', { type: 'attendance' })))
await deny('surveillant général ne mélange pas l’ancien format (toId)', setDoc(doc(sg, 'messages/st-sg-legacy'), staffMessage('staffSG', { toId: 'all' })))

const box = asUser('staffBox')
await allow('boîte seule : lit la boîte commune', boite(box))
await allow('boîte seule : répond à un destinataire', setDoc(doc(box, 'messages/st-box-rep'), staffMessage('staffBox')))
await deny('boîte seule : n’écrit pas à plusieurs destinataires',
  setDoc(doc(box, 'messages/st-box-deux'), staffMessage('staffBox', { toIds: ['parent1', 'parent2'] })))
await deny('boîte seule : n’écrit pas à une classe',
  setDoc(doc(box, 'messages/st-box-classe'), staffMessage('staffBox', { classe: '5S', toIds: manyParents })))

const send = asUser('staffSend')
await allow('envoi seul : écrit à 12 parents', setDoc(doc(send, 'messages/st-send-12'), staffMessage('staffSend', { toIds: manyParents.slice(0, 12) })))
await deny('envoi seul : ne lit pas la boîte commune', boite(send))
await deny('envoi seul : n’ouvre pas un message de la boîte', getDoc(doc(send, 'messages/st-box1')))
await deny('envoi seul : ne marque pas lu un message de la boîte', updateDoc(doc(send, 'messages/st-box2'), { readBy: arrayUnion('staffSend') }))

for (const uid of ['staffRP', 'staffNone', 'staffBad']) {
  await deny(`${uid} ne lit pas la boîte commune`, boite(asUser(uid)))
  await deny(`${uid} n’écrit à aucun parent`, setDoc(doc(asUser(uid), `messages/st-${uid}`), staffMessage(uid)))
  await deny(`${uid} ne marque pas lu un message de la boîte`, updateDoc(doc(asUser(uid), 'messages/st-box2'), { readBy: arrayUnion(uid) }))
}
await deny('professeur avec un champ droits ne lit pas la boîte commune', boite(asUser('profDroits')))
await deny('parent avec un champ droits ne lit pas la boîte commune', boite(asUser('parentDroits')))
await allow('admin lit toujours la boîte commune', boite(asUser('admin1')))
// Document EXACT écrit par la page Messages du site (saveToFirestore) : une
// trentaine de champs. La règle de création est proche de la limite Firestore
// de 1 000 expressions par requête : chaque rôle doit y tenir avec ce vrai
// document, pas seulement avec un document de test réduit.
const webMessage = (uid, role, extra = {}) => ({
  fromId: uid, fromNom: 'Prénom Nom', fromRole: role, expediteur: 'Prénom Nom',
  toNom: 'Parent de Élève', destinataireId: 'parent2', destinataireType: 'eleve', destinataireLabel: 'Parent de Élève', eleveId: '',
  type: 'direct', toType: 'user', toIds: ['parent2'], toLabel: 'Parent de Élève',
  category: 'admin', readBy: [], deletedBy: [], status: 'sent',
  subject: 'Objet', objet: 'Objet', body: 'Texte du message', message: 'Texte du message',
  priority: 'normal', priorite: 'normal', canal: 'interne', lu: false, read: false, date: new Date(),
  academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10', createdAt: serverTimestamp(), ...extra,
})
const webClassMessage = (uid, role, toIds, classe = '5S') => webMessage(uid, role, {
  type: 'announcement', toIds, toLabel: `Classe ${classe}`, classe, destinataireId: `classe:${classe}`, destinataireType: 'classe',
  toNom: `Classe ${classe}`, destinataireLabel: `Classe ${classe}`,
})
await allow('site : le surveillant général répond à un parent (document complet du site)',
  setDoc(doc(sg, 'messages/st-web-sg-direct'), webMessage('staffSG', 'staff')))
await allow('site : le surveillant général écrit aux 40 parents d’une classe (document complet du site)',
  setDoc(doc(sg, 'messages/st-web-sg-classe'), webClassMessage('staffSG', 'staff', manyParents)))
await allow('site : la boîte seule répond à un parent (document complet du site)',
  setDoc(doc(box, 'messages/st-web-box-direct'), webMessage('staffBox', 'staff')))
await allow('site : l’admin répond à un parent (document complet du site)',
  setDoc(doc(asUser('admin1'), 'messages/st-web-admin-direct'), webMessage('admin1', 'admin')))
await allow('site : l’admin écrit aux 40 parents d’une classe (document complet du site)',
  setDoc(doc(asUser('admin1'), 'messages/st-web-admin-classe'), webClassMessage('admin1', 'admin', manyParents)))
await allow('site : un professeur répond à un parent (document complet du site)',
  setDoc(doc(asUser('prof1'), 'messages/st-web-prof-direct'), webMessage('prof1', 'professeur', { category: 'general' })))
await allow('site : un professeur écrit aux 40 parents de sa classe (document complet du site)',
  setDoc(doc(asUser('prof1'), 'messages/st-web-prof-classe'), webClassMessage('prof1', 'professeur', manyParents, '1A')))

// Requête exacte de la page Messages du site : diffusions générales + boîte commune.
const inboxQuery = (db, types) => getDocs(query(collection(db, 'messages'), where('toType', 'in', types)))
await allow('surveillant général : requête « toutes diffusions + boîte commune » de la page Messages', inboxQuery(sg, ['all', 'administration']))
await allow('envoi seul : requête « diffusions générales » seule', inboxQuery(send, ['all']))
await deny('envoi seul : la même requête avec la boîte commune est refusée', inboxQuery(send, ['all', 'administration']))
await deny('surveillant général : pas les diffusions réservées aux professeurs ou aux parents', inboxQuery(sg, ['all', 'teachers', 'parents', 'administration']))
await allow('admin envoie toujours une diffusion aux parents',
  setDoc(doc(asUser('admin1'), 'messages/st-admin-diffusion'), {
    type: 'announcement', subject: 'S', body: 'B', fromId: 'admin1', fromRole: 'admin', fromNom: 'Administration',
    toType: 'parents', toIds: [], readBy: [], status: 'sent', createdAt: serverTimestamp(),
  }))

// ── Personnel administratif : classes des enseignants ─────────────────────
// `enseignants.modifier` : lire les fiches des professeurs, modifier leurs
// classes — rien d'autre sur ces fiches, et aucun autre compte.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await Promise.all([
    setDoc(doc(db, 'users/staffAffect'), { uid: 'staffAffect', role: 'staff', droits: ['edt.voir', 'enseignants.modifier'] }),
    setDoc(doc(db, 'users/st-prof'), { uid: 'st-prof', role: 'professeur', nom: 'Prof', prenom: 'St', classes: ['5S'], classe: '5S', matiere: 'Maths', cycle: 'college' }),
  ])
})
const affect = asUser('staffAffect')
const teachers = (db) => getDocs(query(collection(db, 'users'), where('role', '==', 'professeur')))
await allow('classes des enseignants : lit la liste des professeurs', teachers(affect))
await allow('classes des enseignants : lit la fiche d’un professeur', getDoc(doc(affect, 'users/st-prof')))
await allow('classes des enseignants : lit l’emploi du temps d’un professeur (case impliquée)', getDoc(doc(affect, 'schedules/prof2')))
await allow('classes des enseignants : modifie les classes d’un professeur',
  updateDoc(doc(affect, 'users/st-prof'), { classes: ['5S', '6T'], classe: deleteField() }))
for (const [what, change] of [
  ['le rôle', { role: 'admin' }], ['la matière', { matiere: 'PC' }], ['le niveau', { cycle: 'primaire' }],
  ['le nom', { nom: 'Autre' }], ['des droits', { droits: ['comptes.gerer'] }], ['un poste', { poste: 'surveillant_general' }],
  ['le numéro de connexion', { authPhoneE164: '+212600000000', parentLoginEnabled: true }],
  ['les classes et le rôle ensemble', { classes: ['6T'], role: 'admin' }],
]) {
  await deny(`classes des enseignants : ne modifie pas ${what} d’un professeur`, updateDoc(doc(affect, 'users/st-prof'), change))
}
for (const uid of ['admin1', 'parent1', 'staffSG', 'staffAffect']) {
  await deny(`classes des enseignants : ne donne pas de classes à ${uid} (pas un professeur)`,
    updateDoc(doc(affect, `users/${uid}`), { classes: ['5S'] }))
}
for (const uid of ['admin1', 'parent1', 'staffSG']) {
  await deny(`classes des enseignants : ne lit pas la fiche de ${uid}`, getDoc(doc(affect, `users/${uid}`)))
}
await deny('classes des enseignants : ne lit pas tous les comptes', getDocs(collection(affect, 'users')))
await deny('classes des enseignants : ne lit pas les comptes parents', getDocs(query(collection(affect, 'users'), where('role', '==', 'parent'))))
await deny('classes des enseignants : ne crée pas de compte', setDoc(doc(affect, 'users/st-nouveau'), { role: 'professeur', classes: ['5S'] }))
await deny('classes des enseignants : ne supprime pas un professeur', deleteDoc(doc(affect, 'users/st-prof')))
await deny('classes des enseignants : cette case seule n’ouvre pas les élèves', getDocs(collection(affect, 'eleves')))
// Sans la case, ou avec un champ `droits` sur un autre rôle : rien de tout cela.
for (const uid of ['staffSG', 'staffNone', 'profDroits', 'parentDroits']) {
  await deny(`${uid} ne lit pas la liste des professeurs`, teachers(asUser(uid)))
  await deny(`${uid} ne modifie pas les classes d’un professeur`, updateDoc(doc(asUser(uid), 'users/st-prof'), { classes: ['1A'] }))
}
await allow('admin lit et modifie toujours la fiche d’un professeur', updateDoc(doc(asUser('admin1'), 'users/st-prof'), { classes: ['5S'], matiere: 'Maths' }))

// ── Bilan ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
await testEnv.cleanup()
process.exit(0)
