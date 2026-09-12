#!/usr/bin/env node
/**
 * Preuve live anonymisée de la démo professeur : chaque compte pilote peut
 * lire son propre jeu de données et ne peut pas lire celui d'un collègue.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'

const require = createRequire(import.meta.url)
const { loadPasswords, validateManifest } = require('../provisionStaffPilot.js')
const { ANCHOR_DATE, STUDENTS_PER_CLASS, periodForISO } = require('./seedStaffPilotDemo.js')
const ROOT = path.join(import.meta.dirname, '..', '..')

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

async function main() {
  const manifestPath = privateFile(option('manifest'), 'Manifeste')
  const passwordPath = privateFile(option('password-file'), 'Fichier mot de passe')
  const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  const passwords = loadPasswords(passwordPath, manifest)
  const teachers = manifest.users.filter(user => user.role === 'professeur')
  const serviceAccount = require(path.join(ROOT, '.secrets', 'firebase-admin.json'))
  const googleServices = require(path.join(ROOT, 'google-services.json'))
  const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key
  if (!apiKey || serviceAccount.project_id !== manifest.projectId) throw new Error('Configuration Firebase incohérente')

  const period = periodForISO(ANCHOR_DATE)
  const firebaseConfig = {
    apiKey,
    authDomain: `${manifest.projectId}.firebaseapp.com`,
    projectId: manifest.projectId,
  }
  const clients = []
  const totals = {
    logins: 0,
    students: 0,
    notes: 0,
    absences: 0,
    behaviors: 0,
    homework: 0,
    resources: 0,
    deniedOtherStudents: 0,
    deniedOtherNotes: 0,
    deniedRealStudents: 0,
    deniedRealNotes: 0,
  }

  try {
    for (let index = 0; index < teachers.length; index += 1) {
      const teacher = teachers[index]
      const app = initializeApp(firebaseConfig, `verify-staff-demo-${index}-${Date.now()}`)
      const auth = getAuth(app)
      await signInWithEmailAndPassword(auth, teacher.email, passwords.get(teacher.email))
      const db = getFirestore(app)
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error(`Session professeur absente à l’index ${teacher.index}`)
      clients.push({ app, auth })
      totals.logins += 1

      const [profile, schedule] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'schedules', uid)),
      ])
      if (!profile.exists() || !schedule.exists()) throw new Error(`Profil ou EDT absent à l’index ${teacher.index}`)
      const subject = String(profile.data().matiere || '').trim()
      if (!subject) throw new Error(`Matière absente à l’index ${teacher.index}`)

      const [students, notes, absences, behaviors, homework, resources] = await Promise.all([
        getDocs(query(collection(db, 'eleves'), where('classe', '==', teacher.testClass))),
        getDocs(query(
          collection(db, 'notes'),
          where('classe', '==', teacher.testClass),
          where('academicYear', '==', period.academicYear),
          where('semestre', '==', period.semestre),
          where('matiere', '==', subject),
        )),
        getDocs(query(
          collection(db, 'absences'),
          where('classe', '==', teacher.testClass),
          where('academicYear', '==', period.academicYear),
          where('monthKey', '==', period.monthKey),
        )),
        getDocs(query(collection(db, 'comportements'), where('classe', '==', teacher.testClass))),
        getDocs(query(
          collection(db, 'devoirs'),
          where('teacherId', '==', uid),
          where('academicYear', '==', period.academicYear),
        )),
        getDocs(query(
          collection(db, 'ressources'),
          where('classeId', '==', teacher.testClass),
          where('academicYear', '==', period.academicYear),
        )),
      ])

      const expected = { students: STUDENTS_PER_CLASS, notes: STUDENTS_PER_CLASS, absences: 3, behaviors: 2, homework: 1, resources: 1 }
      const actual = {
        students: students.size,
        notes: notes.size,
        absences: absences.size,
        behaviors: behaviors.size,
        homework: homework.size,
        resources: resources.size,
      }
      for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) throw new Error(`Compte ${teacher.index}: ${key}=${actual[key]}, attendu=${value}`)
        totals[key] += actual[key]
      }

      const otherClass = teachers[(index + 1) % teachers.length].testClass
      if (await expectDenied(() => getDocs(query(collection(db, 'eleves'), where('classe', '==', otherClass))))) {
        totals.deniedOtherStudents += 1
      }
      if (await expectDenied(() => getDocs(query(
        collection(db, 'notes'),
        where('classe', '==', otherClass),
        where('academicYear', '==', period.academicYear),
        where('semestre', '==', period.semestre),
        where('matiere', '==', subject),
      )))) {
        totals.deniedOtherNotes += 1
      }
      if (await expectDenied(() => getDocs(query(
        collection(db, 'eleves'), where('classe', '==', '1APIC-3'),
      )))) {
        totals.deniedRealStudents += 1
      }
      if (await expectDenied(() => getDocs(query(
        collection(db, 'notes'),
        where('classe', '==', '1APIC-3'),
        where('academicYear', '==', '2025-2026'),
        where('semestre', '==', 'S2'),
        where('matiere', '==', subject),
      )))) {
        totals.deniedRealNotes += 1
      }
    }

    const passed = totals.logins === teachers.length
      && totals.students === teachers.length * STUDENTS_PER_CLASS
      && totals.notes === teachers.length * STUDENTS_PER_CLASS
      && totals.absences === teachers.length * 3
      && totals.behaviors === teachers.length * 2
      && totals.homework === teachers.length
      && totals.resources === teachers.length
      && totals.deniedOtherStudents === teachers.length
      && totals.deniedOtherNotes === teachers.length
      && totals.deniedRealStudents === teachers.length
      && totals.deniedRealNotes === teachers.length
    console.log(JSON.stringify({ status: passed ? 'PASS' : 'FAIL', teachers: teachers.length, totals }, null, 2))
    if (!passed) process.exitCode = 1
  } finally {
    for (const client of clients) {
      try { await signOut(client.auth) } catch {}
      try { await deleteApp(client.app) } catch {}
    }
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', error: error?.code || error?.message || 'unknown' }))
  process.exit(1)
})
