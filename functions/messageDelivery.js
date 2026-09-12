const { getPushTargets, invalidatePushTarget, messageCopy } = require('./pushDevices')
const { randomUUID } = require('node:crypto')

const SEND_URL = 'https://exp.host/--/api/v2/push/send'
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const MAX_ATTEMPTS = 5
const RECEIPT_DELAY = 15 * 60_000
const RECEIPT_EXPIRY = 24 * 60 * 60_000
const LEASE_MS = 4 * 60_000
const millis = value => typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime()
const retryDelay = attempts => Math.min(60 * 60_000, 60_000 * 2 ** (attempts - 1))

function summarize(targets, recipientCount, now) {
  const count = state => targets.filter(t => t.state === state).length
  const errors = count('failed')
  const pending = count('pending')
  const accepted = count('accepted')
  const transmitted = count('transmitted')
  const noDevice = count('no_device')
  let status = 'transmitted'
  if (!recipientCount) status = 'no_recipient'
  else if (pending) status = targets.some(t => t.attempts > 0) ? 'retrying' : 'pending'
  else if (accepted) status = 'accepted'
  else if (errors || noDevice) status = transmitted ? 'partial_failure' : noDevice === targets.length ? 'no_device' : 'failed'
  return {
    engine: 2, status, recipients: recipientCount, tokens: targets.length - noDevice,
    sent: new Set(targets.filter(t => ['accepted', 'transmitted'].includes(t.state)).map(t => t.uid)).size,
    transmitted: new Set(targets.filter(t => t.state === 'transmitted').map(t => t.uid)).size, errors, noDevice,
    // Codes only: never leak device tokens or raw provider responses to messages.
    errorCodes: [...new Set(targets.map(t => t.error).filter(Boolean))],
    at: new Date(now),
  }
}

