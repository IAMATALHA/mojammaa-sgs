const assert = require('node:assert/strict')
const { appointmentCommand, listAppointments, slotTime } = require('../../functions/appointments')
const { cancelComportement } = require('../../functions/behaviorCancellation')
const { reconcileSchoolAlert } = require('../../functions/schoolAlerts')
const { getDashboardActions } = require('../../functions/dashboardActions')

module.exports = async function thirdLotCases(db, test) {
  const now = new Date('2026-09-07T10:00:00Z'), date = '2026-09-08'
  let number = 0
  const op = () => `lot3_operation_${String(++number).padStart(8, '0')}`
  const doc = path => db.doc(path)
  const seed = (path, value) => doc(path).set(value)
  await Promise.all([
    seed('users/p3', { role: 'parent' }), seed('users/p4', { role: 'parent' }), seed('users/a3', { role: 'admin', prenom: 'Admin' }),
    seed('users/t3', { role: 'professeur', classes: ['LOT3'], prenom: 'Teacher' }), seed('users/t4', { role: 'professeur', classes: ['ELSEWHERE'] }),
    seed('eleves/k3', { parentUid: 'p3', classe: 'LOT3', prenom: 'Fixture', nom: 'One', active: true }),
    seed('eleves/k4', { parentUid: 'p4', classe: 'LOT3', prenom: 'Fixture', nom: 'Two', active: true }),
    seed('eleves/k5', { parentUid: 'p3', classe: 'LOT3', prenom: 'Fixture', nom: 'Three', active: true }),
    seed('schedules/t3', { weeklySlots: [{ day: 'tuesday', startTime: '08:30', endTime: '09:30', classe: 'LOT3' }] }),
  ])
  const request = (uid, eleveId, extra = {}) => appointmentCommand(db, uid, { action: 'request', operationId: op(), eleveId, topic: 'learning', availability: 'Tuesday afternoon', note: 'Private parent note', ...extra }, now)
  const state = async id => (await doc(`appointments/${id}`).get()).data()
  const act = async (uid, id, action, extra = {}, at = now) => appointmentCommand(db, uid, { action, appointmentId: id, revision: (await state(id)).revision, operationId: op(), ...extra }, at)
  const propose = (id, time = '16:00', teacherId = 't3') => act('a3', id, 'propose', { date, time, duration: 30, location: 'Test office', teacherId })
  const notices = () => db.collection('messages').where('type', '==', 'appointment').get()
  let first, second, sibling

  await test('Appointment request is guardian-only and routes exclusively to administration', async () => {
    await assert.rejects(request(null, 'k3'), { code: 'unauthenticated' })
    await assert.rejects(request('p4', 'k3'), { code: 'permission-denied' })
    first = (await request('p3', 'k3')).id
    assert.equal((await state(first)).status, 'requested')
    const messages = (await notices()).docs
    assert.equal(messages.length, 1); assert.equal(messages[0].get('toType'), 'administration')
    assert.deepEqual(messages[0].get('toIds'), [])
    assert.equal(JSON.stringify(messages[0].data()).includes('Private parent note'), false)
  })
  await test('Replaying request is idempotent; a second open request for a child is rejected', async () => {
    const input = { action: 'request', operationId: op(), eleveId: 'k4', topic: 'attendance', availability: 'Afternoon', note: '' }
    const results = await Promise.all([appointmentCommand(db, 'p4', input, now), appointmentCommand(db, 'p4', input, now)])
    assert.equal(results[0].id, results[1].id); assert.equal(results.filter(result => result.replayed).length, 1)
    second = results[0].id
    await assert.rejects(request('p4', 'k4'), { code: 'failed-precondition', message: 'already-open' })
    await assert.rejects(appointmentCommand(db, 'p4', { ...input, topic: 'other' }, now), { code: 'already-exists' })
  })
  await test('Only administration proposes times and only assigned teachers may participate', async () => {
    await assert.rejects(act('p3', first, 'propose', { date, time: '16:00', duration: 30, location: 'Test' }), { code: 'permission-denied' })
    await assert.rejects(act('t3', first, 'propose', { date, time: '16:00', duration: 30, location: 'Test' }), { code: 'permission-denied' })
    await assert.rejects(propose(first, '16:00', 't4'), { code: 'failed-precondition', message: 'teacher-scope' })
    await assert.rejects(propose(first, '08:45'), { code: 'failed-precondition', message: 'busy' })
    await propose(first)
    assert.equal((await state(first)).status, 'proposed')
  })
  await test('Teachers cannot read unconfirmed requests or private parent details', async () => {
    assert.equal((await listAppointments(db, 't3', { mode: 'teacher' })).rows.length, 0)
    assert.equal((await listAppointments(db, 'p4', { mode: 'parent' })).rows.some(row => row.id === first), false)
    await assert.rejects(listAppointments(db, 'p3', { mode: 'admin' }), { code: 'permission-denied' })
    await assert.rejects(listAppointments(db, 'p3', { mode: 'teacher' }), { code: 'permission-denied' })
    await assert.rejects(listAppointments(db, 'p4', { mode: 'parent', cursor: first }), { code: 'permission-denied' })
  })
  await test('Overlapping proposals are rejected and adjacent slots remain available', async () => {
    // first already reserves 16:00–16:30
    await assert.rejects(propose(second, '16:15'), { code: 'failed-precondition', message: 'busy' })
    assert.equal((await state(second)).status, 'requested')
    await propose(second, '16:30') // adjacent times are permitted
  })
  await test('The same parent cannot have simultaneous meetings for different children', async () => {
    sibling = (await request('p3', 'k5')).id
    await assert.rejects(propose(sibling, '16:15', ''), { code: 'failed-precondition', message: 'busy' })
    await propose(sibling, '17:00', '')
  })
  await test('Only the current guardian confirms; teacher sees the confirmed meeting with minimal fields', async () => {
    await assert.rejects(act('a3', first, 'confirm'), { code: 'permission-denied' })
    await assert.rejects(act('p4', first, 'confirm'), { code: 'permission-denied' })
    await act('p3', first, 'confirm')
    const meeting = (await listAppointments(db, 't3', { mode: 'teacher' })).rows[0]
    assert.equal(meeting.id, first); assert.equal(meeting.status, 'confirmed')
    assert.equal('note' in meeting, false); assert.equal('availability' in meeting, false); assert.equal('parentUid' in meeting, false)
    await assert.rejects(act('t3', first, 'cancel'), { code: 'permission-denied' })
  })
  await test('Optimistic revision rejects stale decisions and a lost-response replay creates no extra notice', async () => {
    const data = { action: 'confirm', operationId: op(), appointmentId: second, revision: (await state(second)).revision }
    await appointmentCommand(db, 'p4', data, now)
    const before = (await notices()).size
    assert.equal((await appointmentCommand(db, 'p4', data, now)).replayed, true)
    assert.equal((await notices()).size, before)
    await assert.rejects(appointmentCommand(db, 'p4', { ...data, action: 'cancel', operationId: op() }, now), { code: 'failed-precondition', message: 'stale' })
  })
  await test('Cancellation frees reservations and preserves an auditable record', async () => {
    await act('p3', first, 'cancel')
    assert.equal((await state(first)).open, false)
    assert.equal((await listAppointments(db, 'p3', { mode: 'parent', history: true })).rows[0].status, 'cancelled')
    await propose(second, '16:00')
    assert.equal((await state(second)).status, 'proposed')
    assert.equal((await listAppointments(db, 't3', { mode: 'teacher' })).rows.length, 0)
    await assert.rejects(act('p3', first, 'confirm'), { code: 'failed-precondition', message: 'closed' })
  })
  await test('A guardian can request a different time through administration', async () => {
    await act('p3', sibling, 'request_change', { availability: 'Wednesday instead' })
    assert.equal((await state(sibling)).status, 'requested')
    await act('a3', sibling, 'decline', { adminNote: 'Please contact the office' })
    assert.equal((await state(sibling)).open, false)
    const replacement = await request('p3', 'k5')
    assert.ok(replacement.id)
  })
  await test('A changed schedule is rechecked at parent confirmation', async () => {
    await doc('schedules/t3').update({ weeklySlots: [{ day: 'tuesday', startTime: '16:00', endTime: '17:00', classe: 'LOT3' }] })
    await assert.rejects(act('p4', second, 'confirm'), { code: 'failed-precondition', message: 'busy' })
    await doc('schedules/t3').update({ weeklySlots: [] })
    await act('p4', second, 'confirm')
  })
  await test('Completion is admin-only and cannot happen before the meeting ends', async () => {
    await assert.rejects(act('a3', second, 'complete'), { code: 'failed-precondition' })
    const later = new Date('2026-09-09T10:00:00Z')
    await assert.rejects(act('p4', second, 'complete', {}, later), { code: 'permission-denied' })
    await act('a3', second, 'complete', {}, later)
    assert.equal((await state(second)).status, 'completed')
  })
  await test('Guardian transfer and teacher reassignment revoke list and action access', async () => {
    await doc('eleves/k3').update({ parentUid: 'p4' })
    assert.equal((await listAppointments(db, 'p3', { mode: 'parent', history: true })).rows.some(row => row.id === first), false)
    await assert.rejects(act('p3', first, 'cancel'), { code: 'permission-denied' })
    await doc('users/t3').update({ classes: ['ELSEWHERE'] })
    assert.equal((await listAppointments(db, 't3', { mode: 'teacher', history: true })).rows.length, 0)
    await doc('users/t3').update({ classes: ['LOT3'] })
    await doc('eleves/k3').update({ parentUid: 'p3' })
  })
  await test('Real dates and Morocco time are enforced, including Ramadan offset', async () => {
    assert.equal(new Date(slotTime('2026-09-08', '16:00')).toISOString(), '2026-09-08T15:00:00.000Z')
    assert.equal(new Date(slotTime('2026-03-01', '16:00')).toISOString(), '2026-03-01T16:00:00.000Z')
    assert.throws(() => slotTime('2026-02-30', '16:00'), { code: 'invalid-argument' })
    assert.throws(() => slotTime('2026-09-08', '25:00'), { code: 'invalid-argument' })
    const requestId = (await request('p3', 'k3')).id
    await assert.rejects(propose(requestId, '23:45', ''), { code: 'invalid-argument' })
    await assert.rejects(act('a3', requestId, 'propose', { date: '2025-09-08', time: '16:00', duration: 30, location: 'Test' }), { code: 'invalid-argument' })
  })

  const period = () => ({ academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-09' })
  const ref = doc('comportements/lot3_merit')
  const reconcile = () => reconcileSchoolAlert(db, { kind: 'behavior', sourceRef: ref, period })
  await test('Cancellation is author/admin-only and requires a reason', async () => {
    await ref.set({ eleveId: 'k3', classe: 'LOT3', kind: 'merite', reason: 'participation', date: '2026-09-07', teacherId: 't3' })
    await assert.rejects(cancelComportement(db, 'p3', { id: ref.id, reason: 'Correction' }, now), { code: 'permission-denied' })
    await assert.rejects(cancelComportement(db, 't4', { id: ref.id, reason: 'Correction' }, now), { code: 'permission-denied' })
    await assert.rejects(cancelComportement(db, 't3', { id: ref.id, reason: '' }, now), { code: 'invalid-argument' })
  })
  await test('Cancelling a merit preserves history and emits exactly one correction', async () => {
    const initial = await reconcile()
    await Promise.all([cancelComportement(db, 't3', { id: ref.id, reason: 'Entry mistake' }, now), cancelComportement(db, 't3', { id: ref.id, reason: 'Entry mistake' }, now)])
    await Promise.all([reconcile(), reconcile()])
    const messages = await db.collection('messages').where('automation.source', '==', ref.path).get()
    assert.equal(messages.size, 2)
    assert.equal((await ref.get()).get('cancelledBy'), 't3')
    assert.ok((await doc(`messages/${initial}`).get()).get('automation.supersededBy'))
    const correction = messages.docs.find(doc => doc.get('automation.correction'))
    assert.match(correction.get('subjectEn'), /cancelled/)
  })
  await test('An entry cancelled before its first trigger cannot award a merit later', async () => {
    const early = doc('comportements/lot3_early')
    await early.set({ eleveId: 'k3', classe: 'LOT3', kind: 'merite', reason: 'participation', date: '2026-09-07', teacherId: 't3' })
    await cancelComportement(db, 'a3', { id: early.id, reason: 'Correction' }, now)
    await reconcileSchoolAlert(db, { kind: 'behavior', sourceRef: early, period })
    await reconcileSchoolAlert(db, { kind: 'behavior', sourceRef: early, period })
    assert.equal((await db.collection('messages').where('automation.source', '==', early.path).get()).size, 0)
  })
  await test('Action center refuses forged administrator or teacher modes', async () => {
    await assert.rejects(getDashboardActions(db, null, { mode: 'parent' }, now), { code: 'unauthenticated' })
    await assert.rejects(getDashboardActions(db, 'p3', { mode: 'admin' }, now), { code: 'permission-denied' })
    await assert.rejects(getDashboardActions(db, 'p3', { mode: 'teacher' }, now), { code: 'permission-denied' })
  })
  await test('Parent actions count only due unsubmitted homework and unjustified absences of linked children', async () => {
    await Promise.all([
      seed('devoirs/lot3_due', { classeId: 'LOT3', dateLimite: '2026-09-07', teacherId: 't3' }),
      seed('devoirs/lot3_future', { classeId: 'LOT3', dateLimite: '2026-09-10', teacherId: 't3' }),
      seed('devoirs/lot3_pastYear', { classeId: 'LOT3', dateLimite: '2026-08-10', teacherId: 't3' }),
      seed('homeworkSubmissions/lot3_due_k3', { status: 'submitted', teacherId: 't3', classeId: 'LOT3' }),
      seed('absences/lot3_abs', { eleveId: 'k3', classe: 'LOT3', date: '2026-09-07', statut: 'absent', justified: false }),
      seed('absences/lot3_other', { eleveId: 'k4', classe: 'LOT3', date: '2026-09-07', statut: 'absent', justified: false }),
      seed('absences/lot3_justified', { eleveId: 'k5', classe: 'LOT3', date: '2026-09-07', statut: 'absent', justified: true }),
    ])
    const result = await getDashboardActions(db, 'p3', { mode: 'parent' }, now)
    assert.equal(result.actions.find(row => row.kind === 'homework').count, 1)
    assert.equal(result.actions.find(row => row.kind === 'absences').count, 1)
  })
  await test('A partial roll call stays actionable; future lessons and school holidays do not', async () => {
    const slot = { day: 'monday', startTime: '08:30', endTime: '09:30', classe: 'LOT3' }
    await doc('schedules/t3').set({ weeklySlots: [slot, { ...slot, startTime: '14:00', endTime: '15:00' }] })
    await seed('absences/lot3_marked', { eleveId: 'k3', classe: 'LOT3', date: '2026-09-07', seance: 'S1', statut: 'present' })
    let result = await getDashboardActions(db, 't3', { mode: 'teacher' }, now)
    assert.equal(result.actions.filter(row => row.kind === 'attendance').length, 1)
    assert.equal(result.actions.find(row => row.kind === 'attendance').count, 2)
    assert.equal(result.actions.find(row => row.kind === 'reviews').count, 1)
    await Promise.all(['k4', 'k5'].map(id => seed(`absences/lot3_${id}`, { eleveId: id, classe: 'LOT3', date: '2026-09-07', seance: 'S1', statut: 'present' })))
    result = await getDashboardActions(db, 't3', { mode: 'teacher' }, now)
    assert.equal(result.actions.some(row => row.kind === 'attendance'), false)
    await doc('absences/lot3_marked').delete()
    await seed('joursScolaires/2026-09-07', { annuleCours: true })
    assert.equal((await getDashboardActions(db, 't3', { mode: 'teacher' }, now)).actions.some(row => row.kind === 'attendance'), false)
  })
  await test('Admin actions include actual delivery incidents and open appointment requests', async () => {
    const result = await getDashboardActions(db, 'a3', { mode: 'admin' }, now)
    assert.ok(result.actions.find(row => row.kind === 'delivery').count > 0)
    assert.ok(result.actions.find(row => row.kind === 'appointments').count > 0)
  })
  await test('Simultaneous proposals reserve the same staff slot only once', async () => {
    await Promise.all(['race1', 'race2'].map(async uid => {
      await seed(`users/${uid}`, { role: 'parent' })
      await seed(`eleves/${uid}`, { parentUid: uid, classe: 'RACE', active: true })
    }))
    const ids = await Promise.all(['race1', 'race2'].map(async uid => (await request(uid, uid)).id))
    const results = await Promise.allSettled(ids.map(id => propose(id, '18:00', '')))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    const rejected = results.find(result => result.status === 'rejected')
    assert.equal(rejected.reason.code, 'failed-precondition'); assert.equal(rejected.reason.message, 'busy')
    assert.deepEqual((await Promise.all(ids.map(state))).map(row => row.status).sort(), ['proposed', 'requested'])
  })
  await test('Appointment notices use the school timezone across the September year boundary', async () => {
    await seed('eleves/boundary', { parentUid: 'p3', classe: 'LOT3', active: true })
    const result = await appointmentCommand(db, 'p3', { action: 'request', operationId: op(), eleveId: 'boundary', topic: 'other', availability: 'Afternoon' }, new Date('2026-08-31T23:30:00Z'))
    const messages = await db.collection('messages').where('appointmentId', '==', result.id).get()
    assert.equal(messages.size, 1)
    assert.equal(messages.docs[0].get('academicYear'), '2026-2027')
    assert.equal(messages.docs[0].get('monthKey'), '2026-09')
    assert.equal(messages.docs[0].get('semestre'), 'S1')
    assert.equal(messages.docs[0].get('appointmentAudience'), 'admin')
    await propose(result.id, '19:00')
    await act('p3', result.id, 'confirm')
    const all = (await db.collection('messages').where('appointmentId', '==', result.id).get()).docs
    assert.deepEqual(all.filter(row => row.get('appointmentAudience') === 'parent').map(row => row.get('toIds')), [['p3']])
    assert.deepEqual(all.filter(row => row.get('appointmentAudience') === 'teacher').map(row => row.get('toIds')), [['t3']])
  })
  await test('Appointment pagination covers all records without exposing another parent cursor', async () => {
    await seed('users/paging', { role: 'parent' })
    await seed('eleves/paging', { parentUid: 'paging', active: true })
    const batch = db.batch()
    for (let i = 0; i < 52; i++) batch.set(doc(`appointments/paging_${String(i).padStart(3, '0')}`), {
      parentUid: 'paging', eleveId: 'paging', open: false, status: 'cancelled', createdAt: new Date(now.getTime() + i),
    })
    await batch.commit()
    const page1 = await listAppointments(db, 'paging', { mode: 'parent', history: true })
    const page2 = await listAppointments(db, 'paging', { mode: 'parent', history: true, cursor: page1.cursor })
    assert.equal(page1.rows.length, 50); assert.equal(page2.rows.length, 2); assert.equal(page2.cursor, null)
    assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.id)).size, 52)
    await assert.rejects(listAppointments(db, 'p3', { mode: 'parent', history: true, cursor: page1.cursor }), { code: 'permission-denied' })
  })
}
