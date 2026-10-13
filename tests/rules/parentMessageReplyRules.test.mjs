import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parentMessageReplyTarget } from '../helpers/parentMessageReply.mjs'
import { loadMessagesService } from '../helpers/personalizedMessages.mjs'
const require = createRequire(import.meta.url)
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing')
const sdk = require('firebase/firestore')
sdk.setLogLevel('silent')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required')
const env = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-parent-reply',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
})
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }
try {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [path, data] of Object.entries({
      'users/parent1': { uid: 'parent1', role: 'parent', prenom: 'Test', nom: '' },
      'users/admin1': { uid: 'admin1', role: 'admin' },
      'users/staff1': { uid: 'staff1', role: 'staff', droits: ['messages.boite'] },
      'users/staff2': { uid: 'staff2', role: 'staff', droits: ['messages.envoyer'] },
      'eleves/e1': { parentUid: 'parent1', classe: '1A' },
      'eleves/e2': { parentUid: 'parent2', classe: '1A' },
    })) await sdk.setDoc(sdk.doc(db, path), data)
  })
  const db = env.authenticatedContext('parent1').firestore()
  const service = loadMessagesService(sdk, { currentUser: { uid: 'parent1' } }, db)
  const original = { type: 'direct', fromId: 'staff1', fromRole: 'staff', fromNom: 'Test' }
  const payload = {
    type: 'direct', subject: 'RE: Test', body: 'Synthetic reply',
    fromId: 'parent1', fromNom: 'Test', fromRole: 'parent', eleveId: 'e1',
    priority: 'normal', category: 'admin',
    ...parentMessageReplyTarget(original, 'Administration'),
  }
  let id
  await test('real service: parent reply to staff accepted in shared inbox', async () => {
    id = await service.sendMessage(payload)
    const saved = await sdk.getDoc(sdk.doc(db, 'messages', id))
    assert.equal(saved.get('toType'), 'administration')
    assert.deepEqual(saved.get('toIds'), [])
  })
  await test('staff with inbox permission can read the reply', async () => {
    assert.equal((await sdk.getDoc(sdk.doc(env.authenticatedContext('staff1').firestore(), 'messages', id))).exists(), true)
  })
  await test('staff without inbox permission cannot read the reply', async () => {
    await assertFails(sdk.getDoc(sdk.doc(env.authenticatedContext('staff2').firestore(), 'messages', id)))
  })
  await test('direct parent to staff remains forbidden', async () => {
    await assertFails(service.sendMessage({ ...payload, toType: 'user', toIds: ['staff1'] }))
  })
  await test('reply about another parent child remains forbidden', async () => {
    await assertFails(service.sendMessage({ ...payload, eleveId: 'e2' }))
  })
  await test('existing direct reply to administrator stays allowed', async () => {
    await service.sendMessage({ ...payload,
      ...parentMessageReplyTarget({ ...original, fromRole: 'admin', fromId: 'admin1' }, 'Administration'),
    })
  })
  console.log(`${passed} parent reply tests passed with real service and Firestore rules.`)
} finally { await env.cleanup() }
process.exit(0)
