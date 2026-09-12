#!/usr/bin/env node
/** Anonymized, read-only verification for the administration demo dataset. */
const path = require('path')
const admin = require('firebase-admin')

const ROOT = path.join(__dirname, '..', '..')
const serviceAccount = require(path.join(ROOT, '.secrets', 'firebase-admin.json'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
const db = admin.firestore()
const auth = admin.auth()

const TARGET_CLASSES = ['1APIC-3', '1APIC-4', '2APIC-4']
const TARGET_CLASS_SET = new Set(TARGET_CLASSES)
const EXPECTED_CLASS_COUNTS = { '1APIC-3': 25, '1APIC-4': 20, '2APIC-4': 15 }
const EMAILS = [
  'test-admin@mojammaa.com', 'test-teacher@mojammaa.com', 'test-parent@mojammaa.com',
  'test-teacher2@mojammaa.com', 'test-parent2@mojammaa.com',
]
const OTHER_SUBJECTS = [
  'Arabe', 'Français', 'Anglais', 'Physique et Chimie',
  'Sciences de la Vie et de la Terre', 'Histoire Géographie',
  'Éducation Islamique', 'Éducation Physique et Sportive', 'Informatique',
]

const countBy = (rows, keyOf) => rows.reduce((counts, row) => {
  const key = keyOf(row)
  counts[key] = (counts[key] || 0) + 1
  return counts
}, {})

async function main() {
  const names = [
    'eleves', 'notes', 'absences', 'comportements', 'devoirs', 'homeworkSubmissions',
    'emploiDuTemps', 'classStats', 'messages', 'guardianAccess', 'schedules',
    'timetableConfigs', 'users', 'directory', 'directoryAdmin', 'stats',
  ]
  const snapshots = Object.fromEntries(await Promise.all(names.map(async name => [name, await db.collection(name).get()])))
  const rows = name => snapshots[name].docs.map(doc => ({ id: doc.id, ...doc.data() }))
  const students = rows('eleves')
  const studentIds = new Set(students.map(student => student.id))
  const notes = rows('notes')
  const mathNotes = notes.filter(note => note.subjectKey === 'maths' || note.matiereLabel === 'Mathématiques')
  const generatedNotes = notes.filter(note => note.importedBy === 'administration-demo:generated-subjects-v1')
  const behaviors = rows('comportements')
  const messages = rows('messages')
  const users = rows('users')
  const guardians = rows('guardianAccess')
  const classStats = rows('classStats')
  const seededMessages = messages.filter(message => message.id.startsWith('admin-demo-'))
  const seededBehaviors = behaviors.filter(behavior => behavior.id.startsWith('admin-demo-'))

  const authRows = []
  for (const email of EMAILS) {
    const authUser = await auth.getUserByEmail(email)
    const profile = users.find(user => user.id === authUser.uid)
    authRows.push({ email, auth: true, firestore: Boolean(profile), role: profile?.role || null, disabled: authUser.disabled })
  }

  const summary = snapshots.stats.docs.find(doc => doc.id === 'summary')?.data() || {}
  const directory = snapshots.directory.docs.find(doc => doc.id === 'staff')?.data() || {}
  const parentDirectory = snapshots.directoryAdmin.docs.find(doc => doc.id === 'parents')?.data() || {}
  const linkedStudents = students.filter(student => typeof student.parentUid === 'string' && student.parentUid)
  const errors = []
  const check = (condition, message) => { if (!condition) errors.push(message) }

  check(students.length === 60, `expected 60 students, found ${students.length}`)
  const actualClassCounts = countBy(students, student => student.classe)
  check(Object.keys(actualClassCounts).length === TARGET_CLASSES.length && TARGET_CLASSES.every(classe => actualClassCounts[classe] === EXPECTED_CLASS_COUNTS[classe]), 'class student counts differ')
  check(students.every(student => TARGET_CLASS_SET.has(student.classe) && student.active === true), 'student class/active invariant failed')
  check(notes.length === 600, `expected 600 notes, found ${notes.length}`)
  check(notes.every(note => studentIds.has(note.eleveId) && note.academicYear === '2025-2026' && note.semestre === 'S2'), 'note scope invariant failed')
  check(mathNotes.length === 60 && mathNotes.every(note => note.importedBy === 'administration-demo:massar-2025-2026-s2'), 'Mathematics source invariant failed')
  check(mathNotes.filter(note => Array.isArray(note.evaluations) && note.evaluations.length === 2).length === 59, 'expected 59 Mathematics notes with two controls')
  check(mathNotes.filter(note => Array.isArray(note.evaluations) && note.evaluations.length === 1).length === 1, 'expected one Mathematics note with one control')
  check(generatedNotes.length === 540 && generatedNotes.every(note => note.calculation?.status === 'complete'), 'generated subject notes invariant failed')
  const subjectCounts = countBy(notes, note => note.matiereLabel)
  check(['Mathématiques', ...OTHER_SUBJECTS].every(subject => subjectCounts[subject] === 60), 'subject coverage invariant failed')
  check(seededBehaviors.length === 5, `expected 5 seeded behaviors, found ${seededBehaviors.length}`)
  check(seededBehaviors.every(behavior => studentIds.has(behavior.eleveId)), 'behavior references an unknown student')
  check(seededMessages.length === 6, `expected 6 seeded messages, found ${seededMessages.length}`)
  check(seededMessages.every(message => message.academicYear === '2025-2026' && message.semestre === 'S2'), 'message period invariant failed')
  check(linkedStudents.length === 2 && guardians.length === 2, 'expected two linked children and two guardian records')
  check(guardians.every(guardian => guardian.childIds?.length === 1 && studentIds.has(guardian.childIds[0]) && guardian.classes?.length === 1 && TARGET_CLASS_SET.has(guardian.classes[0])), 'guardian access invariant failed')
  check(authRows.every(account => account.auth && account.firestore && account.disabled === false), 'test account invariant failed')
  check(classStats.length === 3 && classStats.every(row => TARGET_CLASS_SET.has(row.classe) && row.students > 0), 'classStats invariant failed')
  check(summary.totalEleves === 60 && summary.totalClasses === 3 && summary.notesCount === 600, 'stats summary invariant failed')
  check((parentDirectory.classes || []).join('|') === TARGET_CLASSES.join('|'), 'parent directory classes differ')
  check((directory.teachers || []).every(teacher => (teacher.classes || []).every(classe => TARGET_CLASS_SET.has(classe))), 'staff directory contains an obsolete class')
  const mathTeacherLabels = (directory.teachers || [])
    .filter(teacher => teacher.matiere === 'Mathématiques')
    .map(teacher => `${teacher.prenom} ${teacher.nom}`.trim())
  check(mathTeacherLabels.includes('Pr. Oumaima') && mathTeacherLabels.includes('Pr. Abdesalam'), 'Mathematics teacher labels differ')
  check(OTHER_SUBJECTS.every(subject => (directory.teachers || []).some(teacher =>
    teacher.matiere === subject && `${teacher.prenom} ${teacher.nom}`.trim() === `Pr. ${subject}`
    && TARGET_CLASSES.every(classe => (teacher.classes || []).includes(classe)))), 'subject teacher labels/classes differ')
  check(rows('absences').every(row => studentIds.has(row.eleveId)), 'absence references an obsolete student')
  check(rows('devoirs').every(row => TARGET_CLASS_SET.has(row.classeId || row.classe)), 'homework references an obsolete class')
  check(rows('homeworkSubmissions').every(row => studentIds.has(row.eleveId || row.eleveCodeMassar) && TARGET_CLASS_SET.has(row.classeId)), 'submission references obsolete data')
  check(rows('emploiDuTemps').every(row => TARGET_CLASS_SET.has(row.classeId || row.classe)), 'timetable references an obsolete class')
  check(rows('timetableConfigs').length === 0, 'obsolete timetable configuration still exists')
  check(rows('schedules').every(schedule => (schedule.weeklySlots || []).every(slot => TARGET_CLASS_SET.has(slot.classe || slot.classeId))), 'teacher schedule references an obsolete class')

  const report = {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    counts: Object.fromEntries(names.map(name => [name, snapshots[name].size])),
    classes: countBy(students, student => student.classe),
    mathematics: {
      records: mathNotes.length,
      twoControls: mathNotes.filter(note => note.evaluations?.length === 2).length,
      oneControl: mathNotes.filter(note => note.evaluations?.length === 1).length,
      provisional: mathNotes.filter(note => note.calculation?.status === 'provisional').length,
    },
    generatedSubjects: { records: generatedNotes.length, subjects: OTHER_SUBJECTS.length, complete: generatedNotes.filter(note => note.calculation?.status === 'complete').length },
    behaviors: countBy(seededBehaviors, behavior => behavior.kind),
    messages: { seeded: seededMessages.length, total: messages.length },
    guardianLinks: { students: linkedStudents.length, records: guardians.length },
    accounts: authRows,
    stats: { students: summary.totalEleves, classes: summary.totalClasses, notes: summary.notesCount, subjects: Object.keys(subjectCounts).length, average: summary.avgNote, successRate: summary.successRate },
    errors,
  }
  console.log(JSON.stringify(report, null, 2))
  await admin.app().delete()
  if (errors.length > 0) process.exit(1)
}

main().catch(error => { console.error(error.message || error); process.exit(1) })
