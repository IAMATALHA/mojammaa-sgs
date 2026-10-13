/**
 * Boîte de réception bornée — le VRAI service (src/services/messagesService.ts)
 * contre l'émulateur Firestore et les vraies règles.
 *
 * Prouve : (1) chaque requête ne rend que ses messages les plus récents et
 * signale qu'il en reste, (2) une page plus grande rend tout, sans l'année
 * précédente, (3) si l'index du tri manque (failed-precondition), la boîte
 * retombe sur l'ancienne requête sans borne au lieu de rester vide, (4) une
 * autre erreur remonte à l'écran.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadMessagesService } from '../helpers/personalizedMessages.mjs'

const require = createRequire(import.meta.url)
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing')
const sdk = require('firebase/firestore')
sdk.setLogLevel('silent')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required')

const env = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-inbox-paging',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
})
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }

// Dernier état reçu une fois les écoutes calmées (trois requêtes répondent chacune à leur tour).
function settled(subscribe) {
  return new Promise((resolve, reject) => {
    let last = null, timer = null
    const done = () => { stop(); resolve(last) }
    const stop = subscribe(
      (messages, more) => { last = { ids: messages.map(m => m.id), more }; clearTimeout(timer); timer = setTimeout(done, 400) },
      error => { clearTimeout(timer); stop(); reject(error) },
    )
  })
}

try {
  await env.clearFirestore()
  const at = minutes => new Date(Date.UTC(2026, 9, 12, 8, minutes))
  const message = (extra, minutes, year = '2026-2027') => ({
    type: 'direct', subject: 'S', body: 'B', fromId: 'admin1', fromRole: 'admin', fromNom: 'Administration',
    readBy: [], status: 'sent', academicYear: year, monthKey: '2026-10', createdAt: at(minutes), ...extra,
  })
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    const docs = {
      'users/parent1': { uid: 'parent1', role: 'parent', prenom: 'Pa', nom: 'Rent' },
      'users/admin1': { uid: 'admin1', role: 'admin' },
      'eleves/e1': { parentUid: 'parent1', classe: '1A' },
      'guardianAccess/parent1': { uid: 'parent1', childIds: ['e1'], classes: ['1A'] },
      // Cinq messages directs, du plus ancien (d1) au plus récent (d5).
      ...Object.fromEntries([1, 2, 3, 4, 5].map(i => [`messages/d${i}`, message({ toType: 'user', toIds: ['parent1'] }, i)])),
      'messages/b1': message({ toType: 'parents', toIds: [] }, 11),
      'messages/b2': message({ toType: 'all', toIds: [] }, 12),
      'messages/old-format': message({ toId: 'parent1' }, 13),
      'messages/last-year': message({ toType: 'user', toIds: ['parent1'] }, 14, '2025-2026'),
      ...Object.fromEntries([1, 2, 3].map(i => [`messages/s${i}`, message({
        fromId: 'parent1', fromRole: 'parent', fromNom: 'Pa Rent', toType: 'administration', toIds: [], eleveId: 'e1',
      }, 20 + i)])),
    }
    for (const [path, data] of Object.entries(docs)) await sdk.setDoc(sdk.doc(db, path), data)
  })
  const db = env.authenticatedContext('parent1').firestore()
  const service = loadMessagesService(sdk, { currentUser: { uid: 'parent1' } }, db)
  const inbox = (svc, max) => settled((next, fail) => svc.subscribeMessages('parent1', 'parent', next, fail, max))
  const sent = (svc, max) => settled((next, fail) => svc.subscribeSentMessages('parent1', next, fail, max))

  await test('page de 2 : les 2 plus récents de chaque requête, et « il en reste »', async () => {
    const result = await inbox(service, 2)
    assert.deepEqual(result.ids, ['old-format', 'b2', 'b1', 'd5', 'd4'])
    assert.equal(result.more, true)
  })
  await test('page plus grande : toute l’année en cours, du plus récent au plus ancien, sans l’année passée', async () => {
    const result = await inbox(service, 10)
    assert.deepEqual(result.ids, ['old-format', 'b2', 'b1', 'd5', 'd4', 'd3', 'd2', 'd1'])
    assert.equal(result.more, false)
  })
  await test('la page par défaut est la même pour tous les écrans', async () => {
    assert.equal(service.INBOX_PAGE, 100)
    assert.equal((await inbox(service, undefined)).ids.length, 8)
  })
  await test('messages envoyés : même borne', async () => {
    assert.deepEqual(await sent(service, 2), { ids: ['s3', 's2'], more: true })
    assert.deepEqual(await sent(service, 10), { ids: ['s3', 's2', 's1'], more: false })
  })

  // Un serveur sans l'index du tri refuse toute requête bornée ; les autres passent.
  const refusing = code => {
    const bounded = new WeakSet()
    return {
      ...sdk,
      query: (...args) => {
        const built = sdk.query(...args)
        if (args.some(part => part?.type === 'limit')) bounded.add(built)
        return built
      },
      onSnapshot: (target, next, fail) => {
        if (!bounded.has(target)) return sdk.onSnapshot(target, next, fail)
        queueMicrotask(() => fail(Object.assign(new Error('The query requires an index.'), { code })))
        return () => {}
      },
    }
  }
  await test('index du tri absent : la boîte retombe sur l’ancienne requête, complète', async () => {
    const fallback = loadMessagesService(refusing('failed-precondition'), { currentUser: { uid: 'parent1' } }, db)
    const result = await inbox(fallback, 2)
    assert.deepEqual(result.ids, ['old-format', 'b2', 'b1', 'd5', 'd4', 'd3', 'd2', 'd1'])
    assert.equal(result.more, false)
    assert.deepEqual(await sent(fallback, 2), { ids: ['s3', 's2', 's1'], more: false })
  })
  await test('une autre erreur n’est pas masquée : elle remonte à l’écran', async () => {
    const denied = loadMessagesService(refusing('permission-denied'), { currentUser: { uid: 'parent1' } }, db)
    await assert.rejects(inbox(denied, 2), error => error.code === 'permission-denied')
  })
  console.log(`${passed} inbox paging tests passed with the real service and Firestore rules.`)
} finally {
  await env.cleanup()
}
process.exit(0)
