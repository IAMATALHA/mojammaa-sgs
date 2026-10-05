// F06 avec le VRAI service et les VRAIES règles (revue Codex du 5 octobre,
// RC02) : la simulation de services/personalizedMessages.test.mjs ne peut pas
// prouver ce que les règles autorisent. Émulateur Firestore uniquement.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadMessagesService, personalizedParams, newAttempt } from '../helpers/personalizedMessages.mjs'

// Même chargement (CommonJS) pour les deux : sinon le SDK ne reconnaît pas
// l'instance Firestore fournie par rules-unit-testing.
const require = createRequire(import.meta.url)
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing')
const sdk = require('firebase/firestore')
sdk.setLogLevel('silent')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; never run against production')
const env = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-f06-rules',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
})
const offline = () => Object.assign(new Error('simulated offline'), { code: 'unavailable' })
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }

await env.clearFirestore()
await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore()
  await Promise.all([
    sdk.setDoc(sdk.doc(db, 'users/f06-professeur'), { role: 'professeur', classes: ['1A'] }),
    sdk.setDoc(sdk.doc(db, 'users/f06-admin'), { role: 'admin' }),
    sdk.setDoc(sdk.doc(db, 'users/parent1'), { role: 'parent' }),
    sdk.setDoc(sdk.doc(db, 'users/parent2'), { role: 'parent' }),
  ])
})

function sender(role, failOn) {
  const uid = `f06-${role}`
  const database = env.authenticatedContext(uid).firestore()
  let writes = 0
  const service = loadMessagesService({ ...sdk, setDoc: async (...args) => failOn(++writes, () => sdk.setDoc(...args)) },
    { currentUser: { uid } }, database)
  const mine = () => sdk.getDocsFromServer(sdk.query(sdk.collection(database, 'messages'), sdk.where('fromId', '==', uid)))
  return { uid, service, mine, params: personalizedParams({ teacher: { uid, prenom: 'Test', nom: role }, fromRole: role }) }
}

for (const role of ['professeur', 'admin']) {
  await test(`${role} : panne AVANT la création du 2e message, la reprise crée le manquant`, async () => {
    // 2e écriture perdue avant d'atteindre le serveur.
    const s = sender(role, async (n, write) => { if (n === 2) throw offline(); await write() })
    const before = (await s.mine()).size
    const attempt = newAttempt(s.service)
    await assert.rejects(s.service.broadcastPersonalized(s.params, attempt), /simulated offline/)
    await s.service.broadcastPersonalized(s.params, attempt)
    await s.service.broadcastPersonalized(s.params, attempt)
    assert.equal((await s.mine()).size - before, 2)
  })
  await test(`${role} : accusé perdu APRÈS la création, accusés et date conservés`, async () => {
    const s = sender(role, async (n, write) => { await write(); if (n === 1) throw offline() })
    const before = new Set((await s.mine()).docs.map(d => d.id))
    const attempt = newAttempt(s.service)
    await assert.rejects(s.service.broadcastPersonalized(s.params, attempt), /simulated offline/)
    const saved = (await s.mine()).docs.find(d => !before.has(d.id))
    await sdk.updateDoc(sdk.doc(env.authenticatedContext('parent1').firestore(), 'messages', saved.id), {
      readBy: sdk.arrayUnion('parent1'), deletedBy: sdk.arrayUnion('parent1'),
    })
    await s.service.broadcastPersonalized(s.params, attempt)
    const after = (await s.mine()).docs.filter(d => !before.has(d.id))
    assert.equal(after.length, 2)
    const kept = after.find(d => d.id === saved.id).data()
    assert.deepEqual(kept.readBy, ['parent1']); assert.deepEqual(kept.deletedBy, ['parent1'])
    assert.equal(kept.createdAt.isEqual(saved.get('createdAt')), true)
    await assertFails(sdk.updateDoc(sdk.doc(env.authenticatedContext('outsider').firestore(), 'messages', saved.id), {
      readBy: sdk.arrayUnion('outsider'),
    }))
  })
}

console.log(`${passed} F06 tests passed with the real rules (Firestore emulator).`)
await env.cleanup()
process.exit(0)
