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
 *
 * The query and the write share ONE transaction (audit 2026-09-28, F4).
 * Triggers are unordered and may be redelivered: as two separate operations,
 * an older invocation could read a link, a newer one could remove it, and the
 * older write then restored the revoked class. Inside a transaction, a child
 * that changes after the read aborts and retries the rebuild, so the stored
 * entitlement always matches the links as of its commit.
 */
async function rebuildGuardianAccess(db, parentUid, FieldValue) {
  const uid = nonEmptyString(parentUid)
  if (!uid) return { active: false, childCount: 0, classCount: 0 }

  const childrenQuery = db.collection('eleves').where('parentUid', '==', uid)
  const accessRef = db.collection('guardianAccess').doc(uid)

  return db.runTransaction(async (tx) => {
    const children = await tx.get(childrenQuery)
    const childIds = children.docs.map((snap) => snap.id).sort()
    const classes = [...new Set(
      children.docs
        // Conserver les childIds historiques pour les droits sur les anciennes
        // données, mais ne jamais donner une classe courante via un élève archivé.
        .filter((snap) => snap.get('active') !== false)
        .map((snap) => nonEmptyString(snap.get('classe')))
        .filter(Boolean),
    )].sort()

    if (childIds.length === 0) {
      tx.delete(accessRef)
      return { active: false, childCount: 0, classCount: 0 }
    }

    tx.set(accessRef, {
      uid,
      childIds,
      classes,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { active: true, childCount: childIds.length, classCount: classes.length }
  })
}

/**
 * Filet de sécurité quotidien (audit 2026-09-28, F4) : un trigger en échec,
 * non rejoué, laissait sinon un droit périmé jusqu'au prochain changement de
 * l'élève. Recalcule chaque responsable connu (liens actuels + documents
 * existants, pour supprimer les droits orphelins).
 */
async function reconcileAllGuardianAccess(db, FieldValue) {
  const [eleves, grants] = await Promise.all([
    db.collection('eleves').select('parentUid').get(),
    db.collection('guardianAccess').select().get(),
  ])
  const uids = new Set(grants.docs.map((snap) => snap.id))
  eleves.docs.forEach((snap) => {
    const uid = nonEmptyString(snap.get('parentUid'))
    if (uid) uids.add(uid)
  })
  const ordered = [...uids].sort()
  let active = 0
  for (let i = 0; i < ordered.length; i += 10) {
    const results = await Promise.all(
      ordered.slice(i, i + 10).map((uid) => rebuildGuardianAccess(db, uid, FieldValue)),
    )
    active += results.filter((result) => result.active).length
  }
  return { guardians: ordered.length, active }
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
  reconcileAllGuardianAccess,
}
