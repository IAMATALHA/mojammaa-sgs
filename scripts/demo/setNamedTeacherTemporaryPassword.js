#!/usr/bin/env node
/** Set a temporary password and force a password change on first login. */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const { ASSIGNMENTS } = require('./applyNamedTeacherAssignments')

const ROOT = path.join(__dirname, '..', '..')
const PROJECT_ID = 'mojammaa-sgs'
const TEMP_PASSWORD = 'mojammaa1234'
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const SNAPSHOT_PATH = path.join(ROOT, '.secrets', 'named-teacher-password.snapshot.json')
const CREDENTIALS_PATH = path.join(ROOT, '.secrets', 'named-teacher-temporary-passwords.json')

function parseArgs(argv) {
  const out = { commit: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--commit') out.commit = true
    else if (argv[i] === '--confirm-project') out.confirmProject = argv[++i]
    else if (argv[i].startsWith('--confirm-project=')) out.confirmProject = argv[i].slice(18)
    else if (argv[i] === '--confirm-teachers') out.confirmTeachers = Number(argv[++i])
    else if (argv[i].startsWith('--confirm-teachers=')) out.confirmTeachers = Number(argv[i].slice(19))
    else throw new Error(`Option inconnue : ${argv[i]}`)
  }
  return out
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const targets = ASSIGNMENTS.filter(row => row.email)
  if (options.commit && (options.confirmProject !== PROJECT_ID || options.confirmTeachers !== targets.length)) throw new Error('Confirmation projet ou nombre de comptes incorrect')
  const app = admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)), projectId: PROJECT_ID }, 'set-named-temp-password')
  const auth = admin.auth(app)
  const db = admin.firestore(app)
  try {
    const rows = []
    for (const assignment of targets) {
      const user = await auth.getUserByEmail(assignment.email)
      const profile = await db.collection('users').doc(user.uid).get()
      if (!profile.exists || !['professeur', 'admin'].includes(profile.get('role'))) throw new Error(`Profil non conforme pour ${assignment.email}`)
      rows.push({ assignment, user, profile })
    }
    if (!options.commit) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', project: PROJECT_ID, accounts: rows.map(row => ({ email: row.assignment.email, alreadyForced: row.profile.get('mustChangePassword') === true })), status: 'PASS' }, null, 2))
      return
    }
    if (fs.existsSync(SNAPSHOT_PATH)) throw new Error('Snapshot de mots de passe existant : opération arrêtée')
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ projectId: PROJECT_ID, createdAt: new Date().toISOString(), profiles: rows.map(row => ({ uid: row.user.uid, email: row.assignment.email, mustChangePassword: row.profile.get('mustChangePassword') || false })) }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.chmodSync(SNAPSHOT_PATH, 0o600)
    for (const row of rows) {
      await auth.updateUser(row.user.uid, { password: TEMP_PASSWORD })
      await db.collection('users').doc(row.user.uid).set({ mustChangePassword: true, temporaryPasswordIssuedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    }
    const credentials = fs.existsSync(CREDENTIALS_PATH) ? JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')) : { projectId: PROJECT_ID, passwords: {} }
    credentials.projectId = PROJECT_ID
    credentials.passwords = credentials.passwords || {}
    rows.forEach(row => { credentials.passwords[row.assignment.email] = TEMP_PASSWORD })
    fs.writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
    fs.chmodSync(CREDENTIALS_PATH, 0o600)
    console.log(JSON.stringify({ mode: 'COMMIT', project: PROJECT_ID, accounts: rows.length, forcedChange: rows.length, status: 'PASS' }, null, 2))
  } finally { await app.delete() }
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'FAIL', error: error.message })); process.exit(1) })

module.exports = { parseArgs }
