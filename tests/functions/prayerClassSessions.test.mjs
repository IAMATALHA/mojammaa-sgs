/**
 * Preuves émulateur du démarrage serveur d'une session de prière.
 * Le module est exercé directement : aucune confiance dans le client/rules.
 */
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const admin = require(resolve(root, 'functions/node_modules/firebase-admin'))
const {
  PrayerClassSessionError,
  casablancaClock,
  findCurrentClassSlot,
  startPrayerClassSession,
} = require(resolve(root, 'functions/prayerClassSessions'))

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('❌ FIRESTORE_EMULATOR_HOST absent — lancer via emulators:exec')
  process.exit(1)
}

admin.initializeApp({ projectId: 'demo-mojammaa-prayer' })
const db = admin.firestore()
const DURING_WEDNESDAY_CLASS = new Date('2026-07-15T08:45:00.000Z')

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
    if (!(error instanceof PrayerClassSessionError) || error.code !== code) throw error
  }
}

const wednesdaySlots = [
  {
    day: 'wednesday', startTime: '09:30', endTime: '10:30', durationMin: 60,
    classe: '1A', seance: 'S6',
  },
  {
    day: 'wednesday', startTime: '10:30', endTime: '11:30', durationMin: 60,
    classe: '2B', seance: 'S1',
  },
  {
    day: 'tuesday', startTime: '09:30', endTime: '10:30', durationMin: 60,
    classe: '3C', seance: 'S2',
  },
]
const ambiguousSlots = [
  { day: 'wednesday', startTime: '09:30', endTime: '10:30', classe: '1A' },
  { day: 'wednesday', startTime: '09:30', endTime: '10:30', classe: '4D' },
]

await Promise.all([
  db.collection('users').doc('prof1').set({ role: 'professeur', classes: ['1A', '2B', '3C', '4D'] }),
  db.collection('users').doc('profLegacy').set({ role: 'professeur', classe: '1A' }),
  db.collection('users').doc('admin1').set({ role: 'admin', classes: ['1A'] }),
  db.collection('users').doc('profNoClass').set({ role: 'professeur', classes: ['9Z'] }),
  db.collection('users').doc('profAmbiguous').set({ role: 'professeur', classes: ['1A', '4D'] }),
  db.collection('schedules').doc('prof1').set({ teacherUid: 'prof1', weeklySlots: wednesdaySlots }),
  db.collection('schedules').doc('profLegacy').set({ teacherUid: 'profLegacy', weeklySlots: wednesdaySlots }),
  db.collection('schedules').doc('admin1').set({ teacherUid: 'admin1', weeklySlots: wednesdaySlots }),
  db.collection('schedules').doc('profNoClass').set({ teacherUid: 'profNoClass', weeklySlots: wednesdaySlots }),
  db.collection('schedules').doc('profAmbiguous').set({ teacherUid: 'profAmbiguous', weeklySlots: ambiguousSlots }),
])

console.log('\n── Horloge et créneau en cours ──')
await test('date, jour et heure sont dérivés en Africa/Casablanca', async () => {
  const clock = casablancaClock(DURING_WEDNESDAY_CLASS)
  assert(clock.serviceDate === '2026-07-15', `date inattendue: ${clock.serviceDate}`)
  assert(clock.day === 'wednesday', `jour inattendu: ${clock.day}`)
  assert(clock.minuteOfDay === 9 * 60 + 45, `minute inattendue: ${clock.minuteOfDay}`)
})
await test('S1…S6 sont ignorées : seules classe et heures prouvent le cours', async () => {
  const clock = casablancaClock(DURING_WEDNESDAY_CLASS)
  const slot = findCurrentClassSlot(wednesdaySlots, '1A', clock)
  assert(slot?.seance === 'S6', 'le créneau attendu doit être trouvé malgré son libellé S6')
  assert(findCurrentClassSlot(wednesdaySlots, '2B', clock) === null, 'le prochain cours ne doit pas passer')
})
await test('début inclus, fin exclue et durationMin remplace une fin absente', async () => {
  const base = [{ day: 'wednesday', startTime: '09:30', durationMin: 60, classe: '1A' }]
  assert(findCurrentClassSlot(base, '1A', { day: 'wednesday', minuteOfDay: 570 }), 'début refusé')
  assert(findCurrentClassSlot(base, '1A', { day: 'wednesday', minuteOfDay: 629 }), 'cours refusé')
  assert(!findCurrentClassSlot(base, '1A', { day: 'wednesday', minuteOfDay: 630 }), 'fin incluse')
})
await test('deux créneaux simultanés restent ambigus et ne sont jamais choisis', async () => {
  const clock = casablancaClock(DURING_WEDNESDAY_CLASS)
  assert(findCurrentClassSlot(ambiguousSlots, '1A', clock) === null, 'un créneau arbitraire a été choisi')
  assert(findCurrentClassSlot(ambiguousSlots, '4D', clock) === null, 'un créneau arbitraire a été choisi')
})

