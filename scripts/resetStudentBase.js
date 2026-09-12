/**
 * Réinitialise les données pédagogiques autour des élèves actuels.
 * Dry-run par défaut ; --commit exige les confirmations numériques affichées.
 */
const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
const value = name => {
  const arg = process.argv.find(a => a.startsWith(`${name}=`))
  return arg ? arg.slice(name.length + 1) : ''
}

const CLEAR_COLLECTIONS = [
  'notes', 'absences', 'comportements', 'devoirs', 'homeworkSubmissions',
  'ressources', 'emploiDuTemps', 'schedules', 'absenceRequests', 'guardianAccess',
  'parentInvitations', 'pushDevices', 'pushTokenOwners',
]

const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
if (!fs.existsSync(keyPath)) throw new Error(`Clé Firebase Admin introuvable : ${keyPath}`)
const serviceAccount = require(keyPath)
if (serviceAccount.project_id !== 'mojammaa-sgs') throw new Error('Projet Firebase inattendu')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
const db = admin.firestore()
const auth = admin.auth()

async function deleteRefs(refs) {
  let done = 0
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch()
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref))
    if (refs.slice(i, i + 450).length) await batch.commit()
    done += Math.min(450, refs.length - i)
  }
  return done
}

async function main() {
  const studentsSnap = await db.collection('eleves').get()
  const current = studentsSnap.docs.filter(d => d.data().active !== false)
  const old = studentsSnap.docs.filter(d => d.data().active === false)
  const parentUsersSnap = await db.collection('users').where('role', '==', 'parent').get()
  const parentUids = parentUsersSnap.docs.map(d => d.id)

  const authParentUids = []
  let token
  do {
    const page = await auth.listUsers(1000, token)
    page.users.forEach(u => { if (parentUids.includes(u.uid)) authParentUids.push(u.uid) })
    token = page.pageToken
  } while (token)

  const collectionCounts = {}
  for (const name of CLEAR_COLLECTIONS) collectionCounts[name] = (await db.collection(name).get()).size

  console.log(JSON.stringify({
    currentStudents: current.length,
    oldStudents: old.length,
    parentProfiles: parentUsersSnap.size,
    parentAuthAccounts: authParentUids.length,
    clearCollections: collectionCounts,
    teacherSchedules: collectionCounts.emploiDuTemps,
  }, null, 2))

  if (!COMMIT) {
    console.log('\nDry-run : aucune écriture.')
    console.log(`Confirmation attendue : --confirm-current=${current.length} --confirm-old=${old.length} --confirm-parents=${parentUsersSnap.size}`)
    return
  }

  if (value('--confirm-current') !== String(current.length)) throw new Error('Confirmation élèves actuels invalide')
  if (value('--confirm-old') !== String(old.length)) throw new Error('Confirmation anciens élèves invalide')
  if (value('--confirm-parents') !== String(parentUsersSnap.size)) throw new Error('Confirmation parents invalide')

  // Supprime les données pédagogiques et les emplois du temps.
  for (const name of CLEAR_COLLECTIONS) {
    const snap = await db.collection(name).get()
    const count = await deleteRefs(snap.docs.map(d => d.ref))
    console.log(`✓ ${name}: ${count} supprimé(s)`)
  }

  // Supprime les anciens élèves et retire les liens parents des élèves actuels.
  const oldDeleted = await deleteRefs(old.map(d => d.ref))
  for (let i = 0; i < current.length; i += 450) {
    const batch = db.batch()
    current.slice(i, i + 450).forEach(d => batch.update(d.ref, {
      parentUid: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }))
    if (current.slice(i, i + 450).length) await batch.commit()
  }
  console.log(`✓ eleves anciens: ${oldDeleted} supprimé(s), ${current.length} conservé(s)`)

  const parentDocsDeleted = await deleteRefs(parentUsersSnap.docs.map(d => d.ref))
  console.log(`✓ profils parents: ${parentDocsDeleted} supprimé(s)`)
  for (let i = 0; i < authParentUids.length; i += 1000) {
    const result = await auth.deleteUsers(authParentUids.slice(i, i + 1000))
    if (result.failureCount) throw new Error(`Échecs suppression Auth parents : ${result.failureCount}`)
  }
  console.log(`✓ comptes Auth parents: ${authParentUids.length} supprimé(s)`)
  console.log('\n✅ Réinitialisation terminée.')
}

main().catch(error => { console.error(`❌ ${error.message || error}`); process.exit(1) })
