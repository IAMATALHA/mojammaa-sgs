#!/usr/bin/env node
/** Affectations réelles des comptes enseignants fournis par la direction. */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const SNAPSHOT_PATH = path.join(ROOT, '.secrets', 'named-teacher-assignments.snapshot.json')
const PROJECT_ID = 'mojammaa-sgs'
const ASSIGNMENTS = [
  {
    email: 'oumaimabenyachrak@gmail.com', nom: 'Benyachraque', prenom: 'Oumaima',
    role: 'professeur', matiere: 'Physique-Chimie', cycle: 'college',
    classes: ['1APIC-1', '1APIC-2', '1APIC-3', '1APIC-4', '2APIC-1', '2APIC-2', '2APIC-3', '2APIC-4'],
  },
  {
    email: 'elguennouniabdossalam@gmail.com', nom: 'Elguennouni', prenom: 'Abdossalam',
    role: 'professeur', matiere: 'Mathématiques', cycle: 'college',
    classes: ['3APIC-1', '3APIC-2', '3APIC-3', '3APIC-4'],
  },
  {
    email: 'loubna.elfaqyri@gmail.com', nom: 'El Faqyri', prenom: 'Loubna',
    role: 'professeur', matiere: 'Mathématiques', cycle: 'college',
    classes: ['1APIC-3', '1APIC-4', '2APIC-3', '2APIC-4'],
  },
  {
    email: 'idrissihabiba11@gmail.com', nom: 'Idrissi', prenom: 'Habiba',
    role: 'admin', fonction: 'Directrice générale', classes: [],
  },
]

function parseArgs(argv) {
  const out = { commit: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--commit') out.commit = true
    else if (arg === '--confirm-project') out.confirmProject = argv[++i]
    else if (arg.startsWith('--confirm-project=')) out.confirmProject = arg.slice(18)
    else if (arg === '--confirm-teachers') out.confirmTeachers = Number(argv[++i])
    else if (arg.startsWith('--confirm-teachers=')) out.confirmTeachers = Number(arg.slice(19))
    else throw new Error(`Option inconnue : ${arg}`)
  }
  return out
}

function assertSchoolClass(classe) {
  if (!/^[123]APIC-[1-4]$/.test(classe)) throw new Error(`Classe collège hors catalogue : ${classe}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(KEY_PATH)) throw new Error('Clé Firebase Admin introuvable')
  if (options.commit && (options.confirmProject !== PROJECT_ID || options.confirmTeachers !== ASSIGNMENTS.length)) {
    throw new Error('Confirmation projet/professeurs absente ou incorrecte')
  }
  ASSIGNMENTS.filter(x => x.role === 'professeur').flatMap(x => x.classes).forEach(assertSchoolClass)
  const admin = require('firebase-admin')
  const key = require(KEY_PATH)
  if (key.project_id !== PROJECT_ID) throw new Error('Projet Firebase inattendu')
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT_ID })
  const auth = admin.auth(app)
  const db = admin.firestore(app)
  try {
    const resolved = []
    for (const assignment of ASSIGNMENTS) {
      const authUser = await auth.getUserByEmail(assignment.email)
      const profile = await db.collection('users').doc(authUser.uid).get()
      if (!profile.exists) throw new Error(`Profil Firestore absent pour ${assignment.email}`)
      if (assignment.role === 'professeur' && profile.get('role') !== 'professeur') throw new Error(`Rôle inattendu pour ${assignment.email}`)
      if (assignment.role === 'admin' && profile.get('role') !== 'admin') throw new Error(`Rôle admin inattendu pour ${assignment.email}`)
      resolved.push({ assignment, authUser, profile })
    }
    const summary = resolved.map(({ assignment, authUser, profile }) => ({
      email: assignment.email, uid: authUser.uid, role: assignment.role,
      previousClasses: profile.get('classes') || [], classes: assignment.classes,
      previousMatiere: profile.get('matiere') || null, matiere: assignment.matiere || null,
    }))
    if (!options.commit) {
      console.log(JSON.stringify({ mode: 'DRY_RUN', project: PROJECT_ID, teachers: summary, status: 'PASS' }, null, 2))
      return
    }
    if (fs.existsSync(SNAPSHOT_PATH)) throw new Error('Snapshot existant : opération arrêtée pour éviter un écrasement')
    const saRef = db.collection('config').doc('superadmins')
    const sa = await saRef.get()
    const saData = sa.exists ? sa.data() : {}
    const snapshot = {
      projectId: PROJECT_ID, createdAt: new Date().toISOString(),
      profiles: resolved.map(({ assignment, authUser, profile }) => ({
        uid: authUser.uid, email: assignment.email, data: profile.data(),
      })),
      superadmins: { uids: saData.uids || [], emails: saData.emails || [] },
    }
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    fs.chmodSync(SNAPSHOT_PATH, 0o600)
    const batch = db.batch()
    for (const { assignment, authUser, profile } of resolved) {
      const data = {
        uid: authUser.uid, email: authUser.email, role: assignment.role,
        nom: assignment.nom, prenom: assignment.prenom,
        classes: assignment.classes, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
      if (assignment.role === 'professeur') Object.assign(data, { matiere: assignment.matiere, cycle: assignment.cycle, classe: assignment.classes[0] })
      else Object.assign(data, { fonction: assignment.fonction })
      batch.set(profile.ref, data, { merge: true })
      await auth.updateUser(authUser.uid, { displayName: `${assignment.prenom} ${assignment.nom}` })
    }
    const target = resolved.find(row => row.assignment.email === 'idrissihabiba11@gmail.com').authUser
    const uids = [...new Set([...(saData.uids || []), target.uid])]
    const emails = [...new Set([...(saData.emails || []), target.email])]
    batch.set(saRef, { uids, emails, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    await batch.commit()
    console.log(JSON.stringify({ mode: 'COMMIT', project: PROJECT_ID, teachers: summary, superadmin: true, status: 'PASS' }, null, 2))
  } finally {
    await app.delete()
  }
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'FAIL', error: error.message })); process.exit(1) })

module.exports = { ASSIGNMENTS, parseArgs }
