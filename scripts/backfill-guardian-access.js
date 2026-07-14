/**
 * Rebuilds `guardianAccess/{uid}` from `eleves.parentUid` without printing
 * student, guardian, or class identifiers.
 *
 * Dry run: node scripts/backfill-guardian-access.js
 * Commit:  node scripts/backfill-guardian-access.js --commit
 */

const path = require('path')
const fs = require('fs')

async function main() {
  const commit = process.argv.includes('--commit')
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Clé Firebase Admin introuvable : ${keyPath}`)
  }

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  const [elevesSnap, existingSnap] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('guardianAccess').get(),
  ])

  const grouped = new Map()
  elevesSnap.forEach((snap) => {
    const data = snap.data()
    const uid = typeof data.parentUid === 'string' ? data.parentUid.trim() : ''
    if (!uid) return
    const current = grouped.get(uid) || { childIds: [], classes: new Set() }
    current.childIds.push(snap.id)
    if (typeof data.classe === 'string' && data.classe.trim()) {
      current.classes.add(data.classe.trim())
    }
    grouped.set(uid, current)
  })

  const desiredUids = new Set(grouped.keys())
  const stale = existingSnap.docs.filter((snap) => !desiredUids.has(snap.id))
  const sameStrings = (left, right) => (
    Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index])
  )
  const upserts = []
  grouped.forEach((value, uid) => {
    const childIds = [...value.childIds].sort()
    const classes = [...value.classes].sort()
    const existing = existingSnap.docs.find((snap) => snap.id === uid)?.data()
    if (
      existing?.uid === uid
      && sameStrings(existing.childIds, childIds)
      && sameStrings(existing.classes, classes)
    ) return
    upserts.push({ uid, childIds, classes })
  })
  console.log(JSON.stringify({
    mode: commit ? 'commit' : 'dry-run',
    linkedGuardians: grouped.size,
    existingAccessDocs: existingSnap.size,
    upserts: upserts.length,
    deletes: stale.length,
  }))

  if (!commit) return

  const writes = []
  upserts.forEach(({ uid, childIds, classes }) => {
    writes.push({
      type: 'set',
      ref: db.collection('guardianAccess').doc(uid),
      data: {
        uid,
        childIds,
        classes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    })
  })
  stale.forEach((snap) => writes.push({ type: 'delete', ref: snap.ref }))

  for (let offset = 0; offset < writes.length; offset += 450) {
    const batch = db.batch()
    writes.slice(offset, offset + 450).forEach((write) => {
      if (write.type === 'delete') batch.delete(write.ref)
      else batch.set(write.ref, write.data)
    })
    await batch.commit()
  }
  console.log(JSON.stringify({ committed: writes.length }))
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
