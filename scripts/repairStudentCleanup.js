/** Repair the September 2026 cleanup. Dry-run by default; no Auth writes. */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const admin = require('firebase-admin')
const { computeSchoolStats } = require('../functions/schoolStats')
const { moroccoParts } = require('../functions/lib/moroccoTime')
const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'backups/firestore-20260910-185928')
const RESTORE = ['ressources', 'pushDevices', 'pushTokenOwners']
const COLLECTIONS = ['eleves', 'users', 'messages', 'messageDeliveryJobs', 'stats',
  'notes', 'absences', 'devoirs', 'homeworkSubmissions', 'settings', ...RESTORE]

function revive(value) {
  if (Array.isArray(value)) return value.map(revive)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 2 && keys.includes('_seconds') && keys.includes('_nanoseconds')) {
      return new admin.firestore.Timestamp(value._seconds, value._nanoseconds)
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]))
  }
  return value
}
function mentions(value, ids) {
  if (typeof value === 'string') return ids.has(value)
  if (Array.isArray(value)) return value.some(v => mentions(v, ids))
  return !!value && typeof value === 'object' && Object.values(value).some(v => mentions(v, ids))
}
function periodFor(date) {
  const p = moroccoParts(date)
  const year = Number(p.year)
  const month = Number(p.month)
  const start = month >= 9 ? year : year - 1
  return { academicYear: `${start}-${start + 1}`, semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${year}-${String(month).padStart(2, '0')}` }
}
function summarize(live, period) {
  const rows = name => live[name].docs.map(d => ({ id: d.id, ...d.data() }))
  const start = Number(period.academicYear.slice(0, 4))
  const years = [period.academicYear, `${start + 1}-${start + 2}`]
  return computeSchoolStats({ eleves: rows('eleves'), users: rows('users'),
    notes: rows('notes').filter(d => d.academicYear === period.academicYear && d.semestre === period.semestre),
    absences: rows('absences').filter(d => d.academicYear === period.academicYear && d.monthKey === period.monthKey),
    devoirs: rows('devoirs').filter(d => years.includes(d.academicYear)),
    coefficients: live.settings.docs.find(d => d.id === 'coefficients')?.data() || null,
  })
}
const kpis = s => Object.fromEntries(['totalEleves', 'totalClasses', 'totalTeachers', 'totalParents',
  'notesCount', 'avgNote', 'activeHomework', 'studentsToFollow'].map(k => [k, s[k] ?? null]))

async function main() {
  const commit = process.argv.includes('--commit')
  const key = require(path.join(ROOT, '.secrets/firebase-admin.json'))
  assert.equal(key.project_id, 'mojammaa-sgs', 'Project mismatch')
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  const db = app.firestore()
  const read = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async name =>
    [name, await db.collection(name).get()])))
  try {
    const live = await read()
    const saved = name => JSON.parse(fs.readFileSync(path.join(SOURCE, `${name}.json`), 'utf8'))
    assert.equal(live.eleves.size, 247, 'Unexpected student count')
    const ids = new Set(live.eleves.docs.map(d => d.id))
    const userIds = new Set(live.users.docs.map(d => d.id))
    const removed = new Set(saved('eleves').filter(d => !ids.has(d.__id))
      .flatMap(d => [d.__id, d.codeMassar]).filter(Boolean))
    saved('users').filter(d => d.role === 'parent' && !userIds.has(d.__id)).forEach(d => removed.add(d.__id))
    const messages = live.messages.docs.filter(d => mentions(d.data(), removed))
    const messageIds = new Set(messages.map(d => d.id))
    const jobs = live.messageDeliveryJobs.docs.filter(d => messageIds.has(d.id) || mentions(d.data(), removed))
    const edits = live.eleves.docs.map(doc => {
      const data = doc.data(), fields = ['parentNom', 'demo'].filter(k => Object.hasOwn(data, k))
      if (typeof data.importedBy === 'string' && /demo/i.test(data.importedBy)) fields.push('importedBy')
      return { doc, fields }
    }).filter(e => e.fields.length)
    const restores = []
    const preservedExisting = {}
    for (const name of RESTORE) {
      const existing = new Set(live[name].docs.map(d => d.id))
      preservedExisting[name] = 0
      for (const record of saved(name)) {
        const { __id, ...raw } = record
        if (existing.has(__id)) { preservedExisting[name]++; continue }
        const data = revive(raw)
        const uid = name === 'ressources' ? data.teacherId : data.uid
        assert.ok(userIds.has(uid), 'Restore owner missing')
        if (name !== 'ressources') {
          const role = live.users.docs.find(d => d.id === uid).get('role')
          assert.ok(['professeur', 'admin'].includes(role), 'Unexpected notification owner')
          const peer = name === 'pushDevices'
            ? live.pushTokenOwners.docs.find(d => d.get('deviceId') === data.deviceId)
            : live.pushDevices.docs.find(d => d.id === data.deviceId)
          // A newer device registration must never be rolled back from backup.
          assert.ok(!peer, 'New notification registration: reconcile before restoring')
        }
        restores.push({ ref: db.collection(name).doc(__id), data, collection: name })
      }
    }
    for (const doc of [...messages, ...jobs]) {
      assert.equal((await doc.ref.listCollections()).length, 0, 'Nested message records require scoped backup')
    }
    const period = periodFor(new Date())
    const summary = summarize(live, period)
    assert.equal(summary.totalEleves, 247)
    assert.equal(summary.totalParents, 0)
    assert.equal(summary.notesCount, 0)
    assert.equal(summary.avgNote, null)
    const plan = { messagesToDelete: messages.length, deliveryJobsToDelete: jobs.length,
      studentFieldsToRemove: Object.fromEntries(['parentNom', 'demo', 'importedBy'].map(k =>
        [k, edits.filter(e => e.fields.includes(k)).length])),
      restore: Object.fromEntries(RESTORE.map(c => [c, restores.filter(r => r.collection === c).length])),
      preservedExisting, summaryBefore: kpis(live.stats.docs.find(d => d.id === 'summary')?.data() || {}),
      summaryAfter: kpis(summary) }
    console.log(JSON.stringify({ mode: commit ? 'commit' : 'dry-run', ...plan }, null, 2))
    if (!commit) return
    const backup = path.join(ROOT, 'backups', `cleanup-repair-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    fs.mkdirSync(backup, { mode: 0o700 })
    for (const [name, snap] of Object.entries(live)) {
      const body = JSON.stringify(snap.docs.map(d => ({ __id: d.id, ...d.data() })))
      const file = path.join(backup, `${name}.json`)
      fs.writeFileSync(file, body, { mode: 0o600, flag: 'wx' })
      assert.equal(fs.readFileSync(file, 'utf8'), body, 'Backup verification failed')
    }
    fs.writeFileSync(path.join(backup, 'plan.json'), JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' })
    const statsDoc = live.stats.docs.find(d => d.id === 'summary')
    // Replace the whole summary to remove obsolete nested statistics too.
    await db.runTransaction(async tx => {
      for (const name of ['eleves', 'users', 'notes', 'absences', 'devoirs', 'settings']) {
        const snap = await tx.get(db.collection(name))
        assert.equal(snap.size, live[name].size, 'Data changed since plan')
        const versions = new Map(live[name].docs.map(d => [d.id, d.updateTime]))
        assert.ok(snap.docs.every(d => versions.get(d.id)?.isEqual(d.updateTime)), 'Data changed since plan')
      }
      const nowStats = await tx.get(db.doc('stats/summary'))
      assert.ok(!statsDoc || nowStats.updateTime?.isEqual(statsDoc.updateTime), 'Summary changed since plan')
      for (const doc of [...jobs, ...messages]) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime })
      for (const { doc, fields } of edits) tx.update(doc.ref,
        Object.fromEntries(fields.map(k => [k, admin.firestore.FieldValue.delete()])), { lastUpdateTime: doc.updateTime })
      for (const row of restores) tx.create(row.ref, row.data)
      tx.set(db.doc('stats/summary'), { ...summary, ...period, updatedAt: new Date() })
    })
    const after = await read()
    assert.equal(after.eleves.size, 247)
    assert.ok(after.messages.docs.every(d => !mentions(d.data(), removed)))
    assert.ok(after.messageDeliveryJobs.docs.every(d => !mentions(d.data(), removed) && !messageIds.has(d.id)))
    assert.ok(after.eleves.docs.every(d => !Object.hasOwn(d.data(), 'demo') && !Object.hasOwn(d.data(), 'parentNom')))
    for (const doc of live.eleves.docs) {
      const expected = { ...doc.data() }
      const edit = edits.find(e => e.doc.id === doc.id)
      for (const field of edit?.fields || []) delete expected[field]
      assert.deepEqual(after.eleves.docs.find(d => d.id === doc.id)?.data(), expected, 'Student preservation failed')
    }
    for (const row of restores) {
      const doc = after[row.collection].docs.find(d => d.id === row.ref.id)
      assert.deepEqual(doc?.data(), row.data, 'Restored document differs')
    }
    for (const c of ['users', 'notes', 'absences', 'devoirs', 'homeworkSubmissions', 'settings']) {
      assert.deepEqual(after[c].docs.map(d => [d.id, d.data()]), live[c].docs.map(d => [d.id, d.data()]))
    }
    const final = after.stats.docs.find(d => d.id === 'summary').data()
    const { updatedAt, ...persisted } = final
    assert.deepEqual(persisted, { ...summarize(after, period), ...period }, 'Summary mismatch')
    const counts = Object.fromEntries(RESTORE.map(c => [c, after[c].size]))
    console.log(JSON.stringify({ verified: true, backup, remainingMessages: after.messages.size,
      remainingDeliveryJobs: after.messageDeliveryJobs.size, restoredCollections: counts, stats: kpis(final) }, null, 2))
  } finally { await app.delete() }
}
module.exports = { revive, mentions, periodFor }
if (require.main === module) main().catch(error => {
  console.error('Repair stopped:', error.code || error.name)
  // Do not print assertion actual/expected values: they can contain PII.
  process.exitCode = 1
})
