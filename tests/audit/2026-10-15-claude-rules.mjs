// Contre-audit (Claude) du 15/10 : reproductions de défauts NON listés par Codex.
// Après correction : ces scénarios vérifient que les défauts sont FERMÉS.
// Émulateur local uniquement ; toutes les données sont fictives.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, setLogLevel } from 'firebase/firestore'
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Local emulator required')
setLogLevel('silent')
const env = await initializeTestEnvironment({ projectId: 'demo-mojammaa-claude-20261015', firestore: {
  rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
} })
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [key, value] of Object.entries({
      'users/teacher': { role: 'professeur', classes: ['TEST'], classe: 'TEST' },
      'users/otherTeacher': { role: 'professeur', classes: ['OTHER'], classe: 'OTHER' },
      'users/accomplice': { role: 'parent' },
      'users/family': { role: 'parent' },
      'users/admin': { role: 'admin' },
      'eleves/child': { parentUid: 'family', classe: 'TEST', active: true },
    })) await setDoc(doc(db, key), value)
  })
  const dbFor = uid => env.authenticatedContext(uid).firestore()

  // C01 — la création d'élève par un professeur ne verrouille pas parentUid
  // (seule la mise à jour l'est). Contrôle : la même pose en update est refusée.
  await assertFails(updateDoc(doc(dbFor('teacher'), 'eleves/child'), { parentUid: 'accomplice' }))
  await assertFails(setDoc(doc(dbFor('teacher'), 'eleves/fake1'), { classe: 'TEST', nom: 'X', prenom: 'Y', parentUid: 'accomplice', active: true }))
  await assertFails(setDoc(doc(dbFor('teacher'), 'eleves/fake2'), { classe: 'TEST', nom: 'X', prenom: 'Z', parentUid: 'teacher', active: true }))
  await assertSucceeds(setDoc(doc(dbFor('teacher'), 'eleves/fake3'), { classe: 'TEST', nom: 'X', prenom: 'W', active: true }))
  console.log('C01 FIXED: teacher can no longer link a created student to any account')

  // C03 — déclaration d'absence : la classe n'est pas vérifiée contre l'élève.
  await assertFails(setDoc(doc(dbFor('family'), 'absenceRequests/wrongClass'), {
    eleveId: 'child', parentUid: 'family', classe: 'OTHER', date: 'not-a-date',
    reason: 'x'.repeat(50000), status: 'pending', decidedBy: 'admin', createdAt: serverTimestamp(),
  }))
  await assertSucceeds(setDoc(doc(dbFor('family'), 'absenceRequests/rightClass'), {
    eleveId: 'child', parentUid: 'family', classe: 'TEST', date: '2026-10-16',
    reason: 'maladie', status: 'pending', createdAt: serverTimestamp(),
  }))
  await assertFails(getDoc(doc(dbFor('otherTeacher'), 'absenceRequests/rightClass')))
  await assertSucceeds(getDoc(doc(dbFor('teacher'), 'absenceRequests/rightClass')))
  console.log('C03 FIXED: declaration must carry the child real class, a valid date and a bounded reason')

  // C05 — journal de suivi : un professeur écrit pour une classe qu'il n'enseigne pas.
  await assertFails(setDoc(doc(dbFor('teacher'), 'suivis/forged'), { createdBy: 'teacher', classe: 'OTHER', eleveId: 'someone', note: 'forged' }))
  await assertSucceeds(setDoc(doc(dbFor('teacher'), 'suivis/ok'), { createdBy: 'teacher', classe: 'TEST', eleveId: 'child', note: 'ok' }))
  console.log('C05 FIXED: teacher writes follow-up entries only for students of their classes')

  assert.ok(true)
} finally { await env.cleanup() }
