/**
 * Preuves émulateur de la transaction transport appelée par la callable.
 * Aucun client/rules n'est impliqué : on exerce le vrai module serveur.
 */
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const admin = require(resolve(root, 'functions/node_modules/firebase-admin'))
const {
  TransportTransitionError,
  canTransitionTrip,
  reportTransportTripDelay,
  transitionTransportTrip,
} = require(resolve(root, 'functions/transportTransitions'))

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('❌ FIRESTORE_EMULATOR_HOST absent — lancer via emulators:exec')
  process.exit(1)
}

admin.initializeApp({ projectId: 'demo-mojammaa-transport' })
const db = admin.firestore()

let passed = 0
const failed = []
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (error) { failed.push(name); console.error(`  ❌ ${name}\n     ${error.message}`) }
}
function assert(condition, message) { if (!condition) throw new Error(message) }
async function expectCode(code, promise) {
  try {
    await promise
    throw new Error(`appel autorisé, erreur ${code} attendue`)
  } catch (error) {
    if (!(error instanceof TransportTransitionError) || error.code !== code) {
      throw error
    }
  }
}

const now = new Date()
const seedTrip = async (id, status, passengerStatuses) => {
  const ref = db.collection('transportTrips').doc(id)
  await ref.set({
    driverUid: 'driver1', serviceDate: '2026-07-14', status,
    routeId: 'R1', updatedAt: now, createdAt: now,
  })
  await Promise.all(passengerStatuses.map((passengerStatus, index) =>
    ref.collection('passengers').doc(`e${index + 1}`).set({
      eleveId: `e${index + 1}`, status: passengerStatus, updatedAt: now,
    })))
}

await Promise.all([
  db.collection('users').doc('admin1').set({ role: 'admin' }),
  db.collection('users').doc('driver1').set({ role: 'parent' }),
  db.collection('users').doc('driver2').set({ role: 'chauffeur' }),
  db.collection('driverProfiles').doc('driver1').set({ active: true }),
  db.collection('driverProfiles').doc('driver2').set({ active: true }),
])
await Promise.all([
  seedTrip('trip-auth', 'scheduled', ['scheduled']),
  seedTrip('trip-depart', 'boarding', ['scheduled', 'boarded']),
  seedTrip('trip-flow', 'boarding', ['boarded', 'absent']),
  seedTrip('trip-malformed', 'arrived', ['mystery']),
  seedTrip('trip-cancel-boarded', 'boarding', ['boarded']),
  seedTrip('trip-cancel-empty', 'scheduled', []),
  seedTrip('trip-delay', 'scheduled', ['scheduled', 'scheduled']),
])

console.log('\n── Graphe de transitions ──')
await test('transition adjacente et retry idempotent reconnus', async () => {
  assert(canTransitionTrip('scheduled', 'boarding'), 'scheduled → boarding doit passer')
  assert(canTransitionTrip('boarding', 'boarding'), 'retry boarding doit être idempotent')
  assert(!canTransitionTrip('scheduled', 'arrived'), 'scheduled → arrived doit être refusé')
  assert(!canTransitionTrip('completed', 'boarding'), 'completed doit être terminal')
})

console.log('\n── Auth et assignation relues dans la transaction ──')
await test('absence d’auth refusée', () => expectCode('unauthenticated',
  transitionTransportTrip(db, { uid: null, tripId: 'trip-auth', nextStatus: 'boarding' })))
await test('chauffeur non assigné refusé', () => expectCode('permission-denied',
  transitionTransportTrip(db, { uid: 'driver2', tripId: 'trip-auth', nextStatus: 'boarding' })))
await test('admin autorisé sans profil chauffeur', async () => {
  const result = await transitionTransportTrip(db, {
    uid: 'admin1', tripId: 'trip-auth', nextStatus: 'boarding',
  })
  assert(result.changed === true, 'la transition admin doit écrire')
})

console.log('\n── Horodatage serveur et idempotence ──')
await test('retry même état ne réécrit pas boardingAt', async () => {
  const ref = db.collection('transportTrips').doc('trip-auth')
  const first = (await ref.get()).get('boardingAt')
  const result = await transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-auth', nextStatus: 'boarding',
  })
  const second = (await ref.get()).get('boardingAt')
  assert(result.changed === false, 'retry doit annoncer changed:false')
  assert(first?.toMillis() === second?.toMillis(), 'boardingAt a été réécrit')
})

