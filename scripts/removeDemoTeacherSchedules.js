/** Scoped demo timetable cleanup. Read-only unless --commit is supplied. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const admin = require('firebase-admin')
const ROOT = path.resolve(__dirname, '..')
const TARGETS = ['schedules', 'emploiDuTemps']
const PRESERVE = ['users', 'classes', 'eleves']

async function main() {
  const args = process.argv.slice(2)
  assert.ok(args.every(a => a === '--commit' || /^--expect=\d+,\d+$/.test(a)), 'Unknown option')
  const commit = args.includes('--commit')
  const expected = args.find(a => a.startsWith('--expect='))?.slice(9).split(',').map(Number)
  if (commit) assert.equal(expected?.length, 2, 'Exact target counts required')
  const key = require(path.join(ROOT, '.secrets/firebase-admin.json'))
  assert.equal(key.project_id, 'mojammaa-sgs')
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  const db = app.firestore()
  const read = async names => Object.fromEntries(await Promise.all(names.map(async name =>
    [name, await db.collection(name).get()])))
  try {
    const before = await read([...TARGETS, ...PRESERVE])
    const roles = new Map(before.users.docs.map(d => [d.id, d.get('role')]))
    const historicalUsers = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'backups/firestore-20260910-185928/users.json'), 'utf8'))
    const historicalRoles = new Map(historicalUsers.map(d => [d.__id, d.role]))
    const counts = TARGETS.map(name => before[name].size)
    const documents = TARGETS.flatMap(name => before[name].docs)
    const owners = new Set(before.schedules.docs.map(d => d.id))
    for (const doc of before.schedules.docs) {
      assert.equal(roles.get(doc.id) || historicalRoles.get(doc.id), 'professeur', 'Unexpected schedule owner')
    }
    for (const doc of before.emploiDuTemps.docs) {
      assert.ok(owners.has(doc.get('teacherUid')) || roles.get(doc.get('teacherUid')) === 'professeur',
        'Unresolved timetable owner')
    }
    for (const doc of documents) assert.equal((await doc.ref.listCollections()).length, 0, 'Nested data found')
    assert.ok(documents.length <= 450, 'Too many targets for one atomic deletion')
    console.log(JSON.stringify({ mode: commit ? 'commit' : 'dry-run',
      targets: Object.fromEntries(TARGETS.map((name, i) => [name, counts[i]])),
      preserved: Object.fromEntries(PRESERVE.map(name => [name, before[name].size])) }))
    if (!commit) return
    assert.deepEqual(counts, expected, 'Target counts changed')
    if (!documents.length) return
    const backup = path.join(ROOT, 'backups', `demo-schedules-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    fs.mkdirSync(backup, { mode: 0o700 })
    for (const name of [...TARGETS, ...PRESERVE]) {
      const body = JSON.stringify(before[name].docs.map(d => ({ __id: d.id, ...d.data() })))
      const file = path.join(backup, `${name}.json`)
      fs.writeFileSync(file, body, { mode: 0o600, flag: 'wx' })
      assert.equal(fs.readFileSync(file, 'utf8'), body, 'Backup verification failed')
    }
    await db.runTransaction(async tx => {
      for (const name of TARGETS) {
        const current = await tx.get(db.collection(name))
        assert.equal(current.size, before[name].size, 'Targets changed')
        const versions = new Map(before[name].docs.map(d => [d.id, d.updateTime]))
        assert.ok(current.docs.every(d => versions.get(d.id)?.isEqual(d.updateTime)), 'Targets changed')
      }
      for (const doc of documents) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime })
    })
    const after = await read([...TARGETS, ...PRESERVE])
    for (const name of TARGETS) assert.equal(after[name].size, 0, 'Schedule cleanup incomplete')
    for (const name of PRESERVE) {
      assert.deepEqual(after[name].docs.map(d => [d.id, d.data()]),
        before[name].docs.map(d => [d.id, d.data()]), 'Protected records changed')
    }
    console.log(JSON.stringify({ verified: true, deleted: documents.length, backup,
      remaining: Object.fromEntries(TARGETS.map(name => [name, after[name].size])),
      accountsAndClassesAndStudentsUnchanged: true }))
  } finally { await app.delete() }
}
main().catch(error => {
  // Assertions may contain personal data: report only the error classification.
  console.error('Cleanup stopped:', error.code || error.name,
    error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : '')
  process.exitCode = 1
})
