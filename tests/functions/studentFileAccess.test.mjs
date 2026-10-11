import assert from 'node:assert/strict'
import { test } from 'node:test'
import access from '../../functions/studentFileAccess.js'
const { requireStudentFileAccess, restrictStudentFileGrades } = access
const data = {
  users: { admin: { role: 'admin' }, teacher: { role: 'professeur', classes: ['1APIC-1'], matiere: 'Mathématiques' }, legacy: { role: 'professeur', classe: '1APIC-1' }, other: { role: 'professeur', classes: ['2APIC-1'] }, parent: { role: 'parent' },
    // Personnel administratif : la case « élèves » ouvre le dossier, les autres cases son contenu.
    surveillant: { role: 'staff', droits: ['eleves.voir', 'absences.voir', 'comportements.voir', 'notes.voir'] },
    accueil: { role: 'staff', droits: ['eleves.voir'] },
    sansEleves: { role: 'staff', droits: ['absences.voir', 'notes.voir'] },
    profDroits: { role: 'professeur', classes: ['2APIC-1'], droits: ['eleves.voir', 'notes.voir'] } },
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
test('Staff open any current student with the students right; other rights decide what the file shows', async () => {
  const full = await requireStudentFileAccess(db, request('surveillant'), 'synthetic')
  assert.deepEqual(full.sees, { grades: true, attendance: true, behavior: true })
  const minimal = await requireStudentFileAccess(db, request('accueil'), 'synthetic')
  assert.deepEqual(minimal.sees, { grades: false, attendance: false, behavior: false })
  await assert.rejects(requireStudentFileAccess(db, request('sansEleves'), 'synthetic'), { code: 'permission-denied' })
  // Un champ `droits` sur la fiche d'un professeur ne lui ouvre pas une autre classe.
  await assert.rejects(requireStudentFileAccess(db, request('profDroits'), 'synthetic'), { code: 'not-found' })
  for (const id of ['archived', 'missing']) await assert.rejects(requireStudentFileAccess(db, request('surveillant'), id), { code: 'not-found' })
  // Admin et professeur : rien ne change.
  assert.deepEqual((await requireStudentFileAccess(db, request('admin'), 'synthetic')).sees, { grades: true, attendance: true, behavior: true })
  assert.deepEqual((await requireStudentFileAccess(db, request('teacher'), 'synthetic')).sees, { grades: true, attendance: true, behavior: true })
})
test('Staff never receive the domains their rights do not open, nor homework', async () => {
  const note = { classe: '2APIC-1', matiere: 'Français', note: 18 }
  const cache = { notes: [note], followUpNotes: [note], absences: [{ statut: 'absent' }], devoirs: [{ id: 'd' }], homeworkSubmissions: [{ id: 's' }], eleves: [{ id: 'synthetic' }] }
  const full = restrictStudentFileGrades(cache, await requireStudentFileAccess(db, request('surveillant'), 'synthetic'))
  assert.deepEqual(full.notes, [note], 'toutes les matières, toutes les classes')
  assert.deepEqual(full.absences, cache.absences)
  assert.deepEqual([full.devoirs, full.homeworkSubmissions], [[], []])
  const minimal = restrictStudentFileGrades(cache, await requireStudentFileAccess(db, request('accueil'), 'synthetic'))
  assert.deepEqual([minimal.notes, minimal.followUpNotes, minimal.absences, minimal.devoirs, minimal.homeworkSubmissions], [[], [], [], [], []])
  assert.deepEqual(minimal.eleves, cache.eleves)
})
