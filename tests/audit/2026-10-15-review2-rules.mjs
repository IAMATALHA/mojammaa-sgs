// Seconde revue sur df7332c. La réussite vérifie désormais les CORRECTIFS
// (R01 : écoute par requête ; R03 : édition réservée au rôle professeur). Données entièrement fictives, émulateur obligatoire.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, setLogLevel } from 'firebase/firestore'

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Local Firestore emulator required')
}
setLogLevel('silent')
const env = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-review2',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
})
const dbFor = uid => env.authenticatedContext(uid).firestore()
const seed = entries => env.withSecurityRulesDisabled(async context => {
  for (const [path, value] of Object.entries(entries)) await setDoc(doc(context.firestore(), path), value)
})
const decision = (homeworkId, eleveId, parentUid) => ({
  homeworkId, eleveId, classeId: 'TEST', parentUid, teacherId: 'teacher',
  status: 'not_done', attachments: [], parentComment: '', teacherComment: 'Synthetic remark',
  reviewedByUid: 'teacher', reviewedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})
const proof = (homeworkId, eleveId, parentUid) => ({
  homeworkId, eleveId, classeId: 'TEST', parentUid, teacherId: 'teacher', status: 'submitted',
  attachments: [{ url: `https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/homework-submissions%2F${parentUid}%2Fsynthetic.jpg?alt=media`, name: 'synthetic.jpg', mime: 'image/jpeg' }],
  parentComment: '', submittedByUid: parentUid, submittedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})
try {
  await seed({
    'users/teacher': { role: 'professeur', classes: ['TEST'] },
    'users/parent': { role: 'parent' },
    'users/outsider': { role: 'parent' },
    'users/former-teacher': { role: 'parent' },
    'users/admin': { role: 'admin' },
    'eleves/child': { classe: 'TEST', parentUid: 'parent' },
    'eleves/new-family': { classe: 'TEST', parentUid: '' },
    'devoirs/first': { classeId: 'TEST', teacherId: 'teacher' },
    'devoirs/before-activation': { classeId: 'TEST', teacherId: 'teacher' },
    'ressources/revoked': { teacherId: 'former-teacher', classeId: 'TEST', titre: 'Synthetic', viewedBy: [] },
    'ressources/active': { teacherId: 'teacher', classeId: 'TEST', titre: 'Synthetic', viewedBy: [] },
  })

  // R01 corrigé : requête bornée (parent, enfant, devoir) comme dans
  // subscribeHomeworkSubmission → zéro résultat, puis le rendu sans réouverture.
  let latest = []
  let listenerError
  let unsubscribe
  const firstQuery = query(collection(dbFor('parent'), 'homeworkSubmissions'),
    where('parentUid', '==', 'parent'), where('eleveId', '==', 'child'), where('homeworkId', '==', 'first'))
  await new Promise(resolve => {
    unsubscribe = onSnapshot(firstQuery, snap => { latest = snap.docs.map(d => d.id); resolve() },
      error => { listenerError = error.code; resolve() })
  })
  assert.equal(listenerError, undefined)
  assert.deepEqual(latest, [])
  await assertSucceeds(setDoc(doc(dbFor('parent'), 'homeworkSubmissions/first_child'), proof('first', 'child', 'parent')))
  for (let i = 0; i < 20 && latest.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepEqual(latest, ['first_child'], 'the listener receives the first submission')
  assert.equal(listenerError, undefined)
  await assertFails(getDocs(query(collection(dbFor('outsider'), 'homeworkSubmissions'),
    where('parentUid', '==', 'parent'), where('eleveId', '==', 'child'), where('homeworkId', '==', 'first'))))
  unsubscribe()
  console.log('R01 FIXED: scoped query starts empty, then delivers the first submission; outsider still refused')

  // R02: condition isolée, NON RETENUE comme défaut persistant.
  // Le dépôt voisin possède onHomeworkParentLinked/syncHomeworkParentLinks,
  // absent de cet émulateur de règles, qui répare le parentUid après liaison.
  const oldRef = doc(dbFor('teacher'), 'homeworkSubmissions/before-activation_new-family')
  await assertSucceeds(setDoc(oldRef, decision('before-activation', 'new-family', '')))
  await seed({ 'eleves/new-family': { classe: 'TEST', parentUid: 'parent' } })
  await assertFails(getDoc(doc(dbFor('parent'), 'homeworkSubmissions/before-activation_new-family')))
  const visible = await assertSucceeds(getDocs(query(collection(dbFor('parent'), 'homeworkSubmissions'), where('parentUid', '==', 'parent'), where('eleveId', '==', 'new-family'))))
  assert.equal(visible.size, 0)
  await assertFails(updateDoc(oldRef, { parentUid: 'parent', status: 'graded', reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(dbFor('parent'), 'homeworkSubmissions/before-activation_new-family'), proof('before-activation', 'new-family', 'parent'), { merge: true }))
  console.log('R02 ISOLATED ONLY: stale parentUid blocks reads/writes before the sibling repository sync trigger repairs it; not a standalone finding')

  // R03 corrigé : l'ancien propriétaire devenu parent perd aussi l'édition.
  await assertSucceeds(updateDoc(doc(dbFor('teacher'), 'ressources/active'), { titre: 'Allowed edit' }))
  await assertFails(getDoc(doc(dbFor('former-teacher'), 'ressources/revoked')))
  await assertFails(deleteDoc(doc(dbFor('former-teacher'), 'ressources/revoked')))
  await assertFails(updateDoc(doc(dbFor('outsider'), 'ressources/revoked'), { titre: 'Forbidden edit' }))
  await assertFails(updateDoc(doc(dbFor('former-teacher'), 'ressources/revoked'), { titre: 'Edit after revocation' }))
  assert.equal((await getDoc(doc(dbFor('admin'), 'ressources/revoked'))).get('titre'), 'Synthetic')
  console.log('R03 FIXED: former teacher can no longer read, delete or change the resource')

  // R07 corrigé : subscribeClassStats écoute une requête par égalités. Elle
  // doit être autorisée même quand l'agrégat n'existe pas encore (un document
  // absent terminait l'écoute), et rester refusée hors des classes du parent.
  await seed({ 'guardianAccess/parent': { uid: 'parent', childIds: ['child'], classes: ['TEST'] } })
  const statsQuery = (uid, classe) => query(collection(dbFor(uid), 'classStats'),
    where('classe', '==', classe), where('academicYear', '==', '2026-2027'), where('semestre', '==', 'S1'))
  assert.equal((await assertSucceeds(getDocs(statsQuery('parent', 'TEST')))).size, 0)
  await seed({ 'classStats/2026-2027__TEST__S1': { classe: 'TEST', academicYear: '2026-2027', semestre: 'S1', subjectAvgs: {}, studentAvgs: [] } })
  assert.equal((await assertSucceeds(getDocs(statsQuery('parent', 'TEST')))).size, 1)
  await assertFails(getDocs(statsQuery('outsider', 'TEST')))
  await assertFails(getDocs(statsQuery('parent', 'OTHER')))
  console.log('R07 FIXED: class aggregate query allowed before and after creation, refused outside the family classes')
} finally { await env.cleanup() }
