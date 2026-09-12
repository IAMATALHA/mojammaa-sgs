#!/usr/bin/env node
/** Live Firestore Rules + realtime listener verification without PII output. */
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth'
import {
  collection, deleteField, doc, getDoc, getDocs, getFirestore,
  onSnapshot, query, where,
} from 'firebase/firestore'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
const serviceAccount = require('../../.secrets/firebase-admin.json')
const googleServices = require('../../google-services.json')
const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key
if (!apiKey) throw new Error('Firebase web API key unavailable')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
const adminDb = admin.firestore()
const adminAuth = admin.auth()
const firebaseConfig = {
  apiKey,
  authDomain: `${serviceAccount.project_id}.firebaseapp.com`,
  projectId: serviceAccount.project_id,
}

async function clientFor(label, email) {
  const user = await adminAuth.getUserByEmail(email)
  const app = initializeApp(firebaseConfig, `verify-${label}-${Date.now()}`)
  const auth = getAuth(app)
  await signInWithCustomToken(auth, await adminAuth.createCustomToken(user.uid))
  return { app, auth, db: getFirestore(app), uid: user.uid }
}

async function expectDenied(action) {
  try {
    await action()
    return false
  } catch (error) {
    return error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied'
  }
}

function waitForRealtimeModification(db, messageId, mutation) {
  return new Promise((resolve, reject) => {
    let initialSeen = false
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Realtime listener timed out')) }, 15000)
    const unsubscribe = onSnapshot(doc(db, 'messages', messageId), snapshot => {
      if (!snapshot.exists()) return
      if (!initialSeen) {
        initialSeen = true
        Promise.resolve(mutation()).catch(reject)
        return
      }
      if (snapshot.data().verificationNonce) {
        clearTimeout(timer)
        unsubscribe()
        resolve(true)
      }
    }, error => {
      clearTimeout(timer)
      unsubscribe()
      reject(error)
    })
  })
}

async function main() {
  const [parent1, parent2, teacher2] = await Promise.all([
    clientFor('parent1', 'test-parent@mojammaa.com'),
    clientFor('parent2', 'test-parent2@mojammaa.com'),
    clientFor('teacher2', 'test-teacher2@mojammaa.com'),
  ])
  const studentSnap = await adminDb.collection('eleves').get()
  const students = studentSnap.docs.map(row => ({ id: row.id, ...row.data() }))
  const parent1Child = students.find(student => student.parentUid === parent1.uid)
  const parent2Child = students.find(student => student.parentUid === parent2.uid)
  if (!parent1Child || !parent2Child) throw new Error('Linked demo children unavailable')

  const parentOwnStudent = (await getDoc(doc(parent1.db, 'eleves', parent1Child.id))).exists()
  const parentOtherStudentDenied = await expectDenied(() => getDoc(doc(parent1.db, 'eleves', parent2Child.id)))
  const parentOwnNotes = await getDocs(query(collection(parent1.db, 'notes'), where('eleveId', '==', parent1Child.id), where('academicYear', '==', '2025-2026')))
  const parentOtherNotesDenied = await expectDenied(() => getDocs(query(collection(parent1.db, 'notes'), where('eleveId', '==', parent2Child.id), where('academicYear', '==', '2025-2026'))))
  const parentOtherMessageDenied = await expectDenied(() => getDoc(doc(parent1.db, 'messages', 'admin-demo-teacher2-parent2')))
  const teacherClassStudents = await getDocs(query(collection(teacher2.db, 'eleves'), where('classe', '==', '1APIC-3')))
  const teacherClassNotes = await getDocs(query(collection(teacher2.db, 'notes'), where('classe', '==', '1APIC-3'), where('matiere', '==', 'Mathématiques')))

  const parentRealtime = waitForRealtimeModification(parent2.db, 'admin-demo-teacher2-parent2', () =>
    adminDb.collection('messages').doc('admin-demo-teacher2-parent2').update({ verificationNonce: `parent-${Date.now()}` }))
  const teacherRealtime = waitForRealtimeModification(teacher2.db, 'admin-demo-parent2-teacher2', () =>
    adminDb.collection('messages').doc('admin-demo-parent2-teacher2').update({ verificationNonce: `teacher-${Date.now()}` }))
  const [parentRealtimeReceived, teacherRealtimeReceived] = await Promise.all([parentRealtime, teacherRealtime])
  await Promise.all([
    adminDb.collection('messages').doc('admin-demo-teacher2-parent2').update({ verificationNonce: admin.firestore.FieldValue.delete() }),
    adminDb.collection('messages').doc('admin-demo-parent2-teacher2').update({ verificationNonce: admin.firestore.FieldValue.delete() }),
  ])

  const checks = {
    parentOwnStudent,
    parentOtherStudentDenied,
    parentOwnNotes: parentOwnNotes.size,
    parentOtherNotesDenied,
    parentOtherMessageDenied,
    teacherClassStudents: teacherClassStudents.size,
    teacherClassNotes: teacherClassNotes.size,
    parentRealtimeReceived,
    teacherRealtimeReceived,
  }
  const passed = parentOwnStudent && parentOtherStudentDenied && parentOwnNotes.size === 10
    && parentOtherNotesDenied && parentOtherMessageDenied
    && teacherClassStudents.size === 25 && teacherClassNotes.size === 25
    && parentRealtimeReceived && teacherRealtimeReceived
  console.log(JSON.stringify({ status: passed ? 'PASS' : 'FAIL', checks }, null, 2))

  for (const client of [parent1, parent2, teacher2]) {
    await signOut(client.auth)
    await deleteApp(client.app)
  }
  await admin.app().delete()
  if (!passed) process.exit(1)
}

main().catch(async error => {
  console.error(error?.code || error?.message || error)
  try { await admin.app().delete() } catch {}
  process.exit(1)
})
