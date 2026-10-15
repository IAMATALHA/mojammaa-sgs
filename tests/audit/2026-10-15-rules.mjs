// Audit 2026-10-15 — ces scénarios reproduisaient les défauts ; ils vérifient désormais les règles CORRIGÉES.
// Run only against the Firestore emulator; all fixtures are synthetic.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, arrayUnion, setLogLevel } from 'firebase/firestore'
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Local emulator required')
setLogLevel('silent')
const env = await initializeTestEnvironment({ projectId: 'demo-mojammaa-audit-20261015', firestore: {
  rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
} })
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [key, value] of Object.entries({
      'users/teacher': { role: 'professeur', classes: ['TEST'], classe: 'TEST' },
      'users/outsider': { role: 'parent' },
      'users/staff': { role: 'staff', droits: ['rendezvous'] },
      'users/admin': { role: 'admin' },
      'eleves/child': { parentUid: 'family', classe: 'TEST', active: true },
      'directory/staff': { teachers: [{ uid: 'teacher', classes: ['TEST'] }], admins: [] },
      'joursScolaires/2099-10-15': { annuleCours: true },
      'ressources/synthetic': { teacherId: 'teacher', classeId: 'TEST', titre: 'Synthetic', viewedBy: [] },
    })) await setDoc(doc(db, key), value)
  })
  const dbFor = uid => env.authenticatedContext(uid).firestore()
  await assertSucceeds(getDoc(doc(dbFor('admin'), 'directory/staff')))
  await assertSucceeds(getDoc(doc(dbFor('staff'), 'directory/staff')))
  console.log('A05 FIXED: rendezvous staff loads the teacher directory')
  await assertFails(getDoc(doc(dbFor('outsider'), 'ressources/synthetic')))
  await assertFails(updateDoc(doc(dbFor('outsider'), 'ressources/synthetic'), { viewedBy: arrayUnion('outsider') }))
  console.log('A06 FIXED: unrelated parent can neither read nor mark the resource viewed')
  const forged = { eleveId: 'child', classe: 'TEST', date: '2099-10-15', seance: 'invented', statut: 'absent', justified: true, professorId: 'someone-else' }
  await assertFails(setDoc(doc(dbFor('outsider'), 'absences/forged'), forged))
  await assertFails(setDoc(doc(dbFor('teacher'), 'absences/forged'), forged))
  assert.equal((await getDoc(doc(dbFor('admin'), 'absences/forged'))).exists(), false)
  console.log('A07 FIXED: direct teacher write refused (future date, cancelled day, self-justification, foreign actor)')
} finally { await env.cleanup() }
