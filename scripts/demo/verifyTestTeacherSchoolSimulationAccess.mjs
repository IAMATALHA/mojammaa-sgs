#!/usr/bin/env node
/** Vérification live anonymisée des permissions de la simulation test-teacher. */

import path from 'node:path'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, getFirestore, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
const { CLASSES, PERIOD, STUDENTS_PER_CLASS, SUBJECT } = require('./seedTestTeacherSchoolSimulation.js')
const ROOT = path.join(import.meta.dirname, '..', '..')
const serviceAccount = require(path.join(ROOT, '.secrets', 'firebase-admin.json'))
const googleServices = require(path.join(ROOT, 'google-services.json'))
const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key
if (!apiKey) throw new Error('Clé API Firebase indisponible')

async function expectDenied(action) {
  try { await action(); return false }
  catch (error) {
    return error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied'
  }
}

async function main() {
  const adminApp = admin.initializeApp(
    { credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id },
    `verify-test-teacher-school-${Date.now()}`,
  )
  const adminDb = admin.firestore(adminApp)
  const adminAuth = admin.auth(adminApp)
  const authUser = await adminAuth.getUserByEmail('test-teacher@mojammaa.com')
  const teacher2 = await adminAuth.getUserByEmail('test-teacher2@mojammaa.com')
  const clientApp = initializeApp({
    apiKey, authDomain: `${serviceAccount.project_id}.firebaseapp.com`, projectId: serviceAccount.project_id,
  }, `test-teacher-school-${Date.now()}`)
  const auth = getAuth(clientApp)
  const db = getFirestore(clientApp)
  const ownProbe = doc(db, 'notes', `permission-probe-own-${Date.now()}`)
  const oldProbe = doc(db, 'notes', `permission-probe-old-${Date.now()}`)
  let roleEscalated = false

  try {
    await signInWithCustomToken(auth, await adminAuth.createCustomToken(authUser.uid))
    const [profile, schedule] = await Promise.all([
      getDoc(doc(db, 'users', authUser.uid)),
      getDoc(doc(db, 'schedules', authUser.uid)),
    ])
    const profileClasses = profile.data()?.classes || []
    const slots = schedule.data()?.weeklySlots || []
    const checks = {
      ownProfile: profile.exists(),
      exactDemoClasses: JSON.stringify(profileClasses) === JSON.stringify(CLASSES),
      fullWeekSchedule: slots.length === 20 && new Set(slots.map(slot => slot.day)).size === 5,
      students: 0, notes: 0, absences: 0, behaviors: 0, homework: 0, resources: 0,
      ownNoteCreateAllowed: false,
      oldClassStudentsDenied: false,
      oldClassNotesDenied: false,
      pilotClassDenied: false,
      otherProfileDenied: false,
      oldClassNoteCreateDenied: false,
      roleEscalationDenied: false,
    }

    let firstOwnStudent = null
    for (const classe of CLASSES) {
      const [students, notes, absences, behaviors, resources] = await Promise.all([
        getDocs(query(collection(db, 'eleves'), where('classe', '==', classe))),
        getDocs(query(
          collection(db, 'notes'), where('classe', '==', classe),
          where('academicYear', '==', PERIOD.academicYear),
          where('semestre', '==', PERIOD.semestre), where('matiere', '==', SUBJECT),
        )),
        getDocs(query(
          collection(db, 'absences'), where('classe', '==', classe),
          where('academicYear', '==', PERIOD.academicYear), where('monthKey', '==', PERIOD.monthKey),
        )),
        getDocs(query(collection(db, 'comportements'), where('classe', '==', classe))),
        getDocs(query(
          collection(db, 'ressources'), where('classeId', '==', classe),
          where('academicYear', '==', PERIOD.academicYear),
        )),
      ])
      if (!firstOwnStudent) firstOwnStudent = students.docs[0]
      if (students.size !== STUDENTS_PER_CLASS || notes.size !== STUDENTS_PER_CLASS) {
        throw new Error('Effectif ou notes de classe incomplets')
      }
      checks.students += students.size
      checks.notes += notes.size
      checks.absences += absences.size
      checks.behaviors += behaviors.size
      checks.resources += resources.size
    }
    checks.homework = (await getDocs(query(
      collection(db, 'devoirs'), where('teacherId', '==', authUser.uid),
      where('academicYear', '==', PERIOD.academicYear),
    ))).size

    if (!firstOwnStudent) throw new Error('Aucun élève de démonstration disponible')
    const ownStudent = firstOwnStudent.data()
    await setDoc(ownProbe, {
      eleveId: firstOwnStudent.id, codeMassar: firstOwnStudent.id,
      eleveNom: ownStudent.nom, elevePrenom: ownStudent.prenom,
      classe: ownStudent.classe, cycle: 'college', academicYear: PERIOD.academicYear,
      semestre: PERIOD.semestre, monthKey: PERIOD.monthKey,
      matiere: SUBJECT, matiereLabel: SUBJECT, note: 12, bareme: 20,
      demo: true, createdAt: serverTimestamp(),
    })
    checks.ownNoteCreateAllowed = (await getDoc(ownProbe)).exists()

    const oldStudent = (await adminDb.collection('eleves').where('classe', '==', '1APIC-3').limit(1).get()).docs[0]
    if (!oldStudent) throw new Error('Classe de contrôle négatif indisponible')
    checks.oldClassStudentsDenied = await expectDenied(() => getDocs(query(
      collection(db, 'eleves'), where('classe', '==', '1APIC-3'),
    )))
    checks.oldClassNotesDenied = await expectDenied(() => getDocs(query(
      collection(db, 'notes'), where('classe', '==', '1APIC-3'),
      where('academicYear', '==', '2025-2026'), where('semestre', '==', 'S2'),
      where('matiere', '==', SUBJECT),
    )))
    checks.pilotClassDenied = await expectDenied(() => getDocs(query(
      collection(db, 'eleves'), where('classe', '==', 'TEST-2026-09-01-P01'),
    )))
    checks.otherProfileDenied = await expectDenied(() => getDoc(doc(db, 'users', teacher2.uid)))
    checks.oldClassNoteCreateDenied = await expectDenied(() => setDoc(oldProbe, {
      eleveId: oldStudent.id, codeMassar: oldStudent.id,
      eleveNom: oldStudent.get('nom') || '', elevePrenom: oldStudent.get('prenom') || '',
      classe: '1APIC-3', cycle: 'college', academicYear: PERIOD.academicYear,
      semestre: PERIOD.semestre, monthKey: PERIOD.monthKey,
      matiere: SUBJECT, matiereLabel: SUBJECT, note: 12, bareme: 20,
      demo: true, createdAt: serverTimestamp(),
    }))
    checks.roleEscalationDenied = await expectDenied(() => updateDoc(
      doc(db, 'users', authUser.uid), { role: 'admin' },
    ))
    roleEscalated = !checks.roleEscalationDenied

    const passed = checks.ownProfile && checks.exactDemoClasses && checks.fullWeekSchedule
      && checks.students === 60 && checks.notes === 60 && checks.absences === 12
      && checks.behaviors === 12 && checks.homework === 6 && checks.resources === 3
      && checks.ownNoteCreateAllowed && checks.oldClassStudentsDenied
      && checks.oldClassNotesDenied && checks.pilotClassDenied && checks.otherProfileDenied
      && checks.oldClassNoteCreateDenied && checks.roleEscalationDenied
    console.log(JSON.stringify({ status: passed ? 'PASS' : 'FAIL', checks }, null, 2))
    if (!passed) process.exitCode = 1
  } finally {
    await Promise.allSettled([
      adminDb.collection('notes').doc(ownProbe.id).delete(),
      adminDb.collection('notes').doc(oldProbe.id).delete(),
      roleEscalated ? adminDb.collection('users').doc(authUser.uid).update({ role: 'professeur' }) : Promise.resolve(),
    ])
    try { await signOut(auth) } catch {}
    try { await deleteApp(clientApp) } catch {}
    await adminApp.delete()
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', error: error?.code || error?.message || 'unknown' }))
  process.exit(1)
})
