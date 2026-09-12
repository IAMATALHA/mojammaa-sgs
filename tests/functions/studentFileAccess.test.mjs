import assert from 'node:assert/strict'
import { test } from 'node:test'
import access from '../../functions/studentFileAccess.js'
const { requireStudentFileAccess, restrictStudentFileGrades } = access
const data = {
  users: { admin: { role: 'admin' }, teacher: { role: 'professeur', classes: ['1APIC-1'], matiere: 'Mathématiques' }, legacy: { role: 'professeur', classe: '1APIC-1' }, other: { role: 'professeur', classes: ['2APIC-1'] }, parent: { role: 'parent' } },
  eleves: { synthetic: { classe: '1APIC-1' }, archived: { classe: '1APIC-1', active: false } },
}
const db = { collection: name => ({ doc: id => ({ get: async () => ({ exists: !!data[name][id], get: field => data[name][id]?.[field] }) }) }) }
const request = uid => ({ auth: { uid } })
test('Admin and assigned teacher can read a current student; legacy class assignment also works', async () => {
  for (const uid of ['admin', 'teacher', 'legacy']) assert.equal((await requireStudentFileAccess(db, request(uid), 'synthetic')).uid, uid)
})
test('Other teachers, parents, anonymous and archived/missing students are refused', async () => {
  await assert.rejects(requireStudentFileAccess(db, request('other'), 'synthetic'), { code: 'not-found' })
  for (const uid of ['parent', 'missing']) await assert.rejects(requireStudentFileAccess(db, request(uid), 'synthetic'), { code: 'permission-denied' })
  await assert.rejects(requireStudentFileAccess(db, {}, 'synthetic'), { code: 'unauthenticated' })
  for (const id of ['archived', 'missing']) await assert.rejects(requireStudentFileAccess(db, request('teacher'), id), { code: 'not-found' })
})
test('Teachers never receive notes or follow-up averages from other subjects/classes', async () => {
  const own = { classe: '1APIC-1', matiere: 'Mathématiques', note: 12 }
  const secret = { classe: '1APIC-1', matiere: 'Français', note: 18 }
  const other = { classe: '2APIC-1', matiere: 'Mathématiques', note: 20 }
  const cache = { notes: [own, secret, other], followUpNotes: [own, secret, other], absences: [{ statut: 'absent' }] }
  const teacher = await requireStudentFileAccess(db, request('teacher'), 'synthetic')
  const filtered = restrictStudentFileGrades(cache, teacher)
  assert.deepEqual(filtered.notes, [own])
  assert.deepEqual(filtered.followUpNotes, [own])
  assert.deepEqual(filtered.absences, cache.absences)
  const legacy = await requireStudentFileAccess(db, request('legacy'), 'synthetic')
  assert.deepEqual(restrictStudentFileGrades(cache, legacy).notes, [])
  assert.equal(restrictStudentFileGrades(cache, { role: 'admin' }), cache)
})
