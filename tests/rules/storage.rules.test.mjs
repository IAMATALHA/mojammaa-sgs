import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage'

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

// ── Audit 2026-09-28, F3 : supports pédagogiques (devoirs/, ressources/) ──
const pdf = { contentType: 'application/pdf' }
const homeworkFile = 'devoirs/prof1/1759000000000_consigne.pdf'
const resourceFile = 'ressources/prof1/1759000000000_cours.pdf'
await assertSucceeds(uploadBytes(ref(storageAs('prof1'), homeworkFile), bytes, pdf))
await assertSucceeds(uploadBytes(ref(storageAs('prof1'), resourceFile), bytes, pdf))
await assertFails(uploadBytes(ref(storageAs('parent1'), 'devoirs/parent1/x.pdf'), bytes, pdf))
await assertFails(uploadBytes(ref(storageAs('parent1'), 'ressources/parent1/x.pdf'), bytes, pdf))
await assertSucceeds(uploadBytes(ref(storageAs('admin1'), 'devoirs/admin1/x.pdf'), bytes, pdf))
for (const path of [homeworkFile, resourceFile]) {
  await assertSucceeds(getBytes(ref(storageAs('prof1'), path)))
  await assertSucceeds(getBytes(ref(storageAs('admin1'), path)))
  await assertFails(getBytes(ref(storageAs('prof2'), path)))   // collègue exclu (cas de l'audit)
  await assertFails(getBytes(ref(storageAs('parent2'), path)))
  await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)))
}
await assertSucceeds(listAll(ref(storageAs('prof1'), 'devoirs/prof1')))
await assertSucceeds(listAll(ref(storageAs('admin1'), 'devoirs/prof1')))
await assertFails(listAll(ref(storageAs('parent2'), 'devoirs/prof1')))   // cas de l'audit
await assertFails(listAll(ref(storageAs('prof2'), 'devoirs/prof1')))
await assertFails(listAll(ref(storageAs('parent2'), 'ressources/prof1')))

// ── Audit 2026-09-28, F8 : un parent détaché perd l'accès à ses preuves ──
await testEnv.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'eleves/e1'), { classe: '1A', parentUid: 'parent2' })
})
await assertFails(getBytes(ref(storageAs('parent1'), proofPath)))
await assertSucceeds(getBytes(ref(storageAs('prof1'), proofPath)))
await assertSucceeds(getBytes(ref(storageAs('admin1'), proofPath)))
await assertFails(getBytes(ref(storageAs('parent2'), proofPath)))   // le nouveau parent non plus

// ── Contre-audit 2026-10-15 : C06 à C09 ──
// C09 : pas de page HTML déposée comme pièce jointe ou preuve.
await assertFails(uploadBytes(ref(storageAs('parent1'), 'homework-submissions/parent1/page.html'), bytes,
  { ...metadata, contentType: 'text/html' }))
await assertFails(uploadBytes(ref(storageAs('prof1'), 'ressources/prof1/page.html'), bytes, { contentType: 'text/html' }))
await assertSucceeds(uploadBytes(ref(storageAs('prof1'), 'ressources/prof1/notes.csv'), bytes, { contentType: 'text/csv' }))
// C06 : imports de notes réservés aux enseignants et à l'administration.
const xlsx = { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
await assertFails(uploadBytes(ref(storageAs('parent1'), 'notes-imports/parent1/x.xlsx'), bytes, xlsx))
await assertSucceeds(uploadBytes(ref(storageAs('prof1'), 'notes-imports/prof1/x.xlsx'), bytes, xlsx))
// C07 : affiche d'annonce = image ou PDF borné(e).
await assertSucceeds(uploadBytes(ref(storageAs('admin1'), 'annonces/admin1/a.jpg'), bytes, { contentType: 'image/jpeg' }))
await assertFails(uploadBytes(ref(storageAs('admin1'), 'annonces/admin1/a.zip'), bytes, { contentType: 'application/zip' }))
await assertFails(uploadBytes(ref(storageAs('admin1'), 'annonces/admin1/big.jpg'), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }))
// C08 : le propriétaire (ou l'administration) peut effacer ses fichiers ; personne d'autre.
await assertFails(deleteObject(ref(storageAs('prof2'), resourceFile)))
await assertSucceeds(deleteObject(ref(storageAs('prof1'), resourceFile)))
await assertSucceeds(deleteObject(ref(storageAs('admin1'), homeworkFile)))

console.log('storage homework proofs + audit 2026-09-28 (F3, F8): accès autorisés/refusés validés')
await testEnv.cleanup()
