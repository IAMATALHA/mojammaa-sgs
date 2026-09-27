import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const admin = require('../../functions/node_modules/firebase-admin')
const { manageHomework, validateChanges } = require('../../functions/homeworkManagement')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required')
admin.initializeApp({ projectId: 'demo-mojammaa-rules' })
const db = admin.firestore()
const base = { titre: 'Test', description: 'Consigne', type: 'Maison', dateLimite: '2026-10-01', attachments: [] }
const seed = async id => db.doc(`devoirs/${id}`).set({ ...base, teacherId: 'hmTeacher', classeId: 'TEST', academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10' })
await Promise.all([
  db.doc('users/hmTeacher').set({ role: 'professeur', classes: ['TEST'], prenom: 'Prof', nom: 'Test', matiere: 'Mathématiques' }),
  db.doc('users/hmOther').set({ role: 'professeur' }),
  db.doc('users/hmAdmin').set({ role: 'admin' }),
  db.doc('users/hmParent').set({ role: 'parent' }),
  // Destinataires : parents des élèves ACTIFS de la classe (dédoublonnés).
  db.doc('eleves/hmChildA').set({ classe: 'TEST', parentUid: 'hmParent' }),
  db.doc('eleves/hmChildB').set({ classe: 'TEST', parentUid: 'hmParent', active: true }),
  db.doc('eleves/hmChildC').set({ classe: 'TEST', parentUid: 'hmParent2' }),
  db.doc('eleves/hmGone').set({ classe: 'TEST', parentUid: 'hmFormerParent', active: false }),
  db.doc('eleves/hmOrphan').set({ classe: 'TEST' }),
])
const recipients = async id => (await db.doc(`messages/${id}`).get()).data()
let count = 0
const test = async (name, fn) => { await fn(); count++; console.log(`✓ ${name}`) }
const edit = (id, commandId, changes = base, extra = {}) => ({ id, commandId, action: 'edit', version: 0, changes, ...extra })
await seed('hmEdit')
await test('Owner edits; duplicate commands send exactly one notification', async () => {
  const input = edit('hmEdit', 'hmEditCmd', { ...base, dateLimite: '2027-02-10' })
  await Promise.all([manageHomework(db, 'hmTeacher', input), manageHomework(db, 'hmTeacher', input)])
  const saved = await db.doc('devoirs/hmEdit').get()
  assert.equal(saved.get('monthKey'), '2027-02'); assert.equal(saved.get('semestre'), 'S2')
  assert.equal(saved.get('teacherId'), 'hmTeacher'); assert.equal(saved.get('classeId'), 'TEST')
  assert.equal((await db.collection('messages').where('fromId', '==', 'hmTeacher').get()).size, 1)
  // Régression prod (24/09) : toType 'class' n'atteignait aucun parent (no_recipient).
  const sent = await recipients('homework_hmTeacher_hmEditCmd')
  assert.equal(sent.toType, 'user')
  assert.deepEqual([...sent.toIds].sort(), ['hmParent', 'hmParent2'])
  assert.equal(sent.classe, 'TEST')
})
await test('Colleague, parent and anonymous writes are refused', async () => {
  for (const uid of ['hmOther', 'hmParent', null]) {
    await assert.rejects(manageHomework(db, uid, edit('hmEdit', `denied-${uid}`)), e => ['permission-denied', 'unauthenticated'].includes(e.code))
  }
})
await test('Stale edit is refused without overwriting newer work', async () => {
  await assert.rejects(manageHomework(db, 'hmTeacher', edit('hmEdit', 'stale')), { code: 'failed-precondition' })
})
await test('Admin edits another teacher’s homework; text corrections may be silent', async () => {
  await seed('hmSilent')
  await manageHomework(db, 'hmAdmin', edit('hmSilent', 'silent', { ...base, titre: 'Corrected' }, { notify: false }))
  assert.equal((await db.doc('messages/homework_hmAdmin_silent').get()).exists, false)
})
await test('Due date changes always notify even when silent was requested', async () => {
  await seed('hmDate')
  await manageHomework(db, 'hmTeacher', edit('hmDate', 'date', { ...base, dateLimite: '2026-10-02' }, { notify: false }))
  assert.equal((await db.doc('messages/homework_hmTeacher_date').get()).exists, true)
})
await test('Deletion removes homework without submissions and is replay-safe', async () => {
  await seed('hmDelete')
  const input = { id: 'hmDelete', commandId: 'delete', action: 'remove', version: 0 }
  assert.equal((await manageHomework(db, 'hmTeacher', input)).status, 'deleted')
  assert.equal((await db.doc('devoirs/hmDelete').get()).exists, false)
  assert.equal((await manageHomework(db, 'hmTeacher', input)).status, 'deleted')
})
await test('Existing submissions are preserved by cancellation; further edits blocked', async () => {
  await seed('hmCancel')
  await db.doc('homeworkSubmissions/hmCancel_child').set({ homeworkId: 'hmCancel', status: 'submitted' })
  assert.equal((await manageHomework(db, 'hmTeacher', { id: 'hmCancel', commandId: 'cancel', action: 'remove', version: 0 })).status, 'cancelled')
  assert.ok((await db.doc('devoirs/hmCancel').get()).get('cancelledAt'))
  assert.equal((await db.doc('homeworkSubmissions/hmCancel_child').get()).get('status'), 'submitted')
  await assert.rejects(manageHomework(db, 'hmTeacher', edit('hmCancel', 'after-cancel')), { code: 'failed-precondition' })
})
const storageUrl = path => `https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/${path}?alt=media&token=t`
await test('Invalid dates, blank titles and unsafe attachments rejected', async () => {
  const file = { url: storageUrl('devoirs%2FhmTeacher%2F1_consigne.pdf'), name: 'consigne.pdf', mime: 'application/pdf' }
  for (const changes of [{ dateLimite: '2026-02-30' }, { titre: ' ' },
    ...[{ url: 'javascript:alert(1)' }, { url: 'https://evil.example/consigne.pdf' },
      { url: storageUrl('notes-imports%2Fx.xlsx') }, { url: file.url.replace('mojammaa-sgs.firebasestorage.app', 'other.appspot.com') },
      // Traversées qui, une fois l'URL normalisée, sortent du bucket.
      { url: storageUrl('devoirs%2F../../../../../b/attacker/o/phish.html') }, { url: storageUrl('devoirs%2F..%5C..%5Cx').replace('%5C', '\\') },
      { url: storageUrl('devoirs%2F..%2Fnotes-imports%2Fx') }, { url: storageUrl('devoirs%2F%2E%2E%2Fx') }, { url: storageUrl('devoirs%2Fx#frag') },
      { name: 'x'.repeat(201) }, { size: 26 * 1024 * 1024 }].map(bad => ({ attachments: [{ ...file, ...bad }] }))]) {
    assert.throws(() => validateChanges({ ...base, ...changes }), { code: 'invalid-argument' })
  }
  assert.equal(validateChanges({ ...base, attachments: [{ ...file, size: 4 * 1024 * 1024 }] }).attachments.length, 1)
})
await test('Fractional web-SDK versions match; non-numeric versions are refused', async () => {
  await seed('hmFraction')
  await db.doc('devoirs/hmFraction').update({ updatedAt: new admin.firestore.Timestamp(1790000000, 123456789) })
  const version = 1790000000 * 1000 + 123456789 / 1e6 // Timestamp.toMillis() du SDK web, non arrondi
  assert.equal((await manageHomework(db, 'hmTeacher', edit('hmFraction', 'fraction', { ...base, titre: 'Fraction' }, { version }))).status, 'updated')
  await assert.rejects(manageHomework(db, 'hmTeacher', edit('hmFraction', 'nan', base, { version: 'abc' })), { code: 'invalid-argument' })
})
const create = (id, commandId, extra = {}) => ({ id, commandId, action: 'create', classeId: 'TEST', changes: { ...base, titre: 'Nouveau' }, ...extra })
await test('Teacher creates in own class; parents notified in three languages; replay-safe', async () => {
  const input = create('hmNew', 'createCmd')
  const [first, second] = await Promise.all([manageHomework(db, 'hmTeacher', input), manageHomework(db, 'hmTeacher', input)])
  assert.deepEqual(first, { status: 'created', id: 'hmNew' }); assert.deepEqual(second, first)
  const saved = (await db.doc('devoirs/hmNew').get()).data()
  assert.equal(saved.teacherId, 'hmTeacher'); assert.equal(saved.teacherNom, 'Prof Test'); assert.equal(saved.classeId, 'TEST')
  assert.equal(saved.academicYear, '2026-2027'); assert.equal(saved.createdVia, 'manageHomework'); assert.equal(saved.updatedAt, undefined)
  const sent = await recipients('homework_hmTeacher_createCmd')
  assert.equal(sent.toType, 'user'); assert.deepEqual([...sent.toIds].sort(), ['hmParent', 'hmParent2'])
  assert.equal(sent.subject, '📚 Nouveau devoir · Mathématiques'); assert.ok(sent.subjectAr && sent.bodyEn.includes('Nouveau'))
  // Le devoir créé s'édite ensuite avec la version 0 (jamais modifié).
  assert.equal((await manageHomework(db, 'hmTeacher', edit('hmNew', 'editNew', { ...base, titre: 'Nouveau 2' }))).status, 'updated')
})
await test('Creation refused outside own classes, for parents, on existing ids and bad classes', async () => {
  await assert.rejects(manageHomework(db, 'hmOther', create('hmForeign', 'foreign')), { code: 'permission-denied' })
  await assert.rejects(manageHomework(db, 'hmParent', create('hmByParent', 'byParent')), { code: 'permission-denied' })
  await assert.rejects(manageHomework(db, null, create('hmAnon', 'anon')), { code: 'unauthenticated' })
  await assert.rejects(manageHomework(db, 'hmTeacher', create('hmEdit', 'overwrite')), { code: 'already-exists' })
  for (const classeId of ['', ' TEST', 'A/B', 'x'.repeat(61), 42]) {
    await assert.rejects(manageHomework(db, 'hmTeacher', create('hmBadClass', `bad-${String(classeId).length}`, { classeId })), { code: 'invalid-argument' })
  }
  await assert.rejects(manageHomework(db, 'hmTeacher', create('hmBadUrl', 'badUrl', { changes: { ...base, attachments: [{ url: 'https://evil.example/x.pdf', name: 'x', mime: 'application/pdf' }] } })), { code: 'invalid-argument' })
  assert.equal((await db.doc('devoirs/hmForeign').get()).exists, false)
})
await test('Admin may create for any class; no message when the class has no parent', async () => {
  assert.equal((await manageHomework(db, 'hmAdmin', create('hmAdminNew', 'adminNew', { classeId: 'EMPTY' }))).status, 'created')
  assert.equal((await db.doc('messages/homework_hmAdmin_adminNew').get()).exists, false)
})
console.log(`${count} homework management checks passed`)
await admin.app().delete()
