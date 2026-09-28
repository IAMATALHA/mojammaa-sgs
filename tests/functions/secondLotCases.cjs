const assert = require('node:assert/strict')
const { registerPushDevice, releasePushDevice, getPushTargets, invalidatePushTarget } = require('../../functions/pushDevices')
const { createMessageDelivery } = require('../../functions/messageDelivery')
const { loadAttendance, submitAttendance } = require('../../functions/attendanceSubmission')
const { lessonKey, attendanceVersion } = require('../../functions/lib/attendanceProtocol')
const { alertCopy } = require('../../functions/schoolAlerts')

module.exports = async function secondLotCases(db, test) {
  const token = id => `ExpoPushToken[lot2-${id}]`
  let revision = 0
  const phone = (id, extra = {}) => ({ deviceId: `installation_${id.padEnd(16, '_')}`, revision: ++revision, enabled: true, token: token(id), platform: 'ios', language: 'fr', ...extra })
  const register = (uid, id, extra) => registerPushDevice(db, uid, phone(id, extra))
  const targets = uid => getPushTargets(db, [uid])
  const people = ['multi', 'switched', 'rotation', 'errors', 'removed', 'legacy', 'recovery']
  await Promise.all(people.map(uid => db.doc(`users/${uid}`).set({ role: 'parent' })))
  function delivery() {
    const requests = [], replies = []
    let time = Date.now()
    const service = createMessageDelivery(db, {
      resolveRecipients: async message => message.toIds,
      now: () => time,
      fetchImpl: async (url, options) => {
        const payload = JSON.parse(options.body)
        requests.push({ url, payload })
        return { status: 200, ok: true, json: async () => ({ data: replies.shift() || payload.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) }) }
      },
    })
    return { ...service, requests, replies, advance: ms => { time += ms } }
  }
  async function message(id, uid, copy = {}) {
    const ref = db.doc(`messages/lot2_${id}`)
    await ref.set({ fromId: 'teacher', fromRole: 'professeur', toIds: [uid], type: 'direct', subject: 'Français', body: 'Corps français', subjectAr: 'العربية', bodyAr: 'نص عربي', ...copy })
    return ref
  }
  await test('Two phones receive distinct languages, one recipient is counted', async () => {
    await register('multi', 'fr'); await register('multi', 'ar', { language: 'ar' })
    const h = delivery(), ref = await message('languages', 'multi')
    await h.enqueue(ref); await h.process(ref)
    assert.equal(h.requests[0].payload.length, 2)
    assert.deepEqual(new Set(h.requests[0].payload.map(p => p.title)), new Set(['Français', 'العربية']))
    assert.equal((await ref.get()).get('push.sent'), 1)
    assert.equal((await ref.get()).get('push.tokens'), 2)
  })
  await test('Logout disables only this phone and its legacy fallback', async () => {
    await db.doc('users/multi').update({ expoPushToken: token('fr') })
    await register('multi', 'fr', { enabled: false })
    assert.deepEqual((await targets('multi')).map(t => t.token), [token('ar')])
    assert.equal((await db.doc('users/multi').get()).get('expoPushToken'), null)
  })
  await test('A delayed server registration cannot undo a newer logout', async () => {
    const earlier = phone('delayed')
    await registerPushDevice(db, 'multi', earlier)
    await register('multi', 'delayed', { enabled: false })
    const replay = await registerPushDevice(db, 'multi', earlier)
    assert.equal(replay.applied, false)
    assert.ok((await targets('multi')).every(target => target.token !== token('delayed')))
    const firstEnable = phone('first-delayed')
    await register('multi', 'first-delayed', { enabled: false })
    assert.equal((await registerPushDevice(db, 'multi', firstEnable)).applied, false)
    assert.ok((await targets('multi')).every(target => target.token !== token('first-delayed')))
  })
  await test('Queued notification cannot follow a phone into another account', async () => {
    const h = delivery(), ref = await message('account_switch', 'multi')
    await h.enqueue(ref)
    await register('switched', 'ar')
    await register('multi', 'ar', { enabled: false }) // delayed old logout
    await h.process(ref)
    assert.equal(h.requests.length, 0)
    assert.equal((await targets('switched')).length, 1)
    assert.equal((await targets('multi')).length, 0)
  })
  await test('Token rotation refreshes queued sends and tombstones old legacy token', async () => {
    await register('rotation', 'rotate')
    await db.doc('users/rotation').update({ expoPushToken: token('rotate') })
    const h = delivery(), ref = await message('rotation', 'rotation')
    await h.enqueue(ref)
    await register('rotation', 'rotate', { token: token('new') })
    await h.process(ref)
    assert.deepEqual(h.requests[0].payload.map(p => p.to), [token('new')])
    await invalidatePushTarget(db, { uid: 'rotation', deviceId: phone('rotate').deviceId, token: token('rotate') })
    assert.deepEqual((await targets('rotation')).map(t => t.token), [token('new')])
  })
  await test('A stale installation cannot disable a token transferred to another installation', async () => {
    await register('rotation', 'newinstall', { token: token('new') })
    await register('rotation', 'rotate', { enabled: false })
    assert.equal((await targets('rotation'))[0].deviceId, phone('newinstall').deviceId)
  })
  await test('An unregistered token disables only the affected phone', async () => {
    await register('errors', 'bad'); await register('errors', 'good')
    const h = delivery(), ref = await message('invalid', 'errors')
    h.replies.push([{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok', id: 'good' }])
    await h.enqueue(ref); await h.process(ref)
    assert.deepEqual((await targets('errors')).map(t => t.token), [token('good')])
  })
  await test('Deleted accounts have no push targets even with registered phones', async () => {
    await register('removed', 'removed'); await db.doc('users/removed').delete()
    assert.deepEqual(await targets('removed'), [])
  })
  await test('Legacy-only registration migrates safely on logout', async () => {
    await db.doc('users/legacy').update({ expoPushToken: token('legacy') })
    assert.equal((await targets('legacy')).length, 1)
    await register('legacy', 'legacy', { enabled: false })
    assert.deepEqual(await targets('legacy'), [])
  })
  await test('Register endpoint rejects unauthenticated, absent profiles and malformed devices', async () => {
    await assert.rejects(registerPushDevice(db, null, phone('invalid')), { code: 'unauthenticated' })
    await assert.rejects(register('removed', 'invalid'), { code: 'permission-denied' })
    await assert.rejects(register('multi', 'invalid', { deviceId: '../forged' }), { code: 'invalid-argument' })
    await assert.rejects(register('multi', 'invalid', { token: 'bad' }), { code: 'invalid-argument' })
  })
  await test('Recovery does not repeat an accepted phone after token rotation', async () => {
    await register('recovery', 'recovera'); await register('recovery', 'recoverb')
    const h = delivery(), ref = await message('recover', 'recovery')
    h.replies.push([{ status: 'ok', id: 'accepted' }, { status: 'error', details: { error: 'InvalidCredentials' } }])
    await h.enqueue(ref); await h.process(ref)
    await register('recovery', 'recovera', { token: token('recovera-new') })
    assert.equal(await h.retry(ref, 'admin'), true)
    await h.process(ref)
    assert.deepEqual(h.requests[1].payload.map(p => p.to), [token('recoverb')])
  })
  await test('Automatic absence, correction and merit include English copy', async () => {
    const record = { classe: 'TEST', seance: 'S1', date: '2026-09-05', kind: 'merite', reason: 'participation', statut: 'present' }
    const child = { prenom: 'Fixture' }
    assert.match(alertCopy('attendance', record, child, false).bodyEn, /marked absent/)
    assert.match(alertCopy('attendance', record, child, true).bodyEn, /cancelled/)
    assert.match(alertCopy('behavior', record, child, false).bodyEn, /Active participation/)
  })
  await test('Recovery preserves an unknown receipt when another phone failed', async () => {
    const h = delivery(), ref = await message('unknown_sibling', 'recovery')
    await h.enqueue(ref)
    const jobRef = db.doc(`messageDeliveryJobs/${ref.id}`), job = (await jobRef.get()).data()
    await jobRef.update({ targets: job.targets.map((target, i) => ({ ...target, state: 'failed', error: i === 0 ? 'receipt_unknown' : 'InvalidCredentials' })) })
    assert.equal(await h.retry(ref, 'admin'), true)
    await h.process(ref)
    assert.equal(h.requests[0].payload.length, 1)
    assert.equal(h.requests[0].payload[0].to, job.targets[1].token)
  })

  // ── Audit 2026-09-28, F9 : coupure différée d'une déconnexion hors ligne ──
  await Promise.all(['released', 'nextUser', 'deniedNext'].map(uid => db.doc(`users/${uid}`).set({ role: 'parent' })))
  await test('An offline logout is released later with the phone key, once', async () => {
    const { releaseKey } = await register('released', 'offline_logout')
    assert.equal(typeof releaseKey, 'string')
    const deviceId = phone('offline_logout').deviceId
    await assert.rejects(releasePushDevice(db, { deviceId, revision: ++revision, releaseKey: 'x'.repeat(43) }), { code: 'permission-denied' })
    assert.equal((await targets('released')).length, 1, 'a wrong key changes nothing')
    assert.equal((await releasePushDevice(db, { deviceId, revision: ++revision, releaseKey })).applied, true)
    assert.equal((await targets('released')).length, 0)
    await assert.rejects(releasePushDevice(db, { deviceId, revision: ++revision, releaseKey }), { code: 'permission-denied' })
  })
  await test('A late release cannot cut the notifications of the next account on the phone', async () => {
    const { releaseKey } = await register('released', 'handover')
    const staleRevision = ++revision
    await register('nextUser', 'handover')
    await assert.rejects(releasePushDevice(db, { deviceId: phone('handover').deviceId, revision: staleRevision, releaseKey }), { code: 'permission-denied' })
    assert.equal((await targets('nextUser')).length, 1)
  })
  await test('If the next account refuses notifications, the release still silences the old one', async () => {
    const { releaseKey } = await register('released', 'refused')
    const pendingRevision = ++revision
    const refused = await register('deniedNext', 'refused', { enabled: false })
    assert.equal(refused.applied, false, 'another account cannot disable this installation')
    assert.equal((await targets('released')).length, 1, 'old account still targeted before the release')
    assert.equal((await releasePushDevice(db, { deviceId: phone('refused').deviceId, revision: pendingRevision, releaseKey })).applied, true)
    assert.equal((await targets('released')).length, 0)
  })
  await test('Release input is validated before any read', async () => {
    for (const input of [null, { deviceId: '../x', revision: 1, releaseKey: 'k'.repeat(43) }, { deviceId: 'installation_valid_____', revision: 0, releaseKey: 'k'.repeat(43) }, { deviceId: 'installation_valid_____', revision: 1, releaseKey: 'short' }]) {
      await assert.rejects(releasePushDevice(db, input), { code: 'invalid-argument' })
    }
  })

  const teacher = 'offlineTeacher', now = new Date('2026-09-05T13:00:00Z')
  const slot = { day: 'saturday', startTime: '08:30', endTime: '09:30', classe: 'OFFLINE', subject: 'Test' }
  const input = { date: '2026-09-05', lessonKey: lessonKey(slot) }
  await Promise.all([
    db.doc(`users/${teacher}`).set({ role: 'professeur', classes: ['OFFLINE'] }),
    db.doc(`schedules/${teacher}`).set({ weeklySlots: [slot] }),
    db.doc('eleves/offlineA').set({ classe: 'OFFLINE', nom: 'FixtureA', prenom: 'Test', active: true }),
    db.doc('eleves/offlineB').set({ classe: 'OFFLINE', nom: 'FixtureB', prenom: 'Test', active: true }),
    db.doc('eleves/offlineArchived').set({ classe: 'OFFLINE', active: false }),
  ])
  const load = () => loadAttendance(db, teacher, input, now)
  const operation = (id, students) => ({ ...input, operationId: id.padEnd(20, '_'), rows: students.map(row => ({ id: row.id, status: row.status, baseVersion: row.baseVersion })) })
  let savedInput
  await test('Attendance loads the authorized active roster and missing record versions', async () => {
    const bundle = await load()
    assert.equal(bundle.seance, 'S1'); assert.equal(bundle.students.length, 2)
    assert.ok(bundle.students.every(row => row.status === 'present' && row.baseVersion === 'missing'))
  })
  await test('Malformed attendance rows are rejected before any write', async () => {
    for (const rows of [[null], [], [{ id: '../forged', status: 'present', baseVersion: 'missing' }]]) {
      await assert.rejects(submitAttendance(db, teacher, { ...input, operationId: 'malformed_operation', rows }, now), { code: 'invalid-argument' })
    }
  })
  await test('Offline attendance saves atomically and replay returns the original versions', async () => {
    savedInput = operation('first', (await load()).students)
    savedInput.rows[0].status = 'absent'
    const results = await Promise.all([submitAttendance(db, teacher, savedInput, now), submitAttendance(db, teacher, savedInput, now)])
    assert.equal(results.filter(result => result.replayed).length, 1)
    const bundle = await load()
    assert.equal(bundle.students[0].status, 'absent')
    assert.equal(bundle.students[0].baseVersion, results[0].versions.offlineA)
    const record = (await db.doc('absences/offlineA_2026-09-05_S1').get()).data()
    assert.equal(record.academicYear, '2026-2027')
    assert.equal(attendanceVersion(record), results[0].versions.offlineA)
  })
  await test('Reusing an operation id with different choices is refused', async () => {
    await assert.rejects(submitAttendance(db, teacher, { ...savedInput, rows: savedInput.rows.map(r => ({ ...r, status: 'retard' })) }, now), { code: 'already-exists' })
  })
  await test('Stale offline choices cannot overwrite another correction or partially write', async () => {
    const stale = operation('stale', (await load()).students)
    stale.rows[1].status = 'retard'
    await db.doc('absences/offlineA_2026-09-05_S1').update({ statut: 'present' })
    await assert.rejects(submitAttendance(db, teacher, stale, now), { code: 'failed-precondition', message: 'attendance-conflict' })
    assert.equal((await db.doc('absences/offlineB_2026-09-05_S1').get()).get('statut'), 'present')
    assert.equal((await db.doc(`attendanceOperations/${teacher}_${stale.operationId}`).get()).exists, false)
  })
  await test('Roster changes require review instead of marking new students present', async () => {
    const stale = operation('roster', (await load()).students)
    await db.doc('eleves/offlineNew').set({ classe: 'OFFLINE', active: true })
    await assert.rejects(submitAttendance(db, teacher, stale, now), { code: 'failed-precondition', message: 'attendance-roster-changed' })
    await db.doc('eleves/offlineNew').delete()
  })
  await test('Parent declaration approval remains atomic with the confirmed absence', async () => {
    await db.doc('absenceRequests/offline').set({ classe: 'OFFLINE', date: input.date, eleveId: 'offlineB', status: 'pending', reason: 'Synthetic reason' })
    const data = operation('declared', (await load()).students)
    data.rows[1].status = 'absent'
    await submitAttendance(db, teacher, data, now)
    assert.equal((await db.doc('absenceRequests/offline').get()).get('status'), 'approved')
    assert.equal((await db.doc('absences/offlineB_2026-09-05_S1').get()).get('justified'), true)
  })
  await test('A draft from the previous lesson date keeps its original date', async () => {
    const previous = { ...input, date: '2026-08-29' }
    const bundle = await loadAttendance(db, teacher, previous, new Date('2026-09-04T13:00:00Z'))
    const data = { ...operation('previous', bundle.students), date: previous.date }
    await submitAttendance(db, teacher, data, new Date('2026-09-04T13:00:00Z'))
    assert.equal((await db.doc('absences/offlineA_2026-08-29_S1').get()).get('date'), previous.date)
  })
  await test('Future, expired, wrong-day and not-started lessons are refused', async () => {
    await assert.rejects(loadAttendance(db, teacher, { ...input, date: '2026-09-12' }, now), { code: 'failed-precondition' })
    await assert.rejects(loadAttendance(db, teacher, { ...input, date: '2026-08-22' }, now), { code: 'failed-precondition' })
    await assert.rejects(loadAttendance(db, teacher, { ...input, date: '2026-09-04' }, now), { code: 'permission-denied' })
    await assert.rejects(loadAttendance(db, teacher, input, new Date('2026-09-05T06:00:00Z')), { code: 'failed-precondition' })
  })
  await test('Missing authentication, wrong role and changed assignment cannot submit attendance', async () => {
    await assert.rejects(loadAttendance(db, null, input, now), { code: 'unauthenticated' })
    await assert.rejects(loadAttendance(db, 'multi', input, now), { code: 'permission-denied' })
    const data = operation('unauthorized', (await load()).students)
    await db.doc(`users/${teacher}`).update({ classes: ['OTHER'] })
    await assert.rejects(submitAttendance(db, teacher, data, now), { code: 'permission-denied' })
    await db.doc(`users/${teacher}`).update({ role: 'parent' })
    await assert.rejects(submitAttendance(db, teacher, savedInput, now), { code: 'permission-denied' })
  })
}
