import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadMessagesService, personalizedParams, newAttempt, networkError } from '../helpers/personalizedMessages.mjs'

function harness() {
  const docs = new Map(), writes = [], reads = []
  const auth = { currentUser: { uid: 'prof1' } }
  let sequence = 0
  const hooks = { beforeWrite: null, afterWrite: null, beforeRead: null }
  const sdk = {
    collection: (_db, path) => ({ path }),
    doc: (...args) => ({ id: args.length === 1 ? `auto-${++sequence}` : args.at(-1) }),
    query: (collection, ...filters) => ({ collection, filters }),
    where: (field, op, value) => ({ field, op, value }),
    limit: value => ({ limit: value }),
    documentId: () => '__name__',
    serverTimestamp: () => 'server-time',
    getDocsFromServer: async q => {
      reads.push(q)
      await hooks.beforeRead?.(q)
      const id = q.filters.find(f => f.field === '__name__').value
      const author = q.filters.find(f => f.field === 'fromId').value
      const data = docs.get(id)
      // Comme les vraies règles (revue Codex RC02) : une requête sur un
      // identifiant ABSENT est évaluée comme une lecture directe, refusée.
      if (!data) throw Object.assign(new Error('missing message'), { code: 'permission-denied' })
      const result = data.fromId === author ? [{ id, data: () => structuredClone(data) }] : []
      return { empty: !result.length, docs: result }
    },
    setDoc: async (ref, data) => {
      writes.push(ref.id)
      await hooks.beforeWrite?.(ref, data)
      if (docs.has(ref.id)) throw Object.assign(new Error('immutable message'), { code: 'permission-denied' })
      docs.set(ref.id, structuredClone({ ...data, createdAt: `time-${writes.length}` }))
      await hooks.afterWrite?.(ref, data)
    },
  }
  sdk.addDoc = async (collection, data) => {
    const ref = sdk.doc(collection)
    await sdk.setDoc(ref, data)
    return ref
  }
  const service = loadMessagesService(sdk, auth, {}, () => period)
  let period = { academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10' }
  return { docs, writes, reads, auth, hooks, service, attempt: newAttempt(service),
    setPeriod: next => { period = next },
    send(params = personalizedParams(), attempt) { return service.broadcastPersonalized(params, attempt ?? this.attempt) },
  }
}

test('partial failure: retry only creates the missing recipient, using the same ID', async () => {
  const h = harness()
  h.hooks.beforeWrite = () => { if (h.writes.length === 2) throw networkError() }
  await assert.rejects(h.send(), /simulated disconnect/)
  const first = structuredClone([...h.docs])
  const result = await h.send()
  assert.equal(h.docs.size, 2)
  assert.equal(h.writes.length, 3)
  assert.equal(h.writes[1], h.writes[2])
  assert.deepEqual(h.docs.get(first[0][0]), first[0][1])
  assert.equal(result.messagesWritten, 2)
  assert.equal(result.parentsTargeted, 2)
})

test('lost acknowledgement: retry preserves receipts, deletion, push and createdAt', async () => {
  const h = harness()
  h.hooks.afterWrite = () => { if (h.writes.length === 1) throw networkError() }
  await assert.rejects(h.send())
  const [id, message] = [...h.docs][0]
  Object.assign(message, { readBy: ['parent1'], deletedBy: ['parent1'], push: { status: 'accepted', sent: 1 } })
  const before = structuredClone(message)
  await h.send()
  assert.equal(h.docs.size, 2)
  // 2e essai du 1er destinataire refusé par les règles (déjà créé), puis confirmé.
  assert.equal(h.writes.length, 3)
  assert.deepEqual(h.docs.get(id), before)
})

test('an unavailable server check never produces a duplicate', async () => {
  const h = harness()
  h.hooks.afterWrite = () => { throw networkError() }
  await assert.rejects(h.send())
  h.hooks.afterWrite = null
  h.hooks.beforeRead = () => { throw networkError() }
  await assert.rejects(h.send())
  // La nouvelle écriture vise le même identifiant : refusée, aucun doublon.
  assert.equal(h.docs.size, 1)
  h.hooks.beforeRead = null
  await h.send()
  assert.equal(h.docs.size, 2)
})

test('concurrent double send shares pending writes per recipient', async () => {
  const h = harness()
  let release
  const gate = new Promise(resolve => { release = resolve })
  h.hooks.beforeWrite = () => gate
  const first = h.send(), second = h.send()
  release()
  await Promise.all([first, second])
  assert.equal(h.docs.size, 2)
  assert.equal(h.writes.length, 2)
})

test('siblings sharing a parent and the same content remain two messages', async () => {
  const h = harness()
  const params = personalizedParams({ recipients: ['e1', 'e2'].map(eleveId => ({
    parentUid: 'parent1', eleveId, body: 'Bonjour', label: 'Même prénom',
  })) })
  const result = await h.send(params)
  await h.send({ ...params, recipients: [...params.recipients].reverse() })
  assert.equal(h.docs.size, 2)
  assert.equal(h.writes.length, 2)
  assert.equal(result.parentsTargeted, 1)
})

test('reordering recipients after a partial failure does not duplicate the first', async () => {
  const h = harness(), params = personalizedParams()
  h.hooks.beforeWrite = () => { if (h.writes.length === 2) throw networkError() }
  await assert.rejects(h.send(params))
  await h.send({ ...params, recipients: [...params.recipients].reverse() })
  assert.equal(h.docs.size, 2)
})

test('a deliberately new compose can send the same content again', async () => {
  const h = harness()
  await h.send()
  await h.send(personalizedParams(), newAttempt(h.service))
  assert.equal(h.docs.size, 4)
})

test('changed content is a new message; an unchanged retry stays idempotent', async () => {
  const h = harness(), params = personalizedParams()
  await h.send(params)
  const changed = { ...params, subject: 'Version corrigée' }
  await h.send(changed)
  await h.send(changed)
  assert.equal(h.docs.size, 4)
})

test('auth change during a batch stops the next recipient and retries', async () => {
  const h = harness()
  h.hooks.afterWrite = () => { h.auth.currentUser = { uid: 'other' } }
  await assert.rejects(h.send(), /auth\/user-mismatch/)
  await assert.rejects(h.send(), /auth\/user-mismatch/)
  assert.equal(h.docs.size, 1)
  assert.equal(h.writes.length, 1)
})

test('attachment map ordering does not change the operation or cause a conflict', async () => {
  const h = harness()
  const params = personalizedParams({ attachments: [{ url: 'https://example.invalid/test', name: 'test.png', mime: 'image/png' }] })
  h.hooks.afterWrite = () => { if (h.writes.length === 1) throw networkError() }
  await assert.rejects(h.send(params))
  const saved = [...h.docs.values()][0]
  saved.attachments = [{ mime: 'image/png', name: 'test.png', url: 'https://example.invalid/test' }]
  await h.send({ ...params, attachments: saved.attachments })
  assert.equal(h.docs.size, 2)
  assert.equal(h.writes.length, 3)
})

test('uncertain message modified on the server is a conflict, never overwritten', async () => {
  const h = harness()
  h.hooks.afterWrite = () => { throw networkError() }
  await assert.rejects(h.send())
  const saved = [...h.docs.values()][0]
  saved.body = 'Edited by administration'
  await assert.rejects(h.send(), /messages\/retry-content-changed/)
  assert.equal(h.docs.size, 1)
  assert.equal(saved.body, 'Edited by administration')
})

test('an uncertain message keeps its original academic period across month boundaries', async () => {
  const h = harness()
  h.hooks.afterWrite = () => { if (h.writes.length === 1) throw networkError() }
  await assert.rejects(h.send())
  h.setPeriod({ academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-11' })
  await h.send()
  assert.equal(h.docs.size, 2)
  assert.equal(h.writes.length, 3)
  assert.equal([...h.docs.values()][0].monthKey, '2026-10')
})

test('empty batch creates nothing', async () => {
  const h = harness()
  assert.deepEqual(await h.send(personalizedParams({ recipients: [] })), { messagesWritten: 0, pushSent: 0, parentsTargeted: 0 })
  assert.equal(h.writes.length, 0)
})
