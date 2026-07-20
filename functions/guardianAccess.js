'use strict'

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

/**
 * Rebuilds the materialized guardian entitlement from the authoritative
 * `eleves.parentUid` links. The document contains only the minimum data that
 * Firestore Rules need for class-scoped reads.
 */
async function rebuildGuardianAccess(db, parentUid, FieldValue) {
  const uid = nonEmptyString(parentUid)
  if (!uid) return { active: false, childCount: 0, classCount: 0 }

  const children = await db.collection('eleves').where('parentUid', '==', uid).get()
  const childIds = children.docs.map((snap) => snap.id).sort()
  const classes = [...new Set(
    children.docs
      // Conserver les childIds historiques pour les droits sur les anciennes
      // données, mais ne jamais donner une classe courante via un élève archivé.
      .filter((snap) => snap.get('active') !== false)
      .map((snap) => nonEmptyString(snap.get('classe')))
      .filter(Boolean),
  )].sort()
  const accessRef = db.collection('guardianAccess').doc(uid)

  if (childIds.length === 0) {
    await accessRef.delete()
    return { active: false, childCount: 0, classCount: 0 }
  }

  await accessRef.set({
    uid,
    childIds,
    classes,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { active: true, childCount: childIds.length, classCount: classes.length }
}

function affectedGuardianUids(before, after) {
  const beforeUid = nonEmptyString(before?.parentUid)
  const afterUid = nonEmptyString(after?.parentUid)
  const beforeClass = nonEmptyString(before?.classe)
  const afterClass = nonEmptyString(after?.classe)
  const beforeActive = before?.active !== false
  const afterActive = after?.active !== false

  if (
    beforeUid === afterUid
    && beforeClass === afterClass
    && beforeActive === afterActive
  ) return []
  return [...new Set([beforeUid, afterUid].filter(Boolean))]
}

module.exports = {
  affectedGuardianUids,
  rebuildGuardianAccess,
}
