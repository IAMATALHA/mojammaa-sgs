import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteField, getDoc } from 'firebase/firestore'
import assert from 'node:assert/strict'
const env = await initializeTestEnvironment({ projectId: 'demo-mojammaa-assignments',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } })
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'config/superadmins'), { uids: [] }),
      setDoc(doc(db, 'users/admin'), { role: 'admin' }),
      setDoc(doc(db, 'users/teacher'), { role: 'professeur', classes: ['1APIC-1'], classe: '1APIC-1' }),
      setDoc(doc(db, 'users/parent'), { role: 'parent' }),
    ])
  })
  const teacher = env.authenticatedContext('teacher').firestore()
  const parent = env.authenticatedContext('parent').firestore()
  const admin = env.authenticatedContext('admin').firestore()
  await assertFails(updateDoc(doc(teacher, 'users/teacher'), { classes: ['2APIC-1'] }))
  await assertFails(updateDoc(doc(parent, 'users/teacher'), { classes: ['2APIC-1'] }))
  await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'users/teacher'), { classes: [] }))
  await assertSucceeds(updateDoc(doc(admin, 'users/teacher'), { classes: ['2APIC-1'], classe: deleteField() }))
  const updated = await assertSucceeds(getDoc(doc(teacher, 'users/teacher')))
  assert.deepEqual(updated.get('classes'), ['2APIC-1'])
  assert.equal(updated.get('classe'), undefined)
  assert.equal(updated.get('role'), 'professeur')
  await assertFails(updateDoc(doc(admin, 'users/teacher'), { role: 'admin' }))
  console.log('PASS: admin can assign; teacher/parent/anonymous cannot; legacy class removed; role unchanged')
} finally { await env.cleanup() }