console.log('\n── Invariants passagers ──')
await test('départ refusé avec un passager scheduled', () => expectCode('failed-precondition',
  transitionTransportTrip(db, { uid: 'driver1', tripId: 'trip-depart', nextStatus: 'in_transit' })))
await test('départ accepté seulement avec boarded/absent/cancelled', async () => {
  const result = await transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-flow', nextStatus: 'in_transit',
  })
  assert(result.status === 'in_transit', 'statut in_transit attendu')
  const snap = await db.collection('transportTrips').doc('trip-flow').get()
  assert(Boolean(snap.get('startedAt')), 'startedAt serveur absent')
})
await test('fin refusée tant qu’un passager est boarded', async () => {
  await transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-flow', nextStatus: 'arrived',
  })
  await expectCode('failed-precondition', transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-flow', nextStatus: 'completed',
  }))
})
await test('fin acceptée après dropped_off/absent et pose completedAt', async () => {
  await db.collection('transportTrips/trip-flow/passengers').doc('e1').update({ status: 'dropped_off' })
  const result = await transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-flow', nextStatus: 'completed',
  })
  const snap = await db.collection('transportTrips').doc('trip-flow').get()
  assert(result.status === 'completed', 'statut completed attendu')
  assert(Boolean(snap.get('completedAt')), 'completedAt serveur absent')
})
await test('statut passager inconnu bloque la fin', () => expectCode('failed-precondition',
  transitionTransportTrip(db, { uid: 'driver1', tripId: 'trip-malformed', nextStatus: 'completed' })))
await test('annulation refusée si un passager est déjà à bord', () => expectCode('failed-precondition',
  transitionTransportTrip(db, { uid: 'driver1', tripId: 'trip-cancel-boarded', nextStatus: 'cancelled' })))
await test('annulation avant embarquement reste possible', async () => {
  const result = await transitionTransportTrip(db, {
    uid: 'driver1', tripId: 'trip-cancel-empty', nextStatus: 'cancelled',
  })
  assert(result.status === 'cancelled', 'statut cancelled attendu')
})

console.log('\n── Retard atomique et parent-safe ──')
await test('chauffeur non assigné ne signale pas un retard', () => expectCode('permission-denied',
  reportTransportTripDelay(db, {
    uid: 'driver2', tripId: 'trip-delay', delayMinutes: 5, reason: 'Traffic',
  })))
await test('retard et révision sont projetés atomiquement sur tous les passagers', async () => {
  const result = await reportTransportTripDelay(db, {
    uid: 'driver1', tripId: 'trip-delay', delayMinutes: 5, reason: 'Traffic',
  })
  const trip = await db.collection('transportTrips').doc('trip-delay').get()
  const passengers = await db.collection('transportTrips/trip-delay/passengers').get()
  assert(result.revision === 1, 'première révision attendue à 1')
  assert(trip.get('delayMinutes') === 5 && trip.get('delayRevision') === 1, 'trip non mis à jour')
  assert(passengers.docs.every(docSnap =>
    docSnap.get('delayMinutes') === 5 && docSnap.get('delayRevision') === 1),
  'projection passager incohérente')
})
await test('même retard est idempotent et ne crée pas une nouvelle révision', async () => {
  const result = await reportTransportTripDelay(db, {
    uid: 'driver1', tripId: 'trip-delay', delayMinutes: 5, reason: 'Traffic',
  })
  assert(result.changed === false && result.revision === 1, 'retry retard non idempotent')
})
await test('retard suivant incrémente la révision et reste cohérent partout', async () => {
  const result = await reportTransportTripDelay(db, {
    uid: 'driver1', tripId: 'trip-delay', delayMinutes: 10, reason: 'Traffic',
  })
  const trip = await db.collection('transportTrips').doc('trip-delay').get()
  const passengers = await db.collection('transportTrips/trip-delay/passengers').get()
  assert(result.revision === 2 && trip.get('delayMinutes') === 10, 'seconde révision incorrecte')
  assert(passengers.docs.every(docSnap =>
    docSnap.get('delayMinutes') === 10 && docSnap.get('delayRevision') === 2),
  'projection passager obsolète')
})
await test('retard refusé sur une tournée terminée', () => expectCode('failed-precondition',
  reportTransportTripDelay(db, {
    uid: 'driver1', tripId: 'trip-flow', delayMinutes: 5, reason: '',
  })))

console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(name => `  - ${name}`).join('\n'))
  process.exit(1)
}
process.exit(0)
