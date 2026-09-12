const { createHash } = require('node:crypto')
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }) }
const hash = value => createHash('sha256').update(value).digest('hex')
const idOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,257}$/.test(value)
const topics = ['learning', 'attendance', 'behavior', 'administrative', 'other']
const openStatuses = ['requested', 'proposed', 'confirmed']
const terminal = ['cancelled', 'declined', 'completed']
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail('invalid-argument')
  return value.trim()
}
function localParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]))
}
function slotTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) fail('invalid-argument')
  const target = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(target)) fail('invalid-argument')
  let guess = target
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess))
    guess += target - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)
  }
  const p = localParts(new Date(guess))
  if (`${p.year}-${p.month}-${p.day}` !== date || `${p.hour}:${p.minute}` !== time) fail('invalid-argument')
  return guess
}
function projectAppointment(row, mode) {
  if (mode !== 'teacher') return row
  const { id, eleveId, childName, classe, topic, status, revision, date, time, duration, startAt, endAt, location, staffName, updatedAt } = row
  return { id, eleveId, childName, classe, topic, status, revision, date, time, duration, startAt, endAt, location, staffName, updatedAt }
}
function serialize(doc) {
  const row = { ...doc.data(), id: doc.id }
  for (const field of ['createdAt', 'updatedAt']) row[field] = row[field]?.toMillis?.() || 0
  return row
}
async function listAppointments(db, uid, input = {}) {
  if (!uid) fail('unauthenticated')
  const user = await db.doc(`users/${uid}`).get()
  if (!user.exists) fail('permission-denied')
  const mode = input.mode
  if (!['parent', 'admin', 'teacher'].includes(mode) || (mode === 'admin' && user.get('role') !== 'admin')
    || (mode === 'teacher' && user.get('role') !== 'professeur')) fail('permission-denied')
  let query = db.collection('appointments').where('open', '==', input.history !== true)
  if (mode === 'parent') query = query.where('parentUid', '==', uid)
  if (mode === 'teacher') query = query.where('teacherId', '==', uid).where('teacherVisible', '==', true)
  query = query.orderBy('createdAt', 'desc')
  if (input.cursor) {
    if (!idOk(input.cursor)) fail('invalid-argument')
    const cursor = await db.doc(`appointments/${input.cursor}`).get()
    if (!cursor.exists || (mode === 'parent' && cursor.get('parentUid') !== uid)
      || (mode === 'teacher' && cursor.get('teacherId') !== uid)) fail('permission-denied')
    query = query.startAfter(cursor)
  }
  const snap = await query.limit(51).get(), page = snap.docs.slice(0, 50)
  // Live student links are authoritative, including after a guardian transfer.
  const childIds = [...new Set(page.map(doc => doc.get('eleveId')))]
  const children = childIds.length ? await db.getAll(...childIds.map(id => db.doc(`eleves/${id}`))) : []
  const byId = new Map(children.map(child => [child.id, child.data()]))
  const rows = page.filter(doc => {
    const child = byId.get(doc.get('eleveId'))
    if (mode === 'parent') return child?.active !== false && child?.parentUid === uid
    if (mode === 'teacher') return child?.active !== false && [...(user.get('classes') || []), user.get('classe')].includes(child?.classe)
    return true
  }).map(doc => projectAppointment(serialize(doc), mode))
  return { rows, cursor: snap.size > 50 ? page.at(-1).id : null }
}

