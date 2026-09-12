/** One-off repair of the confirmed test account only. Defaults to read-only. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const admin = require('firebase-admin')
const ROOT = path.resolve(__dirname, '..')
const ASSIGNED = ['1APIC-1', '2APIC-1', '3APIC-3']
const EXPECTED = [
  ['friday', '08:15', '1APIC-4'],
  ['friday', '09:15', '1APIC-3'],
  ['friday', '10:30', '1APIC-3'],
]

function validateTargets(profile, schedule, flattened, uid) {
  assert.equal(profile?.role, 'professeur', 'Unexpected account role')
  assert.deepEqual([...(profile.classes || [])].sort(), ASSIGNED, 'Assignments changed')
  assert.ok(!profile.classe || ASSIGNED.includes(profile.classe), 'Unexpected single class assignment')
  assert.ok(!schedule.teacherUid || schedule.teacherUid === uid, 'Unexpected schedule owner')
  assert.deepEqual((schedule.weeklySlots || []).map(s => [s.day, s.startTime, s.classe]).sort(),
    [...EXPECTED].sort(), 'Schedule changed; inspect before retrying')
  assert.ok(schedule.weeklySlots.every(s => !ASSIGNED.includes(s.classe)), 'Assigned class must be preserved')
  assert.equal(flattened.length, 3, 'Flattened schedule changed')
  assert.ok(flattened.every(s => s.teacherUid === uid), 'Unexpected flattened owner')
  assert.deepEqual(flattened.map(s => [s.day, s.startTime, s.classeId]).sort(),
    [...EXPECTED].sort(), 'Flattened classes changed')
}

async function main() {
  const args = process.argv.slice(2)
  assert.ok(args.every(a => a === '--commit'), 'Unknown argument')
  const commit = args.includes('--commit')
  const key = require(path.join(ROOT, '.secrets/firebase-admin.json'))
  assert.equal(key.project_id, 'mojammaa-sgs')
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  try {
    const db = app.firestore()
    const { uid } = await app.auth().getUserByEmail('test-teacher@mojammaa.com')
    const names = ['users', 'eleves', 'schedules', 'emploiDuTemps']
    const read = async () => Object.fromEntries(await Promise.all(names.map(async name =>
      [name, await db.collection(name).get()])))
    const before = await read()
    const profile = before.users.docs.find(d => d.id === uid)
    const schedule = before.schedules.docs.find(d => d.id === uid)
    assert.ok(profile && schedule, 'Target no longer exists')
    const flat = before.emploiDuTemps.docs.filter(d => d.get('teacherUid') === uid)
    validateTargets(profile.data(), schedule.data(), flat.map(d => d.data()), uid)
    for (const doc of flat) assert.equal((await doc.ref.listCollections()).length, 0, 'Nested data found')
    console.log(JSON.stringify({ mode: commit ? 'commit' : 'dry-run',
      invalidSlots: 3, flattenedRecordsToRemove: 3, preservedAssignedClasses: ASSIGNED,
      otherSchedules: before.schedules.size - 1 }))
    if (!commit) return

    const backup = path.join(ROOT, 'backups', `test-schedule-repair-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    fs.mkdirSync(backup, { mode: 0o700 })
    const body = JSON.stringify([schedule, ...flat].map(d => ({ path: d.ref.path, data: d.data() })))
    const file = path.join(backup, 'targets.json')
    fs.writeFileSync(file, body, { mode: 0o600, flag: 'wx' })
    assert.equal(fs.readFileSync(file, 'utf8'), body, 'Backup verification failed')

    await db.runTransaction(async tx => {
      const currentProfile = await tx.get(profile.ref)
      const currentSchedule = await tx.get(schedule.ref)
      const currentFlat = await tx.get(db.collection('emploiDuTemps').where('teacherUid', '==', uid))
      assert.ok(currentProfile.updateTime.isEqual(profile.updateTime), 'Profile changed')
      assert.ok(currentSchedule.updateTime.isEqual(schedule.updateTime), 'Schedule changed')
      const versions = new Map(flat.map(d => [d.id, d.updateTime]))
      assert.equal(currentFlat.size, flat.length, 'Flattened count changed')
      assert.ok(currentFlat.docs.every(d => versions.get(d.id)?.isEqual(d.updateTime)), 'Flattened data changed')
      validateTargets(currentProfile.data(), currentSchedule.data(), currentFlat.docs.map(d => d.data()), uid)
      tx.update(schedule.ref, { weeklySlots: [], updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      for (const doc of flat) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime })
    })

    const after = await read()
    const entries = (snap, filter = () => true) => snap.docs.filter(filter).map(d => [d.id, d.data()])
    for (const name of ['users', 'eleves']) assert.deepEqual(entries(after[name]), entries(before[name]), 'Protected data changed')
    assert.deepEqual(entries(after.schedules, d => d.id !== uid), entries(before.schedules, d => d.id !== uid), 'Other schedules changed')
    assert.deepEqual(entries(after.emploiDuTemps, d => d.get('teacherUid') !== uid),
      entries(before.emploiDuTemps, d => d.get('teacherUid') !== uid), 'Other timetable records changed')
    assert.deepEqual(after.schedules.docs.find(d => d.id === uid)?.get('weeklySlots'), [], 'Schedule not empty')
    assert.equal(after.emploiDuTemps.docs.filter(d => d.get('teacherUid') === uid).length, 0, 'Flattened records remain')
    console.log(JSON.stringify({ verified: true, clearedInvalidSlots: 3, deletedFlattenedRecords: 3,
      accountsStudentsAndOtherSchedulesUnchanged: true, backup }))
  } finally { await app.delete() }
}

module.exports = { validateTargets }
if (require.main === module) main().catch(error => {
  // Assertion objects may contain personal data. Never print them.
  console.error('Repair stopped:', error.code || error.name)
  process.exitCode = 1
})
