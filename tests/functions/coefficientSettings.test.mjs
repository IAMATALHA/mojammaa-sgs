import assert from 'node:assert/strict'
import { test } from 'node:test'
import settings from '../../functions/coefficientSettings.js'
const { getCoefficientSettings, saveLevelCoefficients } = settings

function fixture(initial = {}) {
  let config = structuredClone(initial)
  let writes = 0
  const rows = { users: { admin: { role: 'admin' }, teacher: { role: 'professeur', matiere: 'Maths' }, parent: { role: 'parent' } }, eleves: { synthetic: { niveau: '1APIC', active: true } } }
  const snap = data => ({ exists: data !== undefined, data: () => data, get: field => data?.[field] })
  const db = {
    collection(name) {
      const query = { select() { return this }, where() { return this }, async get() { return { docs: Object.values(rows[name] || {}).map(snap) } },
        doc(id) { return { async get() { return snap(name === 'settings' ? config : rows[name]?.[id]) } } }
      }
      return query
    },
    async runTransaction(fn) { return fn({ get: ref => ref.get(), set: (_ref, data) => { config = data; writes++ } }) },
  }
  return { db, config: () => config, writes: () => writes }
}
const request = (uid, data) => ({ auth: { uid }, data })
const input = (values, extra = {}) => ({ niveau: '1APIC', values, expectedRevision: 0, ...extra })

test('Admin can configure a level before grades exist and edit it later', async () => {
  const f = fixture()
  const loaded = await getCoefficientSettings(f.db, request('admin'))
  assert.ok(loaded.levels.includes('1APIC'))
  assert.ok(loaded.subjects.includes('Mathématiques'))
  const result = await saveLevelCoefficients(f.db, request('admin', input({ Maths: 5, Français: 3 })))
  assert.equal(result.revision, 1)
  assert.deepEqual(f.config().parNiveau['1APIC'], { Mathématiques: 5, Français: 3 })
  assert.deepEqual(f.config().parNiveau['1AC'], f.config().parNiveau['1APIC'])
  await saveLevelCoefficients(f.db, request('admin', input({ Mathématiques: 4 }, { expectedRevision: 1 })))
  assert.deepEqual(f.config().parNiveau['1APIC'], { Mathématiques: 4 })
  assert.equal(f.config().levelRevisions['1AC'], 2)
})

test('Saving one level preserves other levels and global settings', async () => {
  const f = fixture({ matieres: { Arabe: 2 }, parNiveau: { '2APIC': { Français: 7 } }, metadata: 'keep' })
  await saveLevelCoefficients(f.db, request('admin', input({ Mathématiques: 5 })))
  assert.deepEqual(f.config().parNiveau['2APIC'], { Français: 7 })
  assert.deepEqual(f.config().matieres, { Arabe: 2 })
  assert.equal(f.config().metadata, 'keep')
})

test('Teachers, parents and unsigned callers cannot read the editor or save coefficients', async () => {
  const f = fixture()
  for (const uid of ['teacher', 'parent', 'missing']) {
    await assert.rejects(getCoefficientSettings(f.db, request(uid)), { code: 'permission-denied' })
    await assert.rejects(saveLevelCoefficients(f.db, request(uid, input({ Arabe: 1 }))), { code: 'permission-denied' })
  }
  await assert.rejects(saveLevelCoefficients(f.db, { data: input({ Arabe: 1 }) }), { code: 'unauthenticated' })
  assert.equal(f.writes(), 0)
})

test('Reject invalid numbers, malformed levels and duplicate subject aliases without writes', async () => {
  const f = fixture()
  for (const value of [0, -1, NaN, Infinity, 101, '5', null]) {
    await assert.rejects(saveLevelCoefficients(f.db, request('admin', input({ Arabe: value }))), { code: 'invalid-argument' })
  }
  for (const niveau of ['', '../settings', '__proto__', 'a.b']) {
    await assert.rejects(saveLevelCoefficients(f.db, request('admin', input({}, { niveau }))), { code: 'invalid-argument' })
  }
  await assert.rejects(saveLevelCoefficients(f.db, request('admin', input({ Maths: 4, Mathématiques: 5 }))), { code: 'invalid-argument' })
  assert.equal(f.writes(), 0)
})

test('A stale editor cannot overwrite another admin; other-level revisions are independent', async () => {
  const f = fixture({ levelRevisions: { '1APIC': 2, '2APIC': 10 }, parNiveau: { '1APIC': { Arabe: 3 } } })
  await assert.rejects(saveLevelCoefficients(f.db, request('admin', input({ Arabe: 4 }))), { code: 'aborted' })
  assert.equal(f.writes(), 0)
  await saveLevelCoefficients(f.db, request('admin', input({ Arabe: 4 }, { expectedRevision: 2 })))
  assert.equal(f.config().levelRevisions['2APIC'], 10)
})
