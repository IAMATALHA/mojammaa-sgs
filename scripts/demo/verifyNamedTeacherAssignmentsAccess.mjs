#!/usr/bin/env node
/** Preuve live des affectations : accès aux classes propres, refus hors périmètre. */
import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ASSIGNMENTS } = require('./applyNamedTeacherAssignments.js')
const ROOT = path.join(import.meta.dirname, '..', '..')
const serviceAccount = require(path.join(ROOT, '.secrets', 'firebase-admin.json'))
const googleServices = require(path.join(ROOT, 'google-services.json'))
const credentialFile = path.join(ROOT, '.secrets', 'named-teacher-temporary-passwords.json')
const credentials = require(fs.existsSync(credentialFile) ? credentialFile : path.join(ROOT, '.secrets', 'staff-pilot-2026-09-01.credentials.json')).passwords
const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key

async function denied(action) {
  try { await action(); return false } catch (error) { return error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied' }
}

async function main() {
  if (!apiKey || serviceAccount.project_id !== 'mojammaa-sgs') throw new Error('Configuration Firebase incohérente')
  const config = { apiKey, authDomain: 'mojammaa-sgs.firebaseapp.com', projectId: 'mojammaa-sgs' }
  const clients = []
  const checks = []
  try {
    for (const assignment of ASSIGNMENTS.filter(row => row.role === 'professeur')) {
      const app = initializeApp(config, `verify-named-${assignment.email}-${Date.now()}`)
      const auth = getAuth(app)
      await signInWithEmailAndPassword(auth, assignment.email, credentials[assignment.email])
      const db = getFirestore(app)
      clients.push({ app, auth })
      const uid = auth.currentUser.uid
      const profile = await getDoc(doc(db, 'users', uid))
      const data = profile.data() || {}
      if (JSON.stringify(data.classes || []) !== JSON.stringify(assignment.classes) || data.matiere !== assignment.matiere) throw new Error(`Profil non conforme pour ${assignment.email}`)
      const counts = {}
      for (const classe of assignment.classes) counts[classe] = (await getDocs(query(collection(db, 'eleves'), where('classe', '==', classe)))).size
      const deniedClass = assignment.classes[0].startsWith('1APIC') ? '3APIC-4' : '1APIC-1'
      const deniedAccess = await denied(() => getDocs(query(collection(db, 'eleves'), where('classe', '==', deniedClass))))
      checks.push({ role: 'professeur', classes: assignment.classes.length, studentsInAssignedClasses: Object.values(counts).reduce((a, b) => a + b, 0), deniedOutsideClass: deniedAccess })
      if (!deniedAccess) throw new Error(`Accès hors périmètre accepté pour ${assignment.email}`)
    }
    const admin = require('firebase-admin')
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'mojammaa-sgs' }, 'verify-named-admin')
    const authUser = await admin.auth(app).getUserByEmail('idrissihabiba11@gmail.com')
    const profile = await admin.firestore(app).collection('users').doc(authUser.uid).get()
    const superadmins = await admin.firestore(app).collection('config').doc('superadmins').get()
    const isSuperadmin = profile.get('role') === 'admin' && (superadmins.get('uids') || []).includes(authUser.uid)
    checks.push({ role: 'admin', generalDirector: profile.get('fonction') === 'Directrice générale', superadmin: isSuperadmin })
    if (!isSuperadmin) throw new Error('Profil de direction non présent dans superadmins')
    console.log(JSON.stringify({ status: 'PASS', checks }, null, 2))
  } finally {
    for (const client of clients) { try { await signOut(client.auth) } catch {} try { await deleteApp(client.app) } catch {} }
  }
}

main().catch(error => { console.error(JSON.stringify({ status: 'FAIL', error: error?.message || 'unknown' })); process.exit(1) })
