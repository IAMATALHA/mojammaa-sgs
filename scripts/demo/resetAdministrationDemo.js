#!/usr/bin/env node
/**
 * Replace obsolete class-scoped demo data with the three supplied MASSAR
 * Mathematics exports. Dry-run by default; production writes require an
 * exact deletion count, imported-student count, and a verified local backup.
 *
 * This script never logs student names, Massar identifiers, message bodies,
 * UIDs, or passwords.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const XLSX = require('xlsx')
const { randomPassword } = require('../lib/password')
const { calculateCollegeEvaluation } = require('../../functions/collegeEvaluation')
const { computeClassStats, statsDocId } = require('../../functions/classStats')
const { computeSchoolStats } = require('../../functions/schoolStats')
const { buildParentsDirectory } = require('../../functions/parentsDirectory')

const ROOT = path.join(__dirname, '..', '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const COMMIT = process.argv.includes('--commit')
const TARGET_CLASSES = ['1APIC-3', '1APIC-4', '2APIC-4']
const TARGET_CLASS_SET = new Set(TARGET_CLASSES)
const ACADEMIC_YEAR = '2025-2026'
const SEMESTRE = 'S2'
const MONTH_KEY = '2026-08'
const EXPECTED_STUDENTS = 60
const RUN_ID = 'administration-demo-2026-08-31-v3'
const ACCOUNT_EMAILS = {
  admin: 'test-admin@mojammaa.com',
  teacher1: 'test-teacher@mojammaa.com',
  parent1: 'test-parent@mojammaa.com',
  teacher2: 'test-teacher2@mojammaa.com',
  parent2: 'test-parent2@mojammaa.com',
}

function argumentValue(name) {
  const prefix = `${name}=`
  const value = process.argv.find(arg => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : ''
}

function positionalFiles() {
  return process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(file => path.resolve(file))
}

function classFromFilename(file) {
  const match = path.basename(file).match(/^export_notesCC_([^_]+)_\d+\.xlsx$/i)
  return match ? match[1].toUpperCase() : ''
}

function levelFromClass(classe) {
  if (classe.startsWith('1APIC')) return '1AC'
  if (classe.startsWith('2APIC')) return '2AC'
  throw new Error(`Unsupported class level: ${classe}`)
}

function parseDate(value) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) throw new Error('A student row has an invalid birth date')
  return `${match[3]}-${match[2]}-${match[1]}`
}

function asGrade(value, required) {
  if (value === '' || value == null) {
    if (required) throw new Error('A required Mathematics control is missing')
    return null
  }
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(number) || number < 0 || number > 20) throw new Error('A Mathematics grade is outside 0–20')
  return number
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function parseWorkbook(file) {
  if (!fs.existsSync(file)) throw new Error(`Workbook missing: ${path.basename(file)}`)
  const classe = classFromFilename(file)
  if (!TARGET_CLASS_SET.has(classe)) throw new Error(`Unexpected class workbook: ${path.basename(file)}`)
  const workbook = XLSX.readFile(file, { cellDates: false })
  const sheet = workbook.Sheets.NotesCC || workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headerText = rows.slice(0, 17).flat().map(value => String(value || '')).join(' ')
  if (!headerText.includes('الرياضيات')) throw new Error(`${classe}: workbook is not Mathematics`)
  if (!headerText.includes('الدورة الثانية')) throw new Error(`${classe}: workbook is not second semester`)
  if (!/2025\s*[\/-]\s*2026/.test(headerText)) throw new Error(`${classe}: workbook is not academic year 2025-2026`)

  const students = []
  for (const row of rows) {
    const massarIndex = row.findIndex(value => /^A\d{6,}$/.test(String(value || '').trim()))
    if (massarIndex < 0) continue
    const codeMassar = String(row[massarIndex]).trim()
    const fullName = String(row[massarIndex + 1] || '').trim()
    if (!fullName) throw new Error(`${classe}: a student name is missing`)
    const nameParts = fullName.split(/\s+/).filter(Boolean)
    const control1 = asGrade(row[massarIndex + 4], true)
    const control2 = asGrade(row[massarIndex + 6], false)
    students.push({
      codeMassar,
      nom: nameParts[0] || '',
      prenom: nameParts.slice(1).join(' '),
      nomComplet: fullName,
      dateNaissance: parseDate(row[massarIndex + 3]),
      classe,
      niveau: levelFromClass(classe),
      control1,
      control2,
    })
  }
  return { classe, students, sourceHash: sha256(file) }
}

function buildSource(files) {
  if (files.length !== TARGET_CLASSES.length) throw new Error('Exactly three workbook paths are required')
  const parsed = files.map(parseWorkbook)
  const classes = parsed.map(item => item.classe).sort()
  if (classes.join('|') !== [...TARGET_CLASSES].sort().join('|')) throw new Error('The workbook set does not match the three target classes')
  const students = parsed.flatMap(item => item.students)
  const ids = new Set(students.map(student => student.codeMassar))
  if (ids.size !== students.length) throw new Error('Duplicate Massar identifiers found across workbooks')
  if (students.length !== EXPECTED_STUDENTS) throw new Error(`Expected ${EXPECTED_STUDENTS} students, found ${students.length}`)
  return { parsed, students, ids }
}

function noteForStudent(student) {
  const evaluations = [
    { slot: 'written_1', category: 'control', kind: 'written', ordinal: 1, label: 'Contrôle écrit 1', note: student.control1, bareme: 20 },
    ...(student.control2 == null ? [] : [
      { slot: 'written_2', category: 'control', kind: 'written', ordinal: 2, label: 'Contrôle écrit 2', note: student.control2, bareme: 20 },
    ]),
  ]
  const base = {
    schemaVersion: 2,
    cycle: 'college',
    niveau: student.niveau,
    classe: student.classe,
    matiere: 'Mathématiques',
    matiereLabel: 'Mathématiques',
    subjectKey: 'maths',
    bareme: 20,
    evaluations,
  }
  const evaluated = calculateCollegeEvaluation(base)
  return {
    id: `${student.codeMassar}_${ACADEMIC_YEAR}_${SEMESTRE}_maths`,
    data: {
      eleveId: student.codeMassar,
      eleveNom: student.nom,
      elevePrenom: student.prenom,
      codeMassar: student.codeMassar,
      academicYear: ACADEMIC_YEAR,
      semestre: SEMESTRE,
      monthKey: MONTH_KEY,
      ...base,
      gradeSource: 'massar-export',
      evaluationPolicyVersion: evaluated.policyVersion,
      note: evaluated.note,
      controlesCount: evaluated.controlsEntered,
      controlesExpected: evaluated.controlsExpected,
      calculation: {
        status: evaluated.complete ? 'complete' : 'provisional',
        completed: evaluated.componentsEntered,
        expected: evaluated.componentsExpected,
        completionRate: evaluated.completionRate,
      },
      demo: true,
      importedBy: 'administration-demo:massar-2025-2026-s2',
    },
  }
}

function hasRemovedClass(value) {
  if (typeof value === 'string') return /(?:^|\b)(?:MS-1|GS-1|1AEP-1|3AEP-1|6AEP-1|1AC-1|2AC-1|3AC-1)(?:\b|$)/.test(value)
  if (Array.isArray(value)) return value.some(hasRemovedClass)
  if (value && typeof value === 'object') return Object.values(value).some(hasRemovedClass)
  return false
}

function normalizedIdentity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function authUserByEmail(auth, email) {
  try { return await auth.getUserByEmail(email) }
  catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

async function commitBatches(db, operations) {
  let completed = 0
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch()
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.type === 'delete') batch.delete(operation.ref)
      else batch.set(operation.ref, operation.data, operation.options || {})
    }
    await batch.commit()
    completed += Math.min(400, operations.length - offset)
  }
  return completed
}

function makeMessage({ id, fromId, fromNom, fromRole, toIds, subject, body, eleveId, classe, type = 'direct', category = 'admin', offset = 0 }) {
  return {
    id,
    data: {
      type, category, priority: 'normal', status: 'sent',
      subject, body, fromId, fromNom, fromRole,
      toType: 'user', toIds, toLabel: 'Comptes de démonstration',
      ...(eleveId ? { eleveId } : {}),
      ...(classe ? { classe } : {}),
      readBy: [], deletedBy: [], academicYear: ACADEMIC_YEAR,
      semestre: SEMESTRE, monthKey: MONTH_KEY,
      createdAt: admin.firestore.Timestamp.fromMillis(Date.now() + offset),
    },
  }
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) throw new Error('Firebase Admin key missing')
  const files = positionalFiles()
  const source = buildSource(files)
  const notes = source.students.map(noteForStudent)
  const serviceAccount = require(KEY_PATH)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id })
  const db = admin.firestore()
  const auth = admin.auth()

  const collectionNames = [
    'eleves', 'notes', 'absences', 'comportements', 'devoirs',
    'homeworkSubmissions', 'emploiDuTemps', 'classStats', 'messages',
    'guardianAccess', 'schedules', 'timetableConfigs', 'users',
  ]
  const snapshots = Object.fromEntries(await Promise.all(collectionNames.map(async name => [name, await db.collection(name).get()])))
  const desiredNoteIds = new Set(notes.map(note => note.id))
  const deletePlan = []
  const addDeletes = (collection, predicate) => {
    for (const doc of snapshots[collection].docs) {
      if (predicate(doc.data(), doc.id)) deletePlan.push({ collection, ref: doc.ref })
    }
  }

  addDeletes('eleves', (data, id) => !source.ids.has(id) && !source.ids.has(String(data.codeMassar || '')))
  addDeletes('notes', (_data, id) => !desiredNoteIds.has(id))
  addDeletes('absences', data => !source.ids.has(String(data.eleveId || '')))
  addDeletes('comportements', data => !source.ids.has(String(data.eleveId || '')))
  addDeletes('devoirs', data => !TARGET_CLASS_SET.has(String(data.classeId || data.classe || '')))
  addDeletes('homeworkSubmissions', data => !source.ids.has(String(data.eleveId || data.eleveCodeMassar || '')) || !TARGET_CLASS_SET.has(String(data.classeId || '')))
  addDeletes('emploiDuTemps', data => !TARGET_CLASS_SET.has(String(data.classeId || data.classe || '')))
  addDeletes('classStats', data => !TARGET_CLASS_SET.has(String(data.classe || '')) || data.academicYear !== ACADEMIC_YEAR)
  addDeletes('messages', data => hasRemovedClass(data.classe) || (data.eleveId && !source.ids.has(String(data.eleveId))))
  addDeletes('guardianAccess', () => true)
  addDeletes('timetableConfigs', data => hasRemovedClass(data))

  const deletionCounts = {}
  for (const item of deletePlan) deletionCounts[item.collection] = (deletionCounts[item.collection] || 0) + 1
  const deleteTotal = deletePlan.length
  const existingAccounts = Object.fromEntries(await Promise.all(Object.entries(ACCOUNT_EMAILS).map(async ([key, email]) => [key, Boolean(await authUserByEmail(auth, email))])))
  const classCounts = Object.fromEntries(TARGET_CLASSES.map(classe => [classe, source.students.filter(student => student.classe === classe).length]))
  const controls = {
    first: source.students.length,
    second: source.students.filter(student => student.control2 != null).length,
  }
  const userIdentityRows = snapshots.users.docs.map(doc => {
    const data = doc.data()
    return `${data.nom || ''} ${data.prenom || ''} ${data.email || ''}`
  })
  const directorsFound = {
    habibaIdrissi: userIdentityRows.some(value => {
      const normalized = normalizedIdentity(value)
      return (normalized.includes('habiba') && normalized.includes('idrissi')) || (/حبيبة/.test(value) && /الإ?دريسي/.test(value))
    }),
    zakaria: userIdentityRows.some(value => normalizedIdentity(value).includes('zakaria') || /زكرياء|زكريا/.test(value)),
  }

  console.log(JSON.stringify({
    mode: COMMIT ? 'commit-requested' : 'dry-run',
    projectId: serviceAccount.project_id,
    source: { students: source.students.length, classes: classCounts, mathematicsControls: controls },
    deleteTotal,
    deletionCounts,
    preserved: { firestoreUsers: snapshots.users.size, authAccounts: (await auth.listUsers(1000)).users.length },
    accounts: existingAccounts,
    createAccounts: Object.entries(existingAccounts).filter(([, exists]) => !exists).map(([key]) => key),
    directorsFound,
  }, null, 2))

  if (!COMMIT) {
    console.log(`\nDry-run only. Commit requires --confirm-delete=${deleteTotal} --confirm-students=${source.students.length} --backup=/absolute/path.`)
    await admin.app().delete()
    return
  }

  if (argumentValue('--confirm-delete') !== String(deleteTotal)) throw new Error('Deletion confirmation does not match the dry-run')
  if (argumentValue('--confirm-students') !== String(source.students.length)) throw new Error('Student confirmation does not match the parsed workbooks')
  const backupPath = path.resolve(argumentValue('--backup') || '/')
  if (backupPath === '/' || !fs.existsSync(path.join(backupPath, 'eleves.json')) || !fs.existsSync(path.join(backupPath, '_auth_users.json'))) {
    throw new Error('A verified backup directory is required')
  }

  const runRef = db.collection('_presentationRuns').doc(RUN_ID)
  await runRef.set({
    status: 'MUTATING', datasetVersion: 3, projectId: serviceAccount.project_id,
    academicYear: ACADEMIC_YEAR, semestre: SEMESTRE, targetClasses: TARGET_CLASSES,
    sourceHashes: Object.fromEntries(source.parsed.map(item => [item.classe, item.sourceHash])),
    backupPath, deleteTotal, deletionCounts, startedAt: new Date(),
  })

  const credentials = []
  async function ensureAccount(key, email, displayName) {
    const existing = await authUserByEmail(auth, email)
    if (existing) return existing
    const password = randomPassword()
    credentials.push(`${email}  ${password}`)
    return auth.createUser({ email, password, displayName, emailVerified: true, disabled: false })
  }

  try {
    const adminUser = await authUserByEmail(auth, ACCOUNT_EMAILS.admin)
    const teacher1 = await authUserByEmail(auth, ACCOUNT_EMAILS.teacher1)
    const parent1 = await authUserByEmail(auth, ACCOUNT_EMAILS.parent1)
    if (!adminUser || !teacher1 || !parent1) throw new Error('One of the three existing test accounts is missing')
    const teacher2 = await ensureAccount('teacher2', ACCOUNT_EMAILS.teacher2, 'Test Teacher 2')
    const parent2 = await ensureAccount('parent2', ACCOUNT_EMAILS.parent2, 'Test Parent 2')

    if (credentials.length > 0) {
      const credentialPath = path.join(ROOT, '.secrets', 'administration-demo-new-accounts.txt')
      fs.writeFileSync(credentialPath, `${credentials.join('\n')}\n`, { mode: 0o600 })
      fs.chmodSync(credentialPath, 0o600)
      console.log(`New-account credentials saved with mode 600: ${credentialPath}`)
    }

    await commitBatches(db, deletePlan.map(item => ({ type: 'delete', ref: item.ref })))

    const now = admin.firestore.FieldValue.serverTimestamp()
    const child1 = source.students.find(student => student.classe === '1APIC-3')
    const child2 = source.students.find(student => student.classe === '1APIC-4')
    const childToParent = new Map([[child1.codeMassar, parent1.uid], [child2.codeMassar, parent2.uid]])
    const studentWrites = source.students.map(student => ({
      type: 'set', ref: db.collection('eleves').doc(student.codeMassar),
      data: {
        codeMassar: student.codeMassar, nom: student.nom, prenom: student.prenom,
        nomComplet: student.nomComplet, classe: student.classe, classes: [student.classe],
        niveau: student.niveau, cycle: 'college', dateNaissance: student.dateNaissance,
        active: true, academicYear: ACADEMIC_YEAR,
        ...(childToParent.has(student.codeMassar) ? {
          parentUid: childToParent.get(student.codeMassar), parentNom: 'Parent Test',
        } : {}),
        demo: true, importedBy: 'administration-demo:massar-2025-2026', updatedAt: now,
      },
    }))
    await commitBatches(db, studentWrites)

    await commitBatches(db, notes.map(note => ({
      type: 'set', ref: db.collection('notes').doc(note.id),
      data: { ...note.data, importedAt: now },
    })))

    const teacherClassUpdate = async (uid, email, name, prenom, nom) => db.collection('users').doc(uid).set({
      uid, role: 'professeur', email, prenom, nom, matiere: 'Mathématiques', matiereLabel: 'Mathématiques',
      classes: TARGET_CLASSES, classe: admin.firestore.FieldValue.delete(), active: true,
      isTestData: true, testDataKind: name, updatedAt: now,
    }, { merge: true })
    await teacherClassUpdate(teacher1.uid, ACCOUNT_EMAILS.teacher1, 'teacher', 'Enseignant', 'Test')
    await teacherClassUpdate(teacher2.uid, ACCOUNT_EMAILS.teacher2, 'teacher2', 'Enseignant 2', 'Test')
    await db.collection('users').doc(parent1.uid).set({
      uid: parent1.uid, role: 'parent', email: ACCOUNT_EMAILS.parent1, prenom: 'Parent', nom: 'Test',
      children: [child1.codeMassar], active: true, isTestData: true, testDataKind: 'parent', updatedAt: now,
    }, { merge: true })
    await db.collection('users').doc(parent2.uid).set({
      uid: parent2.uid, role: 'parent', email: ACCOUNT_EMAILS.parent2, prenom: 'Parent 2', nom: 'Test',
      children: [child2.codeMassar], active: true, isTestData: true, testDataKind: 'parent2', updatedAt: now,
    }, { merge: true })

    const otherTeacherUpdates = snapshots.users.docs
      .filter(doc => doc.id !== teacher1.uid && doc.data().role === 'professeur')
      .map(doc => ({ type: 'set', ref: doc.ref, data: { classes: [], classe: admin.firestore.FieldValue.delete(), updatedAt: now }, options: { merge: true } }))
    await commitBatches(db, otherTeacherUpdates)
    const scheduleUpdates = snapshots.schedules.docs
      .filter(doc => doc.id !== teacher1.uid && doc.id !== teacher2.uid)
      .map(doc => ({
      type: 'set', ref: doc.ref,
      data: { weeklySlots: (doc.data().weeklySlots || []).filter(slot => TARGET_CLASS_SET.has(String(slot.classe || slot.classeId || ''))), updatedAt: now },
      options: { merge: true },
      }))
    scheduleUpdates.push(
      { type: 'set', ref: db.collection('schedules').doc(teacher1.uid), data: { uid: teacher1.uid, teacherUid: teacher1.uid, weeklySlots: [], updatedAt: now } },
      { type: 'set', ref: db.collection('schedules').doc(teacher2.uid), data: { uid: teacher2.uid, teacherUid: teacher2.uid, weeklySlots: [], updatedAt: now } },
    )
    await commitBatches(db, scheduleUpdates)

    await commitBatches(db, [
      { type: 'set', ref: db.collection('guardianAccess').doc(parent1.uid), data: { uid: parent1.uid, childIds: [child1.codeMassar], classes: [child1.classe], updatedAt: now } },
      { type: 'set', ref: db.collection('guardianAccess').doc(parent2.uid), data: { uid: parent2.uid, childIds: [child2.codeMassar], classes: [child2.classe], updatedAt: now } },
    ])

    const behaviorRows = [
      { student: child1, kind: 'merite', reason: 'participation', points: 2 },
      { student: child1, kind: 'avertissement', reason: 'homeworkNotDone', points: -1 },
      { student: child1, kind: 'merite', reason: 'outstandingWork', points: 3 },
      { student: child2, kind: 'merite', reason: 'remarkableEffort', points: 2 },
      { student: child2, kind: 'avertissement', reason: 'forgotMaterials', points: -1 },
    ]
    await commitBatches(db, behaviorRows.map((row, index) => ({
      type: 'set', ref: db.collection('comportements').doc(`admin-demo-${index + 1}`),
      data: {
        eleveId: row.student.codeMassar, eleveNom: row.student.nom, elevePrenom: row.student.prenom,
        classe: row.student.classe, date: '2026-08-31', seance: `S${(index % 3) + 1}`,
        kind: row.kind, reason: row.reason, points: row.points,
        teacherId: index < 3 ? teacher1.uid : teacher2.uid,
        teacherNom: index < 3 ? 'Enseignant Test' : 'Enseignant Test 2',
        comment: 'Donnée préparée pour la démonstration administrative.',
        createdAt: admin.firestore.Timestamp.fromMillis(Date.now() + index), demo: true,
      },
    })))

    const messageRows = [
      makeMessage({ id: 'admin-demo-parent-announcement', fromId: adminUser.uid, fromNom: 'Administration Test', fromRole: 'admin', toIds: [parent1.uid, parent2.uid], subject: 'Bienvenue dans la démonstration', body: 'Ce message teste la réception en temps réel dans les comptes parents.', offset: 10 }),
      makeMessage({ id: 'admin-demo-teacher-announcement', fromId: adminUser.uid, fromNom: 'Administration Test', fromRole: 'admin', toIds: [teacher1.uid, teacher2.uid], subject: 'Message aux enseignants', body: 'Ce message teste la réception en temps réel dans les comptes enseignants.', offset: 20 }),
      makeMessage({ id: 'admin-demo-teacher1-parent1', fromId: teacher1.uid, fromNom: 'Enseignant Test', fromRole: 'professeur', toIds: [parent1.uid], subject: 'Suivi pédagogique', body: 'Message de démonstration envoyé par l’enseignant au parent.', eleveId: child1.codeMassar, classe: child1.classe, offset: 30 }),
      makeMessage({ id: 'admin-demo-parent1-teacher1', fromId: parent1.uid, fromNom: 'Parent Test', fromRole: 'parent', toIds: [teacher1.uid], subject: 'Réponse du parent', body: 'Réponse de démonstration envoyée au professeur.', eleveId: child1.codeMassar, classe: child1.classe, offset: 40 }),
      makeMessage({ id: 'admin-demo-teacher2-parent2', fromId: teacher2.uid, fromNom: 'Enseignant Test 2', fromRole: 'professeur', toIds: [parent2.uid], subject: 'Information de classe', body: 'Deuxième conversation de démonstration enseignant-parent.', eleveId: child2.codeMassar, classe: child2.classe, offset: 50 }),
      makeMessage({ id: 'admin-demo-parent2-teacher2', fromId: parent2.uid, fromNom: 'Parent Test 2', fromRole: 'parent', toIds: [teacher2.uid], subject: 'Confirmation de réception', body: 'Le deuxième parent confirme avoir reçu le message.', eleveId: child2.codeMassar, classe: child2.classe, offset: 60 }),
    ]
    await commitBatches(db, messageRows.map(message => ({ type: 'set', ref: db.collection('messages').doc(message.id), data: message.data })))

    const [usersAfter, studentsAfter, notesAfter, absencesAfter, devoirsAfter, submissionsAfter] = await Promise.all([
      db.collection('users').get(), db.collection('eleves').get(), db.collection('notes').get(),
      db.collection('absences').get(), db.collection('devoirs').get(), db.collection('homeworkSubmissions').get(),
    ])
    const rows = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    const usersRows = rows(usersAfter)
    const studentRows = rows(studentsAfter)
    const noteRows = rows(notesAfter)
    const summary = computeSchoolStats({
      eleves: studentRows, users: usersRows, notes: noteRows,
      absences: rows(absencesAfter), devoirs: rows(devoirsAfter), homeworkSubmissions: rows(submissionsAfter),
    }, { semestre: SEMESTRE })
    await db.collection('stats').doc('summary').set({
      ...summary, academicYear: ACADEMIC_YEAR, semestre: SEMESTRE, monthKey: MONTH_KEY, updatedAt: new Date(),
    })

    const classStatsWrites = TARGET_CLASSES.map(classe => {
      const classNotes = noteRows.filter(note => note.classe === classe && note.academicYear === ACADEMIC_YEAR && note.semestre === SEMESTRE)
      return {
        type: 'set', ref: db.collection('classStats').doc(statsDocId(ACADEMIC_YEAR, classe, SEMESTRE)),
        data: { academicYear: ACADEMIC_YEAR, classe, semestre: SEMESTRE, ...computeClassStats(classNotes), updatedAt: now },
      }
    })
    await commitBatches(db, classStatsWrites)

    const staff = {
      teachers: usersRows.filter(user => user.role === 'professeur').map(user => ({
        uid: user.id, nom: user.nom || '', prenom: user.prenom || '', matiere: user.matiere || '',
        classes: Array.isArray(user.classes) ? user.classes : [],
      })).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')),
      admins: usersRows.filter(user => user.role === 'admin').map(user => ({ uid: user.id, nom: user.nom || '', prenom: user.prenom || '' })),
    }
    await db.collection('directory').doc('staff').set({ ...staff, updatedAt: new Date() })
    await db.collection('directoryAdmin').doc('parents').set({ ...buildParentsDirectory(usersRows, studentRows), updatedAt: new Date() })

    await runRef.set({
      status: 'READY', completedAt: new Date(),
      resultCounts: {
        students: studentRows.length, notes: noteRows.length, classes: TARGET_CLASSES.length,
        behaviorsSeeded: behaviorRows.length, messagesSeeded: messageRows.length,
        parentsLinked: 2, teachersAssigned: 2,
      },
    }, { merge: true })

    console.log(JSON.stringify({
      status: 'READY', students: studentRows.length, notes: noteRows.length,
      classes: TARGET_CLASSES.length, behaviorsSeeded: behaviorRows.length,
      messagesSeeded: messageRows.length, parentsLinked: 2, teachersAssigned: 2,
    }, null, 2))
  } catch (error) {
    await runRef.set({ status: 'FAILED', failedAt: new Date(), errorCode: String(error.code || 'migration-failed') }, { merge: true })
    throw error
  } finally {
    await admin.app().delete()
  }
}

main().catch(error => { console.error(error.message || error); process.exit(1) })
