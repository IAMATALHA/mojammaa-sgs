async function cancelComportement(db, uid, input, now = new Date()) {
  const fail = code => { throw Object.assign(new Error(code), { code }) }
  if (!uid) fail('unauthenticated')
  if (typeof input?.id !== 'string' || !input.id || input.id.includes('/') || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 300) fail('invalid-argument')
  const ref = db.collection('comportements').doc(input.id)
  return db.runTransaction(async tx => {
    const [user, record] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref)])
    if (!record.exists) fail('not-found')
    const child = await tx.get(db.doc(`eleves/${record.get('eleveId')}`))
    if (user.get('role') !== 'admin' && (user.get('role') !== 'professeur' || record.get('teacherId') !== uid
      || ![...(user.get('classes') || []), user.get('classe')].includes(child.get('classe')))) fail('permission-denied')
    if (record.get('cancelledAt')) return { cancelled: true, replayed: true }
    tx.update(ref, { cancelledAt: now, cancelledBy: uid, cancelReason: input.reason.trim() })
    return { cancelled: true, replayed: false }
  })
}
module.exports = { cancelComportement }
