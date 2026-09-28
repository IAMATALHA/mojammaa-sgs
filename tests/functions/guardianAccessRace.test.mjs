/**
 * Audit 2026-09-28, F4 — une reconstruction ancienne ne restaure jamais une
 * classe retirée entre-temps. Émulateur Firestore uniquement.
 *
 * Scénario de l'audit, sur le vrai moteur de transactions : l'ancienne
 * invocation lit le lien, est mise en pause juste avant d'écrire ; le lien est
 * retiré et la nouvelle invocation (celle du trigger de retrait) tourne ; puis
 * l'ancienne reprend. Sans transaction, elle réécrivait la classe révoquée.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { rebuildGuardianAccess, reconcileAllGuardianAccess } = require('../../functions/guardianAccess')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required; never run against production')
admin.initializeApp({ projectId: 'demo-mojammaa-guardian-race' }, 'guardian-race')
const db = admin.app('guardian-race').firestore()
const { FieldValue } = admin.firestore

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const access = uid => db.doc(`guardianAccess/${uid}`).get()

/**
 * Même base, mais la PREMIÈRE lecture des élèves attend `gate`, qu'elle passe
 * par une transaction (code corrigé) ou par une requête directe (ancien code) :
 * le test reproduit ainsi le scénario de l'audit dans les deux versions.
 */
function pausedAfterFirstRead(gate) {
  let paused = false
  const pauseOnce = async result => {
    if (!paused) { paused = true; await gate }
    return result
  }
  const bind = (target, key) => { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value }
  const gatedQuery = query => new Proxy(query, {
    get: (target, key) => key === 'get' ? async () => pauseOnce(await target.get()) : bind(target, key),
  })
  return {
    collection: name => new Proxy(db.collection(name), {
      get: (target, key) => key === 'where' ? (...args) => gatedQuery(target.where(...args)) : bind(target, key),
    }),
    runTransaction: (fn, options) => db.runTransaction(tx => fn(new Proxy(tx, {
      get: (target, key) => key === 'get' ? async (...args) => pauseOnce(await target.get(...args)) : bind(target, key),
    })), options),
  }
}

let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`) }

await test('an older rebuild paused before its write cannot restore a revoked class', async () => {
  await db.doc('eleves/race-child').set({ parentUid: 'race-parent', classe: 'RACE-A' })
  await rebuildGuardianAccess(db, 'race-parent', FieldValue)
  assert.deepEqual((await access('race-parent')).get('classes'), ['RACE-A'])

  let release
  const gate = new Promise(resolve => { release = resolve })
  const older = rebuildGuardianAccess(pausedAfterFirstRead(gate), 'race-parent', FieldValue)
  await sleep(300) // l'ancienne invocation a lu le lien et attend

  // Retrait du lien, puis reconstruction « récente » (celle du trigger).
  const unlink = db.doc('eleves/race-child').update({ parentUid: FieldValue.delete() })
  const newer = unlink.then(() => rebuildGuardianAccess(db, 'race-parent', FieldValue))
  // Sans transaction ces deux opérations finissent ici ; avec, le retrait peut
  // attendre la fin de l'ancienne. Dans les deux cas on relâche ensuite.
  await Promise.race([Promise.allSettled([unlink, newer]), sleep(1500)])
  release()
  await Promise.all([older, unlink, newer])

  assert.equal((await access('race-parent')).exists, false, 'revoked class must stay revoked')
})

await test('positive control: a live link is still granted', async () => {
  await db.doc('eleves/live-child').set({ parentUid: 'live-parent', classe: 'LIVE-B' })
  const result = await rebuildGuardianAccess(db, 'live-parent', FieldValue)
  assert.deepEqual(result, { active: true, childCount: 1, classCount: 1 })
  assert.deepEqual((await access('live-parent')).get('classes'), ['LIVE-B'])
})

await test('nightly reconciliation removes a stale grant and restores a missing one', async () => {
  await Promise.all([
    db.doc('guardianAccess/stale-parent').set({ uid: 'stale-parent', childIds: ['gone'], classes: ['OLD'] }),
    db.doc('eleves/missing-child').set({ parentUid: 'missing-parent', classe: 'NEW-C' }),
  ])
  await reconcileAllGuardianAccess(db, FieldValue)
  assert.equal((await access('stale-parent')).exists, false)
  assert.deepEqual((await access('missing-parent')).get('classes'), ['NEW-C'])
  assert.deepEqual((await access('live-parent')).get('classes'), ['LIVE-B'])
})

console.log(`guardianAccess race: ${passed} tests OK`)
await admin.app('guardian-race').delete()
