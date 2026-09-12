const { createHash } = require('node:crypto')
const TOKEN_RE = /^(Expo|Exponent)PushToken\[[^\]]+\]$/
const tokenKey = token => createHash('sha256').update(token).digest('hex')
const languageOf = value => /^ar/.test(value || '') ? 'ar' : /^en/.test(value || '') ? 'en' : 'fr'
const error = code => Object.assign(new Error(code), { code })

// Private global installation registry: signing into another account on the
// same phone transfers that installation, without changing other phones.
async function registerPushDevice(db, uid, input) {
  if (!uid) throw error('unauthenticated')
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input?.deviceId || '')
    || !Number.isSafeInteger(input.revision) || input.revision < 1
    || typeof input.enabled !== 'boolean'
    || (input.enabled && !input.token)
    || (input.token !== undefined && (typeof input.token !== 'string' || !TOKEN_RE.test(input.token) || input.token.length > 300))
    || !['ios', 'android', 'web'].includes(input.platform)) throw error('invalid-argument')
  const ref = db.collection('pushDevices').doc(input.deviceId)
  const applied = await db.runTransaction(async tx => {
    const [user, previous] = await Promise.all([tx.get(db.collection('users').doc(uid)), tx.get(ref)])
    if (!user.exists && input.enabled) throw error('permission-denied')
    const old = previous.data()
    if (old && (old.revision || 0) >= input.revision) return false
    if (!input.enabled && old && old.uid !== uid) return false
    const token = input.enabled ? input.token : old?.token || input.token
    if (!token) return false
    const oldOwner = old?.token ? await tx.get(db.collection('pushTokenOwners').doc(tokenKey(old.token))) : null
    const tokenOwner = old?.token === token ? oldOwner : await tx.get(db.collection('pushTokenOwners').doc(tokenKey(token)))
    // Even if the first enable request has not committed yet, persist a
    // disabled installation so its older revision cannot arrive after logout.
    if (oldOwner?.get('deviceId') === input.deviceId && old.token !== token) {
      tx.set(oldOwner.ref, { enabled: false, updatedAt: new Date() }, { merge: true })
    }
    const data = { uid, deviceId: input.deviceId, token, enabled: input.enabled, revision: input.revision,
      language: languageOf(input.language), platform: input.platform, updatedAt: new Date() }
    tx.set(ref, data)
    if (input.enabled || !tokenOwner?.exists || (tokenOwner.get('uid') === uid && tokenOwner.get('deviceId') === input.deviceId)) {
      tx.set(db.collection('pushTokenOwners').doc(tokenKey(token)), {
        uid, deviceId: input.deviceId, enabled: input.enabled, updatedAt: new Date(),
      })
    }
    // Only clear the legacy token when it is THIS installation's token.
    if (!input.enabled && user.get('expoPushToken') === token) {
      tx.update(user.ref, { expoPushToken: null })
    }
    return true
  })
  return { enabled: input.enabled, applied }
}

async function getPushTargets(db, uids) {
  const targets = []
  const seen = new Set()
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30)
    const [devices, users] = await Promise.all([
      db.collection('pushDevices').where('uid', 'in', chunk).get(),
      db.getAll(...chunk.map(uid => db.collection('users').doc(uid))),
    ])
    const existingUsers = new Set(users.filter(user => user.exists).map(user => user.id))
    const candidates = devices.docs.filter(d => d.get('enabled') && existingUsers.has(d.get('uid'))).map(d => ({ ...d.data(), deviceId: d.id }))
    for (const user of users) {
      const token = user.get('expoPushToken')
      if (TOKEN_RE.test(token || '')) candidates.push({ uid: user.id, token, language: languageOf(user.get('notificationLanguage')) })
    }
    const owners = candidates.length ? await db.getAll(...candidates.map(t => db.collection('pushTokenOwners').doc(tokenKey(t.token)))) : []
    candidates.forEach((target, index) => {
      const owner = owners[index]
      if (!TOKEN_RE.test(target.token) || seen.has(target.token)) return
      if (owner.exists && (!owner.get('enabled') || owner.get('uid') !== target.uid
        || (target.deviceId && owner.get('deviceId') !== target.deviceId))) return
      seen.add(target.token)
      targets.push({ uid: target.uid, token: target.token, language: languageOf(target.language), ...(target.deviceId ? { deviceId: target.deviceId } : {}) })
    })
  }
  return targets
}

async function invalidatePushTarget(db, target) {
  if (target.deviceId) {
    const ref = db.collection('pushDevices').doc(target.deviceId)
    const ownerRef = db.collection('pushTokenOwners').doc(tokenKey(target.token))
    await db.runTransaction(async tx => {
      const [device, owner] = await Promise.all([tx.get(ref), tx.get(ownerRef)])
      if (device.get('uid') === target.uid && device.get('token') === target.token) tx.update(ref, { enabled: false })
      if (owner.get('uid') === target.uid && owner.get('deviceId') === target.deviceId) tx.update(ownerRef, { enabled: false })
    })
  }
  const userRef = db.collection('users').doc(target.uid)
  await db.runTransaction(async tx => {
    const user = await tx.get(userRef)
    if (user.get('expoPushToken') === target.token) tx.update(userRef, { expoPushToken: null })
  })
}

function messageCopy(message, language) {
  const suffix = language === 'ar' ? 'Ar' : language === 'en' ? 'En' : ''
  return {
    title: message[`subject${suffix}`] || message.subject || message.subjectAr || 'Mojammaa',
    body: message[`body${suffix}`] || message.body || message.bodyAr || (language === 'ar' ? 'افتحوا التطبيق للاطلاع على التفاصيل.' : language === 'en' ? 'Open the app for details.' : 'Ouvrez l’application pour le détail.'),
  }
}

module.exports = { registerPushDevice, getPushTargets, invalidatePushTarget, messageCopy, languageOf }
