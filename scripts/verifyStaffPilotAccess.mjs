#!/usr/bin/env node
/** Vérification live anonymisée des comptes créés par provisionStaffPilot.js. */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, getFirestore, limit, query, updateDoc, where,
} from 'firebase/firestore'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
const { loadPasswords, validateManifest } = require('./provisionStaffPilot.js')
const ROOT = path.join(import.meta.dirname, '..')

function option(name) {
  const exact = process.argv.indexOf(`--${name}`)
  if (exact >= 0) return process.argv[exact + 1]
  const prefix = `--${name}=`
  const match = process.argv.find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function privateFile(input, label) {
  if (!input) throw new Error(`${label} manquant`)
  const target = path.resolve(ROOT, input)
  const stat = fs.statSync(target)
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} doit être protégé par chmod 600`)
  return target
}

async function expectDenied(action) {
  try {
    await action()
    return false
  } catch (error) {
    return error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied'
  }
}

async function clientFor(index, user, password, firebaseConfig) {
  const app = initializeApp(firebaseConfig, `staff-pilot-${index}-${Date.now()}`)
  const auth = getAuth(app)
  await signInWithEmailAndPassword(auth, user.email, password)
  return { app, auth, db: getFirestore(app), user: auth.currentUser }
}

async function main() {
  const manifestPath = privateFile(option('manifest'), 'Manifeste')
  const passwordPath = privateFile(option('password-file'), 'Fichier mot de passe')
  const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  const passwords = loadPasswords(passwordPath, manifest)
  const key = require(path.join(ROOT, '.secrets', 'firebase-admin.json'))
  const googleServices = require(path.join(ROOT, 'google-services.json'))
  const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key
  if (!apiKey || key.project_id !== manifest.projectId) throw new Error('Configuration Firebase incohérente')

  const adminApp = admin.initializeApp(
    { credential: admin.credential.cert(key), projectId: key.project_id },
    `verify-staff-pilot-${Date.now()}`,
  )
  const adminDb = admin.firestore(adminApp)
  const clients = []
  const checks = {
    passwordLogins: 0,
    ownProfileAllowed: false,
    ownScheduleAllowed: false,
    otherProfileDenied: false,
    otherScheduleDenied: false,
    syntheticClassAllowedAndEmpty: false,
    realClassDenied: false,
    adminReadsTeacher: false,
    adminNotSuperadmin: false,
    adminAuditDenied: false,
    adminRoleChangeDenied: false,
  }

  try {
    const firebaseConfig = {
      apiKey,
      authDomain: `${manifest.projectId}.firebaseapp.com`,
      projectId: manifest.projectId,
    }
    for (const user of manifest.users) {
      const client = await clientFor(user.index, user, passwords.get(user.email), firebaseConfig)
      clients.push(client)
      checks.passwordLogins += 1
    }

    const teacherUsers = manifest.users.filter(user => user.role === 'professeur')
    const adminUsers = manifest.users.filter(user => user.role === 'admin')
    if (teacherUsers.length < 2 || adminUsers.length < 1) throw new Error('Manifeste insuffisant pour la preuve d’accès')
    const teacher = teacherUsers[0]
    const otherTeacher = teacherUsers[1]
    const adminUser = adminUsers[0]
    const teacherClient = clients[manifest.users.indexOf(teacher)]
    const adminClient = clients[manifest.users.indexOf(adminUser)]
    const otherTeacherClient = clients[manifest.users.indexOf(otherTeacher)]
    const teacherUid = teacherClient.user.uid
    const otherTeacherUid = otherTeacherClient.user.uid

    checks.ownProfileAllowed = (await getDoc(doc(teacherClient.db, 'users', teacherUid))).exists()
    checks.ownScheduleAllowed = (await getDoc(doc(teacherClient.db, 'schedules', teacherUid))).exists()
    checks.otherProfileDenied = await expectDenied(() => getDoc(doc(teacherClient.db, 'users', otherTeacherUid)))
    checks.otherScheduleDenied = await expectDenied(() => getDoc(doc(teacherClient.db, 'schedules', otherTeacherUid)))
    const syntheticStudents = await getDocs(query(
      collection(teacherClient.db, 'eleves'), where('classe', '==', teacher.testClass),
    ))
    checks.syntheticClassAllowedAndEmpty = syntheticStudents.empty
    checks.realClassDenied = await expectDenied(() => getDocs(query(
      collection(teacherClient.db, 'eleves'), where('classe', '==', '1APIC-3'),
    )))

    checks.adminReadsTeacher = (await getDoc(doc(adminClient.db, 'users', teacherUid))).exists()
    const superadmins = await adminDb.collection('config').doc('superadmins').get()
    const superadminData = superadmins.exists ? superadmins.data() : {}
    const superUids = Array.isArray(superadminData.uids) ? superadminData.uids : []
    const superEmails = Array.isArray(superadminData.emails)
      ? superadminData.emails.map(value => String(value).toLowerCase())
      : []
    checks.adminNotSuperadmin = !superUids.includes(adminClient.user.uid)
      && !superEmails.includes(adminUser.email)
    checks.adminAuditDenied = await expectDenied(() => getDocs(query(
      collection(adminClient.db, 'auditLog'), limit(1),
    )))
    checks.adminRoleChangeDenied = await expectDenied(() => updateDoc(
      doc(adminClient.db, 'users', teacherUid), { role: 'admin' },
    ))
    if (!checks.adminRoleChangeDenied) {
      await adminDb.collection('users').doc(teacherUid).update({ role: 'professeur' })
    }

    const passed = checks.passwordLogins === manifest.users.length
      && Object.entries(checks).filter(([key]) => key !== 'passwordLogins').every(([, value]) => value === true)
    console.log(JSON.stringify({ status: passed ? 'PASS' : 'FAIL', checks }, null, 2))
    if (!passed) process.exitCode = 1
  } finally {
    for (const client of clients) {
      try { await signOut(client.auth) } catch {}
      try { await deleteApp(client.app) } catch {}
    }
    await adminApp.delete()
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', error: error?.code || error?.message || 'unknown' }))
  process.exit(1)
})
