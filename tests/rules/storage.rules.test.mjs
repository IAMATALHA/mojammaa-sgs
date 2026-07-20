import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-mojammaa-storage',
  firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
  storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8') },
})

await testEnv.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore()
  await Promise.all([
    setDoc(doc(db, 'users/parent1'), { uid: 'parent1', role: 'parent' }),
    setDoc(doc(db, 'users/parent2'), { uid: 'parent2', role: 'parent' }),
    setDoc(doc(db, 'users/prof1'), { uid: 'prof1', role: 'professeur', classes: ['1A'] }),
    setDoc(doc(db, 'users/prof2'), { uid: 'prof2', role: 'professeur', classes: ['2B'] }),
    setDoc(doc(db, 'users/admin1'), { uid: 'admin1', role: 'admin' }),
    setDoc(doc(db, 'eleves/e1'), { classe: '1A', parentUid: 'parent1' }),
    setDoc(doc(db, 'eleves/e2'), { classe: '2B', parentUid: 'parent2' }),
    setDoc(doc(db, 'devoirs/d1'), { classeId: '1A', teacherId: 'prof1' }),
  ])
})

const metadata = {
  contentType: 'image/jpeg',
  customMetadata: { homeworkId: 'd1', eleveId: 'e1', parentUid: 'parent1' },
}
const bytes = new Uint8Array([1, 2, 3])
const proofPath = 'homework-submissions/parent1/proof.jpg'
const storageAs = uid => testEnv.authenticatedContext(uid).storage()

await assertSucceeds(uploadBytes(ref(storageAs('parent1'), proofPath), bytes, metadata))
await assertFails(uploadBytes(
  ref(storageAs('parent2'), 'homework-submissions/parent1/forged.jpg'),
  bytes,
  metadata,
))
await assertFails(uploadBytes(
  ref(storageAs('parent1'), 'homework-submissions/parent1/wrong-child.jpg'),
  bytes,
  {
    ...metadata,
    customMetadata: { homeworkId: 'd1', eleveId: 'e2', parentUid: 'parent1' },
  },
))
await assertSucceeds(getBytes(ref(storageAs('parent1'), proofPath)))
await assertSucceeds(getBytes(ref(storageAs('prof1'), proofPath)))
await assertSucceeds(getBytes(ref(storageAs('admin1'), proofPath)))
await assertFails(getBytes(ref(storageAs('prof2'), proofPath)))
await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), proofPath)))

console.log('storage homework proofs: 4 accès autorisés/refusés validés')
await testEnv.cleanup()
