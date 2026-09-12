#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { slotId } = require('../../functions/emploiDuTempsSync')
const { ASSIGNMENTS } = require('./applyNamedTeacherAssignments')

const ROOT = path.join(__dirname, '..', '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const SNAPSHOT_PATH = path.join(ROOT, '.secrets', 'named-teacher-schedules.snapshot.json')
const PROJECT_ID = 'mojammaa-sgs'
const TIMES = {
  'oumaimabenyachrak@gmail.com': ['08:00', '09:00', '10:00', '11:00'],
  'elguennouniabdossalam@gmail.com': ['11:30', '12:30', '14:30', '15:30'],
  'loubna.elfaqyri@gmail.com': ['12:00', '13:00', '15:00', '16:00'],
}
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

function parseArgs(argv) {
  const out = { commit: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--commit') out.commit = true
    else if (argv[i] === '--confirm-project') out.confirmProject = argv[++i]
    else if (argv[i].startsWith('--confirm-project=')) out.confirmProject = argv[i].slice(18)
    else throw new Error(`Option inconnue : ${argv[i]}`)
  }
  return out
}

function addHour(time) {
  const [hour, minute] = time.split(':').map(Number)
  return `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function buildSchedule(assignment) {
  const times = TIMES[assignment.email]
  return DAYS.flatMap((day, dayIndex) => times.map((startTime, slotIndex) => ({
    day, startTime, endTime: addHour(startTime), durationMin: 60,
    seance: `S${slotIndex + 1}`,
    classe: assignment.classes[(dayIndex * times.length + slotIndex) % assignment.classes.length],
    subject: assignment.matiere, room: `Salle ${20 + slotIndex}`,
  })))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.commit && options.confirmProject !== PROJECT_ID) throw new Error('Confirmation projet absente ou incorrecte')
  const admin = require('firebase-admin')
  const key = require(KEY_PATH)
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT_ID })
  const auth = admin.auth(app)
  const db = admin.firestore(app)
  try {
    const rows = []
    for (const assignment of ASSIGNMENTS.filter(row => row.role === 'professeur')) {
      const user = await auth.getUserByEmail(assignment.email)
      const schedule = await db.collection('schedules').doc(user.uid).get()
      const weeklySlots = buildSchedule(assignment)
      for (const slot of weeklySlots) {
        const existing = await db.collection('emploiDuTemps').doc(slotId(slot.classe, slot.day, slot.startTime)).get()
        if (existing.exists && existing.get('teacherUid') !== user.uid) throw new Error(`Collision EDT pour ${assignment.email}`)
      }
      rows.push({ assignment, user, schedule, weeklySlots })
    }
    if (!options.commit) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', project: PROJECT_ID, teachers: rows.map(row => ({ classes: row.assignment.classes.length, weeklySlots: row.weeklySlots.length, previousSlots: (row.schedule.get('weeklySlots') || []).length })), status: 'PASS' }, null, 2))
      return
    }
    if (fs.existsSync(SNAPSHOT_PATH)) throw new Error('Snapshot de schedules existant : opération arrêtée')
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ projectId: PROJECT_ID, createdAt: new Date().toISOString(), schedules: rows.map(row => ({ uid: row.user.uid, email: row.assignment.email, weeklySlots: row.schedule.get('weeklySlots') || [] })) }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.chmodSync(SNAPSHOT_PATH, 0o600)
    const batch = db.batch()
    rows.forEach(row => batch.set(db.collection('schedules').doc(row.user.uid), {
      uid: row.user.uid, teacherUid: row.user.uid, weeklySlots: row.weeklySlots,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }))
    await batch.commit()
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      const checks = await Promise.all(rows.map(row => db.collection('emploiDuTemps').where('teacherUid', '==', row.user.uid).get()))
      if (checks.every((snap, index) => snap.size === rows[index].weeklySlots.length)) {
        console.log(JSON.stringify({ mode: 'COMMIT', project: PROJECT_ID, teachers: rows.length, weeklySlots: rows.reduce((sum, row) => sum + row.weeklySlots.length, 0), projectedSlots: checks.reduce((sum, snap) => sum + snap.size, 0), status: 'PASS' }, null, 2))
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Projection emploiDuTemps non synchronisée dans le délai prévu')
  } finally { await app.delete() }
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'FAIL', error: error.message })); process.exit(1) })

module.exports = { buildSchedule, parseArgs }