async function appointmentCommand(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  if (!idOk(input?.operationId) || input.operationId.length < 16 || input.operationId.length > 80) fail('invalid-argument')
  const action = input.action
  if (!['request', 'propose', 'confirm', 'request_change', 'cancel', 'decline', 'complete'].includes(action)) fail('invalid-argument')
  const appointmentId = action === 'request' ? `${uid}_${input.operationId}` : input.appointmentId
  if (!idOk(appointmentId)) fail('invalid-argument')
  const ref = db.collection('appointments').doc(appointmentId)
  const operation = db.collection('appointmentOperations').doc(`${uid}_${input.operationId}`)
  const fingerprint = hash(JSON.stringify(input))
  return db.runTransaction(async tx => {
    const [user, previous, replay] = await tx.getAll(db.doc(`users/${uid}`), ref, operation)
    if (!user.exists) fail('permission-denied')
    const old = previous.data(), admin = user.get('role') === 'admin'
    const eleveId = action === 'request' ? input.eleveId : old?.eleveId
    if (!idOk(eleveId)) fail('invalid-argument')
    const child = await tx.get(db.doc(`eleves/${eleveId}`))
    const guardian = child.exists && child.get('active') !== false && child.get('parentUid') === uid
    if (action === 'request' ? !guardian : (!old || (!admin && (!guardian || old.parentUid !== uid)))) fail('permission-denied')
    if (replay.exists) {
      if (replay.get('fingerprint') !== fingerprint) fail('already-exists')
      return { id: appointmentId, replayed: true }
    }
    if (action !== 'request' && input.revision !== old.revision) fail('failed-precondition', 'stale')
    const familyRef = db.collection('appointmentFamilies').doc(hash(`${action === 'request' ? uid : old.parentUid}|${eleveId}`))
    const family = await tx.get(familyRef)
    let next
    if (action === 'request') {
      if (previous.exists) fail('already-exists')
      if (family.get('openId')) fail('failed-precondition', 'already-open')
      if (!topics.includes(input.topic)) fail('invalid-argument')
      next = { parentUid: uid, eleveId, childName: `${child.get('prenom') || ''} ${child.get('nom') || ''}`.trim(),
        classe: child.get('classe') || '', topic: input.topic, note: text(input.note || '', 500), availability: text(input.availability || '', 200, true),
        status: 'requested', revision: 1, createdAt: now, teacherId: '', teacherVisible: false }
    } else {
      next = { ...old, revision: old.revision + 1 }
      if (terminal.includes(old.status)) fail('failed-precondition', 'closed')
      if (['propose', 'decline', 'complete'].includes(action) && !admin) fail('permission-denied')
      if (['confirm', 'request_change'].includes(action) && (!guardian || old.parentUid !== uid)) fail('permission-denied')
      if (action === 'propose') {
        if (!['requested', 'proposed', 'confirmed'].includes(old.status)) fail('failed-precondition')
        if (!child.exists || child.get('active') === false || child.get('parentUid') !== old.parentUid) fail('failed-precondition', 'guardian-changed')
        const startAt = slotTime(input.date, input.time), duration = input.duration
        if (![15, 30, 45, 60].includes(duration) || startAt <= now.getTime() || startAt > now.getTime() + 180 * 86400_000) fail('invalid-argument')
        const teacherId = input.teacherId || ''
        if (teacherId && !idOk(teacherId)) fail('invalid-argument')
        const staffId = teacherId || uid
        const staff = teacherId ? await tx.get(db.doc(`users/${teacherId}`)) : user
        if (teacherId && (staff.get('role') !== 'professeur'
          || ![...(staff.get('classes') || []), staff.get('classe')].includes(child.get('classe')))) fail('failed-precondition', 'teacher-scope')
        const endAt = startAt + duration * 60_000
        const endDate = localParts(new Date(endAt))
        if (`${endDate.year}-${endDate.month}-${endDate.day}` !== input.date) fail('invalid-argument')
        if (teacherId) {
          const schedule = await tx.get(db.doc(`schedules/${teacherId}`))
          const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${input.date}T12:00:00Z`).getUTCDay()]
          if ((schedule.get('weeklySlots') || []).some(slot => slot.day === day
            && startAt < slotTime(input.date, slot.endTime) && endAt > slotTime(input.date, slot.startTime))) fail('failed-precondition', 'busy')
        }
        next = { ...next, status: 'proposed', teacherId, teacherVisible: false, staffId,
          staffName: `${staff.get('prenom') || ''} ${staff.get('nom') || ''}`.trim(),
          date: input.date, time: input.time, duration, startAt, endAt, location: text(input.location, 150, true),
          adminNote: text(input.adminNote || '', 300), classe: child.get('classe') || '' }
      } else if (action === 'confirm') {
        if (old.status !== 'proposed' || old.startAt <= now.getTime()) fail('failed-precondition', 'stale')
        if (old.teacherId) {
          const staff = await tx.get(db.doc(`users/${old.teacherId}`))
          if (staff.get('role') !== 'professeur' || ![...(staff.get('classes') || []), staff.get('classe')].includes(child.get('classe'))) fail('failed-precondition', 'teacher-scope')
          const schedule = await tx.get(db.doc(`schedules/${old.teacherId}`))
          const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${old.date}T12:00:00Z`).getUTCDay()]
          if ((schedule.get('weeklySlots') || []).some(slot => slot.day === day
            && old.startAt < slotTime(old.date, slot.endTime) && old.endAt > slotTime(old.date, slot.startTime))) fail('failed-precondition', 'busy')
        }
        next.status = 'confirmed'; next.teacherVisible = !!old.teacherId
      } else if (action === 'request_change') {
        if (old.status !== 'proposed') fail('failed-precondition')
        next.status = 'requested'; next.availability = text(input.availability || '', 200, true); next.teacherVisible = false
      } else if (action === 'complete') {
        if (old.status !== 'confirmed' || old.endAt > now.getTime()) fail('failed-precondition')
        next.status = 'completed'
      } else if (action === 'decline') {
        if (!['requested', 'proposed'].includes(old.status)) fail('failed-precondition')
        next.status = 'declined'; next.adminNote = text(input.adminNote || '', 300, true)
      } else next.status = 'cancelled'
    }
    // Reserve both the staff member and the parent in the same transaction.
    const reservations = row => row && ['proposed', 'confirmed'].includes(row.status)
      ? [`staff:${row.staffId}`, `parent:${row.parentUid}`].map(owner => hash(`${owner}|${row.date}`)) : []
    const oldKeys = reservations(old), newKeys = reservations(next), keys = [...new Set([...oldKeys, ...newKeys])]
    const bookings = keys.length ? await tx.getAll(...keys.map(key => db.doc(`appointmentBookings/${key}`))) : []
    const updated = bookings.map((booking, i) => {
      const entries = (booking.get('entries') || []).filter(entry => entry.id !== appointmentId && entry.endAt > now.getTime())
      if (newKeys.includes(keys[i])) {
        if (entries.some(entry => next.startAt < entry.endAt && next.endAt > entry.startAt)) fail('failed-precondition', 'busy')
        entries.push({ id: appointmentId, startAt: next.startAt, endAt: next.endAt })
      }
      return { ref: booking.ref, entries }
    })
    next.open = openStatuses.includes(next.status); next.updatedAt = now
    tx.set(ref, next)
    updated.forEach(booking => tx.set(booking.ref, { entries: booking.entries }))
    tx.set(familyRef, { openId: next.open ? appointmentId : null })
    tx.create(operation, { fingerprint, appointmentId, createdAt: now })
    // Auditable notices use the existing durable message-delivery pipeline.
    const toAdmin = ['request', 'confirm', 'request_change'].includes(action) || (action === 'cancel' && !admin)
    const teacherRecipients = []
    if (next.teacherVisible && next.teacherId && ['confirm', 'cancel'].includes(action)) teacherRecipients.push(next.teacherId)
    // A previously confirmed teacher is informed if administration reschedules.
    if (old?.teacherVisible && old.teacherId && action === 'propose') teacherRecipients.push(old.teacherId)
    const statusNames = {
      requested: ['Demande de rendez-vous', 'Appointment request', 'طلب موعد'], proposed: ['Créneau proposé', 'Appointment proposed', 'اقتراح موعد'],
      confirmed: ['Rendez-vous confirmé', 'Appointment confirmed', 'تأكيد الموعد'], cancelled: ['Rendez-vous annulé', 'Appointment cancelled', 'إلغاء الموعد'],
      declined: ['Demande de rendez-vous refusée', 'Appointment request declined', 'رفض طلب الموعد'], completed: ['Rendez-vous terminé', 'Appointment completed', 'انتهاء الموعد'],
    }
    const copy = statusNames[next.status]
    const local = localParts(now)
    const schoolYear = Number(local.year) - (Number(local.month) < 9 ? 1 : 0)
    const notices = [
      ...(toAdmin ? [{ toType: 'administration', toIds: [], appointmentAudience: 'admin' }] : [{ toType: 'user', toIds: [next.parentUid], appointmentAudience: 'parent' }]),
      ...(teacherRecipients.length ? [{ toType: 'user', toIds: [...new Set(teacherRecipients)], appointmentAudience: 'teacher' }] : []),
    ]
    notices.forEach((target, i) => tx.create(db.collection('messages').doc(`appointment_${hash(`${uid}|${input.operationId}`)}_${i}`), {
      ...target, type: 'appointment', category: 'event', subject: copy[0], subjectEn: copy[1], subjectAr: copy[2],
      body: 'Ouvrez Rendez-vous pour consulter la demande et son état actuel.', bodyEn: 'Open Appointments to view the request and its current status.', bodyAr: 'افتحوا المواعيد للاطلاع على الطلب وحالته الحالية.',
      fromId: 'system-appointments', fromRole: 'system', fromNom: 'Mojammaa', readBy: [], status: 'sent', priority: 'normal', createdAt: now,
      appointmentId, academicYear: `${schoolYear}-${schoolYear + 1}`,
      monthKey: `${local.year}-${local.month}`, semestre: Number(local.month) >= 9 || local.month === '01' ? 'S1' : 'S2',
    }))
    return { id: appointmentId, replayed: false }
  })
}
module.exports = { appointmentCommand, listAppointments, slotTime, projectAppointment }