function createMessageDelivery(db, { resolveRecipients, fetchImpl = fetch, now = Date.now }) {
  async function recipientsAllowed(message) {
    const sender = message.fromId ? await db.collection('users').doc(message.fromId).get() : null
    if (sender?.get('role') !== 'parent' && message.fromRole !== 'parent') return true
    if (message.type !== 'direct' || !message.eleveId) return false
    const child = await db.collection('eleves').doc(message.eleveId).get()
    if (child.get('parentUid') !== message.fromId) return false
    if (message.toType === 'administration' && message.toIds?.length === 0) return true
    if (message.toType !== 'user' || message.toIds?.length !== 1) return false
    const recipient = await db.collection('users').doc(message.toIds[0]).get()
    return recipient.get('role') === 'admin'
  }

  async function enqueue(messageRef) {
    const jobRef = db.collection('messageDeliveryJobs').doc(messageRef.id)
    if ((await jobRef.get()).exists) return
    const snap = await messageRef.get()
    if (!snap.exists) return
    const message = snap.data()
    const allowed = await recipientsAllowed(message)
    const uids = allowed ? await resolveRecipients(message) : []
    const devices = await getPushTargets(db, uids)
    const targets = devices.map(target => ({ ...target, state: 'pending', attempts: 0, dueAt: now() }))
    for (const uid of uids) {
      if (!devices.some(target => target.uid === uid)) targets.push({ uid, state: 'no_device', attempts: 0 })
    }
    await db.runTransaction(async tx => {
      if ((await tx.get(jobRef)).exists) return
      tx.create(jobRef, {
        targets, recipientCount: uids.length, blocked: !allowed,
        nextAttemptAt: new Date(now()), leaseUntil: null, owner: null,
      })
      tx.update(messageRef, { push: {
        ...summarize(targets, uids.length, now()), ...(!allowed ? { status: 'blocked' } : {}),
        ...(message.automation?.supersededBy ? { status: 'superseded' } : {}),
      } })
    })
  }

  async function post(url, payload) {
    const response = await fetchImpl(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    })
    return { status: response.status, ok: response.ok, json: await response.json() }
  }

  function fail(target, error, retryable) {
    target.error = error
    target.state = retryable && target.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    target.dueAt = now() + retryDelay(target.attempts)
    delete target.ticketId
  }

  async function process(messageRef) {
    const jobRef = db.collection('messageDeliveryJobs').doc(messageRef.id)
    const owner = randomUUID()
    const job = await db.runTransaction(async tx => {
      const snap = await tx.get(jobRef)
      const data = snap.data()
      if (!data?.nextAttemptAt || millis(data.nextAttemptAt) > now()
        || (data.leaseUntil && millis(data.leaseUntil) > now())) return null
      tx.update(jobRef, { owner, leaseUntil: new Date(now() + LEASE_MS) })
      return data
    })
    if (!job) return
    const messageSnap = await messageRef.get()
    if (!messageSnap.exists) { await jobRef.delete(); return }
    const message = messageSnap.data()
    if (!await recipientsAllowed(message)) job.blocked = true
    if (message.automation?.supersededBy) job.superseded = true
    const targets = job.targets

    async function save(release) {
      const due = targets.filter(t => t.state === 'pending' || t.state === 'accepted').map(t => t.dueAt)
      await db.runTransaction(async tx => {
        const current = await tx.get(jobRef)
        const currentMessage = await tx.get(messageRef)
        if (current.get('owner') !== owner) throw new Error('delivery-lease-lost')
        if (!currentMessage.exists) { tx.delete(jobRef); return }
        if (currentMessage.get('automation.supersededBy')) job.superseded = true
        tx.update(jobRef, {
          targets, blocked: job.blocked,
          nextAttemptAt: !job.blocked && !job.superseded && due.length ? new Date(Math.min(...due)) : null,
          leaseUntil: release ? null : new Date(now() + LEASE_MS),
          owner: release ? null : owner,
        })
        tx.update(messageRef, { push: {
          ...summarize(targets, job.recipientCount, now()),
          ...(job.blocked ? { status: 'blocked' } : {}),
          ...(job.superseded ? { status: 'superseded' } : {}),
        } })
      })
    }

    if (!job.blocked && !job.superseded) {
      // Never resend accepted tickets when only another recipient failed.
      const waiting = targets.filter(t => t.state === 'accepted' && t.dueAt <= now())
      for (let i = 0; i < waiting.length; i += 100) {
        const chunk = waiting.slice(i, i + 100)
        let receipts = {}
        try {
          const response = await post(RECEIPTS_URL, { ids: chunk.map(t => t.ticketId) })
          if (response.ok) receipts = response.json?.data || {}
        } catch { /* Poll again: a receipt lookup failure must not resend a push. */ }
        for (const target of chunk) {
          const receipt = receipts[target.ticketId]
          if (receipt?.status === 'ok') {
            target.state = 'transmitted'
            delete target.error
          } else if (receipt?.status === 'error') {
            const code = receipt.details?.error || 'provider_error'
            fail(target, code, code === 'MessageRateExceeded')
            if (code === 'DeviceNotRegistered') {
              await invalidatePushTarget(db, target)
            }
          } else if (now() - target.acceptedAt >= RECEIPT_EXPIRY) {
            fail(target, 'receipt_unknown', false)
          } else target.dueAt = now() + RECEIPT_DELAY
        }
        await save(false)
      }

      const pending = targets.filter(t => t.state === 'pending' && t.dueAt <= now())
      for (let i = 0; i < pending.length; i += 100) {
        if ((await messageRef.get()).get('automation.supersededBy')) { job.superseded = true; break }
        const chunk = pending.slice(i, i + 100)
        chunk.forEach(t => { t.attempts++ })
        const live = await getPushTargets(db, [...new Set(chunk.map(t => t.uid))])
        const ready = chunk.filter(target => {
          const current = live.find(t => t.uid === target.uid && (target.deviceId ? t.deviceId === target.deviceId : t.token === target.token))
          if (!current) { target.state = 'no_device'; target.error = 'device_unregistered'; return false }
          Object.assign(target, current)
          return true
        })
        if (!ready.length) { await save(false); continue }
        const payload = ready.map(t => {
          const copy = messageCopy(message, t.language)
          return {
            to: t.token, sound: 'default', priority: 'high', channelId: 'default',
            title: (message.priority === 'urgent' ? '🚨 ' : '') + copy.title,
            body: copy.body,
            data: { messageId: messageRef.id, type: message.category || 'announcement',
              ...(message.automation || message.toType === 'parents' || message.appointmentAudience === 'parent' ? { workspace: 'parent' } : {}),
            },
          }
        })
        try {
          const response = await post(SEND_URL, payload)
          ready.forEach((target, index) => {
            const ticket = Array.isArray(response.json?.data) ? response.json.data[index] : null
            if (response.ok && ticket?.status === 'ok' && typeof ticket.id === 'string') {
              Object.assign(target, { state: 'accepted', ticketId: ticket.id, acceptedAt: now(), dueAt: now() + RECEIPT_DELAY })
              delete target.error
            } else {
              const code = ticket?.details?.error || `http_${response.status}`
              fail(target, code, response.status === 429 || response.status >= 500
                || (response.ok && (!ticket || code === 'MessageRateExceeded')))
            }
          })
          await Promise.all(ready.filter(target => target.error === 'DeviceNotRegistered').map(target => invalidatePushTarget(db, target)))
        } catch { ready.forEach(t => fail(t, 'network_error', true)) }
        await save(false)
      }
    }
    await save(true)
  }

  async function flush() {
    const jobs = await db.collection('messageDeliveryJobs').where('nextAttemptAt', '<=', new Date(now())).limit(50).get()
    for (const job of jobs.docs) await process(db.collection('messages').doc(job.id))
  }

  // Explicit admin recovery after fixing a link, phone or provider credentials.
  // Accepted/transmitted tickets and ambiguous receipts are never resent here.
  async function retry(messageRef, actorUid) {
    const actor = await db.collection('users').doc(actorUid).get()
    if (actor.get('role') !== 'admin') throw Object.assign(new Error('Admin only'), { code: 'permission-denied' })
    const jobRef = db.collection('messageDeliveryJobs').doc(messageRef.id)
    return db.runTransaction(async tx => {
      const [jobSnap, messageSnap] = await Promise.all([tx.get(jobRef), tx.get(messageRef)])
      if (!jobSnap.exists || !messageSnap.exists) return false
      const job = jobSnap.data()
      const message = messageSnap.data()
      if (job.blocked || message.automation?.supersededBy
        || (job.leaseUntil && millis(job.leaseUntil) > now())) return false
      let targets = job.targets
      let newRecipient = null
      if (!job.recipientCount && message.automation && message.eleveId) {
        const child = await tx.get(db.collection('eleves').doc(message.eleveId))
        newRecipient = child.get('active') !== false ? child.get('parentUid') : null
        if (!newRecipient) return false
        targets = [{ uid: newRecipient, state: 'no_device', attempts: 0 }]
      }
      const retryUids = [...new Set(targets.filter(t => ['failed', 'no_device'].includes(t.state) && t.error !== 'receipt_unknown').map(t => t.uid))]
      const fresh = await getPushTargets(db, retryUids)
      const protectedTargets = targets.filter(t => ['accepted', 'transmitted', 'pending'].includes(t.state) || t.error === 'receipt_unknown')
      const replacements = fresh.filter(t => !protectedTargets.some(existing => existing.token === t.token
        || (t.deviceId && existing.deviceId === t.deviceId))).map(t => ({ ...t, state: 'pending', attempts: 0, dueAt: now() }))
      if (!replacements.length) return false
      targets = targets.filter(t => !retryUids.includes(t.uid) || !['failed', 'no_device'].includes(t.state)
        || t.error === 'receipt_unknown' || !replacements.some(r => r.uid === t.uid)).concat(replacements)
      const recipientCount = newRecipient ? 1 : job.recipientCount
      tx.update(jobRef, { targets, recipientCount, nextAttemptAt: new Date(now()), retriedBy: actorUid, retriedAt: new Date(now()) })
      tx.update(messageRef, {
        ...(newRecipient ? { toIds: [newRecipient] } : {}),
        push: summarize(targets, recipientCount, now()),
      })
      return true
    })
  }
  return { enqueue, process, flush, retry }
}

module.exports = { createMessageDelivery, summarize, retryDelay }
