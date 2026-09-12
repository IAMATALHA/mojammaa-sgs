#!/usr/bin/env node
/**
 * Add deterministic demo grades for the nine non-Mathematics college subjects.
 * The real MASSAR Mathematics notes remain untouched and act as each student's
 * baseline so cross-subject results stay pedagogically coherent.
 */
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const { calculateCollegeEvaluation, subjectEntry } = require('../../functions/collegeEvaluation')
const { computeClassStats, statsDocId } = require('../../functions/classStats')
const { computeSchoolStats } = require('../../functions/schoolStats')

const ROOT = path.join(__dirname, '..', '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const COMMIT = process.argv.includes('--commit')
const TARGET_CLASSES = ['1APIC-3', '1APIC-4', '2APIC-4']
const TARGET_CLASS_SET = new Set(TARGET_CLASSES)
const ACADEMIC_YEAR = '2025-2026'
const SEMESTRE = 'S2'
const MONTH_KEY = '2026-08'
const EXPECTED_NEW_NOTES = 540
const MATH_TEACHERS = [
  { email: 'test-teacher@mojammaa.com', prenom: 'Pr.', nom: 'Oumaima', testDataKind: 'teacher' },
  { email: 'test-teacher2@mojammaa.com', prenom: 'Pr.', nom: 'Abdesalam', testDataKind: 'teacher2' },
]
const SUBJECTS = [
  { key: 'arabe', canonical: 'Arabe' },
  { key: 'francais', canonical: 'Français' },
  { key: 'anglais', canonical: 'Anglais' },
  { key: 'physique', canonical: 'Physique et Chimie' },
  { key: 'svt', canonical: 'Sciences de la Vie et de la Terre' },
  { key: 'histgeo', canonical: 'Histoire Géographie' },
  { key: 'islamique', canonical: 'Éducation Islamique' },
  { key: 'eps', canonical: 'Éducation Physique et Sportive' },
  { key: 'informatique', canonical: 'Informatique' },
]

function argumentValue(name) {
  const prefix = `${name}=`
  const value = process.argv.find(arg => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : ''
}

function makeRng(seed) {
  let state = 0
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function clampGrade(value) {
  return Math.max(4, Math.min(19.5, Math.round(value * 2) / 2))
}

function noteAverage(note) {
  const value = Number(note?.note)
  if (!Number.isFinite(value) || value < 0 || value > 20) throw new Error('A Mathematics baseline is invalid')
  return value
}

function buildEvaluations(student, subject, baseline) {
  const policySubject = subjectEntry(subject.canonical)
  if (!policySubject) throw new Error(`Evaluation policy missing for ${subject.canonical}`)
  const slots = policySubject.controlsByLevel?.[student.niveau] || []
  if (slots.length === 0) throw new Error(`Control policy missing for ${subject.canonical}/${student.niveau}`)
  const rng = makeRng(`${student.id}|${subject.key}|${SEMESTRE}`)
  const subjectOffset = (rng() - 0.5) * 3
  const trend = (rng() - 0.5) * 2
  const evaluations = slots.map((slot, index) => ({
    slot: slot.slot,
    category: 'control',
    kind: slot.kind,
    ordinal: index + 1,
    label: slot.label,
    note: clampGrade(baseline + subjectOffset + trend * index + (rng() - 0.5)),
    bareme: 20,
  }))
  const integratedWeight = Number(policySubject.integratedWeightByLevel?.[student.niveau] || 0)
  if (integratedWeight > 0) {
    evaluations.push({
      slot: 'integrated_activities', category: 'integrated', kind: 'integrated_activity',
      ordinal: 1, label: 'Activités intégrées',
      note: clampGrade(baseline + subjectOffset + (rng() - 0.5) * 2), bareme: 20,
    })
  }
  return evaluations
}

function buildNote(student, subject, baseline) {
  const evaluations = buildEvaluations(student, subject, baseline)
  const base = {
    schemaVersion: 2, cycle: 'college', niveau: student.niveau, classe: student.classe,
    matiere: subject.canonical, matiereLabel: subject.canonical,
    subjectKey: subject.key, bareme: 20, evaluations,
  }
  const evaluated = calculateCollegeEvaluation(base)
  if (!evaluated.complete || evaluated.note == null) throw new Error(`Incomplete generated evaluation for ${subject.canonical}`)
  return {
    id: `${student.id}_${ACADEMIC_YEAR}_${SEMESTRE}_${subject.key}`,
    data: {
      eleveId: student.id, eleveNom: student.nom || '', elevePrenom: student.prenom || '',
      codeMassar: student.codeMassar || student.id,
      academicYear: ACADEMIC_YEAR, semestre: SEMESTRE, monthKey: MONTH_KEY,
      ...base,
      gradeSource: 'demo-generated-from-mathematics-baseline',
      evaluationPolicyVersion: evaluated.policyVersion,
      note: evaluated.note,
      controlesCount: evaluated.controlsEntered,
      controlesExpected: evaluated.controlsExpected,
      calculation: {
        status: 'complete', completed: evaluated.componentsEntered,
        expected: evaluated.componentsExpected, completionRate: evaluated.completionRate,
      },
      demo: true, importedBy: 'administration-demo:generated-subjects-v1',
    },
  }
}

async function commitBatches(db, operations) {
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch()
    for (const operation of operations.slice(offset, offset + 400)) {
      batch.set(operation.ref, operation.data, operation.options || {})
    }
    await batch.commit()
  }
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) throw new Error('Firebase Admin key missing')
  const serviceAccount = require(KEY_PATH)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
  const db = admin.firestore()
  const auth = admin.auth()
  const [studentsSnap, mathSnap, usersSnap] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('notes').where('academicYear', '==', ACADEMIC_YEAR).where('semestre', '==', SEMESTRE).get(),
    db.collection('users').get(),
  ])
  const students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  if (students.length !== 60 || students.some(student => !TARGET_CLASS_SET.has(student.classe))) throw new Error('The administration demo student scope is not ready')
  const mathByStudent = new Map(mathSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(note => note.subjectKey === 'maths' || note.matiereLabel === 'Mathématiques')
    .map(note => [note.eleveId, note]))
  if (mathByStudent.size !== students.length) throw new Error('Every demo student must have a Mathematics baseline')

  const generated = students.flatMap(student => SUBJECTS.map(subject =>
    buildNote(student, subject, noteAverage(mathByStudent.get(student.id)))))
  if (generated.length !== EXPECTED_NEW_NOTES) throw new Error(`Expected ${EXPECTED_NEW_NOTES} generated notes, found ${generated.length}`)
  const existingGeneratedIds = new Set(mathSnap.docs.map(doc => doc.id))
  const overwrites = generated.filter(note => existingGeneratedIds.has(note.id)).length

  const teacherProfiles = usersSnap.docs.filter(doc => doc.data().role === 'professeur')
  const teacherAssignments = []
  for (const profile of teacherProfiles) {
    const data = profile.data()
    const authUser = data.email ? await auth.getUserByEmail(data.email).catch(() => null) : null
    const explicitMath = MATH_TEACHERS.find(teacher => teacher.email === data.email || teacher.email === authUser?.email)
    if (explicitMath) {
      teacherAssignments.push({ ref: profile.ref, data: {
        prenom: explicitMath.prenom, nom: explicitMath.nom,
        matiere: 'Mathématiques', matiereLabel: 'Mathématiques', classes: TARGET_CLASSES,
        active: true, isTestData: true, testDataKind: explicitMath.testDataKind,
      } })
      continue
    }
    const rawSubject = data.matiereLabel || data.matiere || ''
    const policySubject = subjectEntry(rawSubject)
    const canonical = policySubject?.canonical || rawSubject
    const isCollegeSubject = SUBJECTS.some(subject => subject.canonical === canonical)
    teacherAssignments.push({ ref: profile.ref, data: {
      prenom: 'Pr.', nom: canonical || 'Matière',
      ...(canonical ? { matiere: canonical, matiereLabel: canonical } : {}),
      classes: isCollegeSubject ? TARGET_CLASSES : [], active: true,
    } })
  }

  console.log(JSON.stringify({
    mode: COMMIT ? 'commit-requested' : 'dry-run',
    projectId: serviceAccount.project_id,
    students: students.length,
    subjectsAdded: SUBJECTS.map(subject => subject.canonical),
    notesToWrite: generated.length,
    existingGeneratedNotesToReplace: overwrites,
    mathematicsNotesPreserved: mathByStudent.size,
    teacherProfilesToUpdate: teacherAssignments.length,
    mathTeacherLabels: ['Pr. Oumaima', 'Pr. Abdesalam'],
  }, null, 2))

  if (!COMMIT) {
    console.log(`\nDry-run only. Commit requires --confirm-notes=${generated.length} --backup=/absolute/path.`)
    await admin.app().delete()
    return
  }
  if (argumentValue('--confirm-notes') !== String(generated.length)) throw new Error('Note confirmation does not match the dry-run')
  const backupPath = path.resolve(argumentValue('--backup') || '/')
  if (backupPath === '/' || !fs.existsSync(path.join(backupPath, 'notes.json')) || !fs.existsSync(path.join(backupPath, '_auth_users.json'))) throw new Error('A verified backup directory is required')

  const now = admin.firestore.FieldValue.serverTimestamp()
  await commitBatches(db, generated.map(note => ({
    ref: db.collection('notes').doc(note.id), data: { ...note.data, importedAt: now },
  })))
  await commitBatches(db, teacherAssignments.map(assignment => ({
    ref: assignment.ref, data: { ...assignment.data, updatedAt: now }, options: { merge: true },
  })))

  const [studentsAfter, notesAfter, usersAfter, absencesAfter, devoirsAfter, submissionsAfter, coefficientDoc] = await Promise.all([
    db.collection('eleves').get(), db.collection('notes').get(), db.collection('users').get(),
    db.collection('absences').get(), db.collection('devoirs').get(), db.collection('homeworkSubmissions').get(),
    db.collection('settings').doc('coefficients').get(),
  ])
  const rows = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  const studentRows = rows(studentsAfter)
  const noteRows = rows(notesAfter)
  const userRows = rows(usersAfter)
  const summary = computeSchoolStats({
    eleves: studentRows, users: userRows, notes: noteRows,
    absences: rows(absencesAfter), devoirs: rows(devoirsAfter), homeworkSubmissions: rows(submissionsAfter),
    coefficients: coefficientDoc.exists ? coefficientDoc.data() : null,
  }, { semestre: SEMESTRE })
  await db.collection('stats').doc('summary').set({
    ...summary, academicYear: ACADEMIC_YEAR, semestre: SEMESTRE, monthKey: MONTH_KEY, updatedAt: new Date(),
  })
  await commitBatches(db, TARGET_CLASSES.map(classe => {
    const classNotes = noteRows.filter(note => note.classe === classe && note.academicYear === ACADEMIC_YEAR && note.semestre === SEMESTRE)
    return {
      ref: db.collection('classStats').doc(statsDocId(ACADEMIC_YEAR, classe, SEMESTRE)),
      data: { academicYear: ACADEMIC_YEAR, classe, semestre: SEMESTRE, ...computeClassStats(classNotes), updatedAt: now },
    }
  }))

  const staff = {
    teachers: userRows.filter(user => user.role === 'professeur').map(user => ({
      uid: user.id, nom: user.nom || '', prenom: user.prenom || '', matiere: user.matiere || '',
      classes: Array.isArray(user.classes) ? user.classes : [],
    })).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')),
    admins: userRows.filter(user => user.role === 'admin').map(user => ({ uid: user.id, nom: user.nom || '', prenom: user.prenom || '' })),
  }
  await db.collection('directory').doc('staff').set({ ...staff, updatedAt: new Date() })
  await db.collection('_presentationRuns').doc('administration-demo-2026-08-31-v3').set({
    subjectGrades: {
      status: 'READY', notesAdded: generated.length, subjectsAdded: SUBJECTS.length,
      mathematicsPreserved: mathByStudent.size, backupPath, completedAt: new Date(),
    },
  }, { merge: true })

  console.log(JSON.stringify({
    status: 'READY', totalNotes: noteRows.length, subjects: new Set(noteRows.map(note => note.matiereLabel)).size,
    mathematicsPreserved: mathByStudent.size, generatedNotes: generated.length,
    average: summary.avgNote, successRate: summary.successRate,
  }, null, 2))
  await admin.app().delete()
}

main().catch(async error => {
  console.error(error.message || error)
  try { await admin.app().delete() } catch {}
  process.exit(1)
})