console.log('\n── Auth, rôle, classe et emploi du temps relus côté serveur ──')
await test('absence d’auth refusée', () => expectCode('unauthenticated',
  startPrayerClassSession(db, { uid: null, classe: '1A', now: DURING_WEDNESDAY_CLASS })))
await test('classe malformée refusée', () => expectCode('invalid-argument',
  startPrayerClassSession(db, { uid: 'prof1', classe: '1/A', now: DURING_WEDNESDAY_CLASS })))
await test('admin refusé même avec un créneau', () => expectCode('permission-denied',
  startPrayerClassSession(db, { uid: 'admin1', classe: '1A', now: DURING_WEDNESDAY_CLASS })))
await test('prof sans la classe dans son profil refusé malgré le créneau', () => expectCode('permission-denied',
  startPrayerClassSession(db, { uid: 'profNoClass', classe: '1A', now: DURING_WEDNESDAY_CLASS })))
await test('prochain cours refusé', () => expectCode('failed-precondition',
  startPrayerClassSession(db, { uid: 'prof1', classe: '2B', now: DURING_WEDNESDAY_CLASS })))
await test('mauvais jour refusé', () => expectCode('failed-precondition',
  startPrayerClassSession(db, {
    uid: 'prof1', classe: '3C', now: DURING_WEDNESDAY_CLASS,
  })))
await test('emploi du temps simultané ambigu refusé', () => expectCode('failed-precondition',
  startPrayerClassSession(db, {
    uid: 'profAmbiguous', classe: '4D', now: DURING_WEDNESDAY_CLASS,
  })))

console.log('\n── Écriture serveur, absence de seance et machine terminale ──')
await test('prof autorisé démarre SA classe actuellement en cours', async () => {
  const result = await startPrayerClassSession(db, {
    uid: 'prof1', classe: '1A', now: DURING_WEDNESDAY_CLASS,
  })
  const snap = await db.collection('prayerClassSessions').doc('2026-07-15_1A').get()
  const data = snap.data()
  assert(result.changed === true && result.status === 'going', 'création non annoncée')
  assert(data?.startedByUid === 'prof1', 'acteur serveur incorrect')
  assert(data?.serviceDate === '2026-07-15', 'date serveur incorrecte')
  assert(data?.startedAt?.toMillis() > 0 && data?.updatedAt?.toMillis() > 0, 'timestamps serveur absents')
  assert(!Object.hasOwn(data || {}, 'seance'), 'la session prière ne doit pas stocker S1…S6')
})
await test('profil legacy classe reste autorisé pendant son cours', async () => {
  const result = await startPrayerClassSession(db, {
    uid: 'profLegacy', classe: '1A', now: DURING_WEDNESDAY_CLASS,
  })
  assert(result.changed === false, 'la session active de la classe doit être partagée/idempotente')
})
await test('retry going est idempotent et conserve startedAt', async () => {
  const ref = db.collection('prayerClassSessions').doc('2026-07-15_1A')
  const first = (await ref.get()).get('startedAt')
  const result = await startPrayerClassSession(db, {
    uid: 'prof1', classe: '1A', now: DURING_WEDNESDAY_CLASS,
  })
  const second = (await ref.get()).get('startedAt')
  assert(result.changed === false && result.status === 'going', 'retry going non idempotent')
  assert(first.toMillis() === second.toMillis(), 'startedAt a été réécrit')
})
await test('retry going reste idempotent après la fin du cours', async () => {
  const result = await startPrayerClassSession(db, {
    uid: 'prof1', classe: '1A', now: new Date('2026-07-15T09:45:00.000Z'),
  })
  assert(result.changed === false && result.status === 'going', 'retry tardif non idempotent')
})
await test('session praying reste idempotente', async () => {
  const ref = db.collection('prayerClassSessions').doc('2026-07-15_1A')
  await ref.update({ status: 'praying', prayingAt: new Date(), prayingByUid: 'prof1' })
  const result = await startPrayerClassSession(db, {
    uid: 'prof1', classe: '1A', now: DURING_WEDNESDAY_CLASS,
  })
  assert(result.changed === false && result.status === 'praying', 'retry praying non idempotent')
})
await test('session returned est terminale et ne redémarre jamais', async () => {
  const ref = db.collection('prayerClassSessions').doc('2026-07-15_1A')
  await ref.update({ status: 'returned', returnedAt: new Date(), returnedByUid: 'prof1' })
  await expectCode('failed-precondition', startPrayerClassSession(db, {
    uid: 'prof1', classe: '1A', now: DURING_WEDNESDAY_CLASS,
  }))
  assert((await ref.get()).get('status') === 'returned', 'session terminale altérée')
})

console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(name => `  - ${name}`).join('\n'))
  process.exit(1)
}
process.exit(0)
