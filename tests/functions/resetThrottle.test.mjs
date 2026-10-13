/**
 * Tests émulateur du throttling de reset (batch sécurité 5) — exerce le VRAI
 * code de functions/resetThrottle.js (pas une copie), contre l'émulateur
 * Firestore, SANS aucun envoi Resend.
 *
 * Lancer : npm run test:reset-throttle
 * (= firebase emulators:exec --only firestore ... "node tests/functions/resetThrottle.test.mjs")
 *
 * Prouve : (1) la course parallèle par-email est fermée (un seul gagnant),
 * (2) le plafond par email borne les envois vers une même personne,
 * (3) le plafond global glissant borne les envois et la fenêtre se réinitialise.
 */
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const admin = require(resolve(root, 'functions/node_modules/firebase-admin'))
const {
  claimEmailSlot, claimGlobalSlot, emailSlotId, COOLDOWN_COLLECTION,
} = require(resolve(root, 'functions/resetThrottle'))

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('❌ FIRESTORE_EMULATOR_HOST absent — lancer via emulators:exec')
  process.exit(1)
}

admin.initializeApp({ projectId: 'demo-mojammaa-reset' })
const db = admin.firestore()

let passed = 0
const failed = []
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`) }
  catch (e) { failed.push(name); console.error(`  ❌ ${name}\n     ${e.message}`) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }

const COOLDOWN = 60 * 1000
const WINDOW = 60 * 60 * 1000
const MAX = 120
const EMAIL_MAX = 5
const EMAIL_LIMITS = { cooldownMs: COOLDOWN, windowMs: WINDOW, maxInWindow: EMAIL_MAX }

console.log('\n── Course parallèle : cooldown par email ──')
await test('10 appels concurrents pour le même email → exactement 1 envoi', async () => {
  const email = 'victim@example.com'
  const results = await Promise.all(
    Array.from({ length: 10 }, () => claimEmailSlot(db, email, EMAIL_LIMITS)),
  )
  const winners = results.filter(Boolean).length
  assert(winners === 1, `attendu 1 gagnant, obtenu ${winners} (email-bomb non bloqué !)`)
})

await test('nouvel appel dans la fenêtre de cooldown → refusé', async () => {
  const ok = await claimEmailSlot(db, 'victim@example.com', EMAIL_LIMITS)
  assert(ok === false, 'un 2e envoi immédiat aurait dû être bloqué')
})

await test('cooldown expiré (now avancé) → ré-autorisé', async () => {
  const future = Date.now() + COOLDOWN + 1000
  const ok = await claimEmailSlot(db, 'victim@example.com', EMAIL_LIMITS, future)
  assert(ok === true, 'après expiration du cooldown, l\'envoi doit repasser')
})

await test('emails différents → indépendants (pas de blocage croisé)', async () => {
  const a = await claimEmailSlot(db, 'alice@example.com', EMAIL_LIMITS)
  const b = await claimEmailSlot(db, 'bob@example.com', EMAIL_LIMITS)
  assert(a === true && b === true, 'deux emails distincts doivent passer chacun')
})

console.log('\n── Plafond par email ──')
// Chaque essai est espacé de deux fois le délai : seul le plafond peut refuser.
const bombStart = Date.now() + 10 * 60 * 1000
await test(`${EMAIL_MAX} envois espacés passent, les suivants sont refusés malgré le délai respecté`, async () => {
  let allowed = 0
  for (let i = 0; i < EMAIL_MAX + 2; i++) {
    if (await claimEmailSlot(db, 'bombe@example.com', EMAIL_LIMITS, bombStart + i * 2 * COOLDOWN)) allowed++
  }
  assert(allowed === EMAIL_MAX, `attendu ${EMAIL_MAX} autorisés, obtenu ${allowed} (email-bomb non borné !)`)
})

await test('le plafond d\'une adresse ne bloque pas les autres', async () => {
  const ok = await claimEmailSlot(db, 'voisin@example.com', EMAIL_LIMITS, bombStart + 20 * COOLDOWN)
  assert(ok === true, 'une autre adresse doit rester servie')
})

await test('fenêtre par email expirée → envois de nouveau possibles', async () => {
  const ok = await claimEmailSlot(db, 'bombe@example.com', EMAIL_LIMITS, bombStart + WINDOW + 60 * 1000)
  assert(ok === true, 'après la fenêtre, l\'adresse doit être de nouveau servie')
})

await test('le créneau porte une empreinte, jamais l\'adresse en clair', async () => {
  const ids = (await db.collection(COOLDOWN_COLLECTION).get()).docs.map(d => d.id)
  assert(ids.includes(emailSlotId('victim@example.com')), 'créneau attendu sous l\'empreinte de l\'adresse')
  assert(ids.every(id => !id.includes('@')), 'un identifiant de document contient une adresse')
})

console.log('\n── Plafond global glissant ──')
await test('les 120 premiers envois passent, le 121e est refusé', async () => {
  const base = Date.now()
  let allowed = 0
  for (let i = 0; i < 125; i++) {
    if (await claimGlobalSlot(db, WINDOW, MAX, base + i)) allowed++
  }
  assert(allowed === MAX, `attendu ${MAX} autorisés, obtenu ${allowed}`)
})

await test('nouvelle fenêtre (now avancé au-delà de WINDOW) → compteur remis à zéro', async () => {
  const later = Date.now() + WINDOW + 60 * 1000
  const ok = await claimGlobalSlot(db, WINDOW, MAX, later)
  assert(ok === true, 'après expiration de la fenêtre, les envois doivent reprendre')
})

console.log(`\n${passed} tests OK, ${failed.length} échec(s)`)
if (failed.length) {
  console.error('Échecs :\n' + failed.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
process.exit(0)
