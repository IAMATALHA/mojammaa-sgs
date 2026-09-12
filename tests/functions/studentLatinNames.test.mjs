import assert from 'node:assert/strict'
import { test } from 'node:test'
import names from '../../functions/studentLatinNames.js'
import alerts from '../../functions/schoolAlerts.js'
const { updateStudentLatinNames, preserveLatinNames } = names

const original = { codeMassar: 'A123456789', nom: 'العلوي', prenom: 'أمين', classe: '1APIC-3', parentUid: 'synthetic-parent', nomFr: 'Alaoui', prenomFr: 'Amine' }
const expected = { nomLatin: '', prenomLatin: '', nomFr: 'Alaoui', prenomFr: 'Amine' }
const row = (extra = {}) => ({ id: 'child', codeMassar: original.codeMassar, nomLatin: 'El Alaoui', prenomLatin: '', expected, ...extra })
function fixture(children = { child: original }) {
  let records = structuredClone(children), commits = 0
  const snap = (id, data) => ({ id, ref: { id }, exists: !!data, data: () => data, get: k => data?.[k] })
  const users = { admin: 'admin', teacher: 'professeur', parent: 'parent' }
  const db = {
    collection(name) {
      return {
        doc(id) { return { get: async () => snap(id, name === 'users' ? { role: users[id] } : records[id]) } },
        where(field, op, value) { assert.equal(op, '=='); return { get: async () => ({ docs: Object.entries(records).filter(([, r]) => r[field] === value).map(([id, r]) => snap(id, r)) }) } },
      }
    },
    async runTransaction(fn) {
      const pending = []
      const result = await fn({ get: ref => ref.get(), update: (ref, patch) => pending.push([ref.id, patch]) })
      for (const [id, patch] of pending) records[id] = { ...records[id], ...patch }
      commits += pending.length; return result
    },
  }
  return { db, records: () => records, commits: () => commits }
}
const request = (rows, uid = 'admin') => ({ auth: { uid }, data: { rows } })

test('Admin edits Latin spelling only, preserving Arabic identity and blank cells', async () => {
  const f = fixture()
  assert.deepEqual(await updateStudentLatinNames(f.db, request([row()])), { updated: 1 })
  assert.deepEqual(f.records().child, { ...original, nomLatin: 'El Alaoui', nomFr: 'El Alaoui' })
  assert.equal(f.records().child.prenomLatin, undefined)
})
test('Denied roles and anonymous callers produce no writes', async () => {
  const f = fixture()
  for (const uid of ['teacher', 'parent', 'missing']) await assert.rejects(updateStudentLatinNames(f.db, request([row()], uid)), { code: 'permission-denied' })
  await assert.rejects(updateStudentLatinNames(f.db, { data: { rows: [row()] } }), { code: 'unauthenticated' })
  assert.equal(f.commits(), 0)
})
test('Reject duplicates, unknown identities, archived students and invalid Latin names atomically', async () => {
  const f = fixture()
  for (const rows of [[row(), row()], [row({ nomLatin: 'العلمي' })], [row({ codeMassar: '1234' })], [row({ nomLatin: '=NOW()' })]]) {
    await assert.rejects(updateStudentLatinNames(f.db, request(rows)), { code: 'invalid-argument' })
  }
  await assert.rejects(updateStudentLatinNames(f.db, request([row(), row({ id: 'unknown', codeMassar: 'B123456789' })])), { code: 'failed-precondition' })
  const duplicate = fixture({ child: original, duplicate: original })
  await assert.rejects(updateStudentLatinNames(duplicate.db, request([row()])), { code: 'failed-precondition' })
  const archived = fixture({ child: { ...original, active: false } })
  await assert.rejects(updateStudentLatinNames(archived.db, request([row()])), { code: 'failed-precondition' })
  assert.equal(f.commits() + duplicate.commits() + archived.commits(), 0)
})
test('Stale preview cannot overwrite an administrator correction; arbitrary fields are ignored', async () => {
  const f = fixture({ child: { ...original, nomLatin: 'Corrected' } })
  await assert.rejects(updateStudentLatinNames(f.db, request([row()])), { code: 'aborted' })
  assert.equal(f.commits(), 0)
  const g = fixture()
  await updateStudentLatinNames(g.db, request([row({ parentUid: 'attacker', nom: 'changed', classe: 'other' })]))
  assert.equal(g.records().child.parentUid, original.parentUid)
  assert.equal(g.records().child.nom, original.nom)
})
test('Automatic imports preserve manual spelling, recover legacy names and retain conflicts for review', () => {
  assert.deepEqual(preserveLatinNames({ nomLatin: 'Official', nomFr: 'Official' }, { nomLatin: 'Generated' }), { nomLatin: 'Official', nomFr: 'Official', prenomLatin: '', prenomFr: '' })
  assert.equal(preserveLatinNames({ nomFr: 'Legacy' }, { nomLatin: 'Generated' }).nomLatin, 'Legacy')
  assert.deepEqual(preserveLatinNames({ nomLatin: 'A', nomFr: 'B' }, {}).nomFr, 'B')
  assert.equal(preserveLatinNames(undefined, { nomLatin: 'New' }).nomLatin, 'New')
})
test('New notifications use canonical Latin names, legacy fallback and untouched Arabic', () => {
  const record = { statut: 'absent', classe: '1APIC-3', date: '2026-09-12', seance: 'S1' }
  const legacy = alerts.alertCopy('attendance', record, original, false)
  assert.match(legacy.body, /Amine Alaoui/)
  const canonical = alerts.alertCopy('attendance', record, { ...original, nomLatin: 'Official' }, false)
  assert.match(canonical.body, /Amine Official/)
  assert.match(canonical.bodyAr, /أمين العلوي/)
})
