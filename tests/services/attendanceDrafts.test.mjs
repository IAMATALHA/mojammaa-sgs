import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'
const output = ts.transpileModule(fs.readFileSync(new URL('../../src/services/attendance-drafts-core.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const { createAttendanceDraftStore } = module.exports
const base = () => ({ uid: 'teacher', date: '2026-09-05', lessonKey: 'key', slot: { classe: 'TEST' }, seance: 'S1', rows: [{ id: 'child', status: 'absent', baseVersion: 'missing' }], state: 'draft', updatedAt: Date.now() })
function setup(send = async () => ({ versions: { child: 'server-version' } })) {
  const data = new Map(), calls = []
  let uid = 'teacher'
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value) } }
  const sending = async draft => { calls.push(draft); return send(draft) }
  const create = () => createAttendanceDraftStore(storage, sending, () => uid)
  const store = create()
  return { store, data, storage, calls, create, switchUser: next => { uid = next } }
}
const queued = () => ({ ...base(), state: 'queued', operationId: 'operation-1' })
test('Cold restart restores unvalidated choices without sending', async () => {
  const h = setup(); await h.store.put(base())
  const restart = h.create()
  assert.equal((await restart.get('teacher', base().date, 'key')).rows[0].status, 'absent')
  await restart.flush('teacher'); assert.equal(h.calls.length, 0)
})
test('Queued choices survive network failure and restart, then sync once', async () => {
  let online = false
  const h = setup(async () => { if (!online) throw { code: 'functions/unavailable' }; return { versions: { child: 'v2' } } })
  await h.store.put(queued()); await h.store.flush('teacher')
  assert.equal((await h.store.read('teacher'))[0].state, 'queued')
  online = true
  const restart = h.create(); await restart.flush('teacher'); await restart.flush('teacher')
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].operationId, h.calls[1].operationId)
  assert.equal((await restart.read('teacher'))[0].rows[0].baseVersion, 'v2')
  assert.equal((await restart.read('teacher'))[0].date, '2026-09-05')
})
test('Concurrent foreground and timer sync do not double-submit', async () => {
  const h = setup(); await h.store.put(queued())
  await Promise.all([h.store.flush('teacher'), h.store.flush('teacher'), h.store.flush('teacher')])
  assert.equal(h.calls.length, 1)
})
test('Switching accounts prevents sending or showing another user drafts', async () => {
  const h = setup(); await h.store.put(queued()); h.switchUser('other')
  await h.store.flush('teacher'); await h.store.flush('other')
  assert.equal(h.calls.length, 0); assert.deepEqual(await h.store.read('other'), [])
  assert.equal((await h.store.read('teacher'))[0].state, 'queued')
})
test('Role, roster or version conflicts move to review without automatic retries', async () => {
  for (const code of ['permission-denied', 'failed-precondition', 'invalid-argument', 'already-exists']) {
    const h = setup(async () => { throw { code: `functions/${code}` } })
    await h.store.put(queued()); await h.store.flush('teacher'); await h.store.flush('teacher')
    assert.equal(h.calls.length, 1); assert.equal((await h.store.read('teacher'))[0].state, 'review')
  }
})
test('Serialized quick edits preserve the last choice', async () => {
  const h = setup()
  await Promise.all(['absent', 'retard', 'present'].map(status => h.store.put({ ...base(), rows: [{ ...base().rows[0], status }] })))
  assert.equal((await h.store.read('teacher'))[0].rows[0].status, 'present')
})
test('Queued work cannot be discarded while a server request may be in flight', async () => {
  const h = setup(); await h.store.put(queued()); await h.store.discard(queued())
  assert.equal((await h.store.read('teacher')).length, 1)
  await h.store.put({ ...queued(), state: 'review' }); await h.store.discard(queued())
  assert.equal((await h.store.read('teacher')).length, 0)
})
test('Old unsent work is retained while synchronized caches expire', async () => {
  const h = setup(), updatedAt = Date.now() - 8 * 86400_000
  await h.store.put({ ...base(), updatedAt })
  await h.store.put({ ...base(), lessonKey: 'old-cache', state: 'synced', updatedAt })
  assert.equal((await h.store.read('teacher')).length, 1)
  assert.equal((await h.store.read('teacher'))[0].state, 'draft')
})
test('Storage failure before queuing cannot submit an unpersisted operation', async () => {
  const h = setup(); await h.store.put(base())
  h.storage.setItem = async () => { throw new Error('disk-full') }
  await assert.rejects(h.store.put(queued()))
  await h.store.flush('teacher'); assert.equal(h.calls.length, 0)
})
test('Server success followed by local write failure retains the same id for safe replay', async () => {
  const h = setup(); await h.store.put(queued())
  const save = h.storage.setItem
  h.storage.setItem = async () => { throw new Error('disk-full') }
  await h.store.flush('teacher')
  assert.equal((await h.store.read('teacher'))[0].state, 'queued')
  h.storage.setItem = save
  await h.store.flush('teacher')
  assert.equal(h.calls[0].operationId, h.calls[1].operationId)
  assert.equal((await h.store.read('teacher'))[0].state, 'synced')
})
test('An old server response cannot replace a newer operation', async () => {
  let release, started
  const begin = new Promise(resolve => { started = resolve })
  const h = setup(async () => { started(); return new Promise(resolve => { release = resolve }) })
  await h.store.put(queued())
  const flush = h.store.flush('teacher'); await begin
  await h.store.put({ ...queued(), operationId: 'operation-2' })
  release({ versions: { child: 'old-version' } }); await flush
  const stored = (await h.store.read('teacher'))[0]
  assert.equal(stored.operationId, 'operation-2'); assert.equal(stored.state, 'queued')
})
test('A mid-sync account switch stops remaining queued lessons', async () => {
  const h = setup(async () => { h.switchUser('other'); return { versions: {} } })
  await h.store.put(queued()); await h.store.put({ ...queued(), lessonKey: 'second', operationId: 'operation-2' })
  await h.store.flush('teacher')
  assert.equal(h.calls.length, 1)
  assert.equal((await h.store.read('teacher')).filter(d => d.state === 'queued').length, 1)
})
