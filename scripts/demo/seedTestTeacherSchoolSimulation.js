#!/usr/bin/env node
/**
 * Simulation scolaire isolée du compte test-teacher@mojammaa.com.
 *
 * - 3 classes aux libellés scolaires normaux, 20 élèves fictifs par classe ;
 * - noms marocains réalistes générés localement, aucun roster réel ;
 * - notes, appel, comportements, devoirs et ressources 2026-2027 ;
 * - EDT complet lundi-vendredi, 4 séances par jour ;
 * - dry-run par défaut, snapshot privé et cleanup ciblé disponibles.
 */

const fs = require('fs')
const path = require('path')
const { syntheticMoroccanName } = require('./lib/syntheticMoroccanNames')

const ROOT = path.join(__dirname, '..', '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const SNAPSHOT_PATH = path.join(ROOT, '.secrets', 'test-teacher-school-simulation.snapshot.json')
const TARGET_EMAIL = 'test-teacher@mojammaa.com'
const RUN_ID = 'test-teacher-school-simulation-2026-09-02-v1'
// Classes collège conformes au catalogue de l'école : chaque niveau va de 1 à 4.
// Le préflight ci-dessous refuse toute collision avec une classe réelle.
const CLASSES = ['1APIC-1', '2APIC-1', '3APIC-3']
const STUDENTS_PER_CLASS = 20
const ANCHOR_DATE = '2026-09-02'
const PERIOD = { academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-09' }
const SUBJECT = 'Mathématiques'
const COLLECTIONS = ['eleves', 'notes', 'absences', 'comportements', 'devoirs', 'ressources']

function parseArgs(argv) {
  const out = { commit: false, cleanup: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--commit') out.commit = true
    else if (arg === '--cleanup') out.cleanup = true
    else if (arg === '--confirm-project') out.confirmProject = argv[++index]
    else if (arg.startsWith('--confirm-project=')) out.confirmProject = arg.slice('--confirm-project='.length)
    else if (arg === '--confirm-classes') out.confirmClasses = Number(argv[++index])
    else if (arg.startsWith('--confirm-classes=')) out.confirmClasses = Number(arg.slice('--confirm-classes='.length))
    else if (arg === '--confirm-students') out.confirmStudents = Number(argv[++index])
    else if (arg.startsWith('--confirm-students=')) out.confirmStudents = Number(arg.slice('--confirm-students='.length))
    else throw new Error(`Option inconnue : ${arg}`)
  }
  return out
}

function classCode(classe) {
  return classe.replace(/[^A-Z0-9]+/g, '-')
}

function studentId(classe, position) {
  return `DEMO-2026-${classCode(classe)}-${String(position).padStart(2, '0')}`
}

function gradeFor(classIndex, position) {
  const values = [7.5, 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 8.5, 12.5]
  return Math.max(0, Math.min(20, values[(position + classIndex * 4) % values.length]))
}

function buildSchedule() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  const periods = [
    ['08:30', '09:30', 'S1'],
    ['09:30', '10:30', 'S2'],
    ['10:45', '11:45', 'S3'],
    ['14:00', '15:00', 'S4'],
  ]
  return days.flatMap((day, dayIndex) => periods.map(([startTime, endTime, seance], slotIndex) => {
    const classe = CLASSES[(dayIndex + slotIndex) % CLASSES.length]
    return {
      day, startTime, endTime, durationMin: 60, seance,
      classe, subject: SUBJECT, room: `Salle ${12 + ((dayIndex + slotIndex) % 3)}`,
    }
  }))
}

function buildSimulation(teacherUid, teacherLabel) {
  const schedule = buildSchedule()
  const students = []
  const notes = []
  const absences = []
  const comportements = []
  const devoirs = []
  const ressources = []

  CLASSES.forEach((classe, classIndex) => {
    const classStudents = []
    for (let offset = 0; offset < STUDENTS_PER_CLASS; offset += 1) {
      const position = offset + 1
      const id = studentId(classe, position)
      const identity = syntheticMoroccanName(offset, classIndex + 20)
      const student = {
        id,
        data: {
          codeMassar: id,
          ...identity,
          classe,
          classes: [classe],
          niveau: classe.split('-')[0],
          cycle: 'college',
          academicYear: PERIOD.academicYear,
          active: true,
          demo: true,
          isTestData: true,
          testDataKind: 'school-simulation-student',
          demoRunId: RUN_ID,
          importedBy: `demo:${RUN_ID}`,
        },
      }
      students.push(student)
      classStudents.push(student)

      const average = gradeFor(classIndex, offset)
      const control1 = Math.max(0, average - 1)
      const control2 = Math.min(20, average + 1)
      notes.push({
        id: `${id}_${PERIOD.academicYear}_${PERIOD.semestre}_mathematiques`,
        data: {
          eleveId: id, codeMassar: id,
          eleveNom: identity.nom, elevePrenom: identity.prenom,
          classe, cycle: 'college', niveau: student.data.niveau,
          ...PERIOD, matiere: SUBJECT, matiereLabel: SUBJECT,
          bareme: 20, note: average,
          controles: [
            { numero: 1, label: 'Contrôle 1', note: control1 },
            { numero: 2, label: 'Contrôle 2', note: control2 },
          ],
          controls: [control1, control2], controlesCount: 2,
          demo: true, demoRunId: RUN_ID, importedBy: `demo:${RUN_ID}`,
        },
      })
    }

    const wednesdaySlot = schedule.find(slot => slot.day === 'wednesday' && slot.classe === classe)
    ;['absent', 'retard', 'absent', 'absent'].forEach((statut, index) => {
      const student = classStudents[index]
      absences.push({
        id: `${RUN_ID}-${classCode(classe)}-attendance-${index + 1}`,
        data: {
          eleveId: student.id, eleveNom: student.data.nom, elevePrenom: student.data.prenom,
          classe, date: ANCHOR_DATE, seance: wednesdaySlot?.seance || 'S1',
          seanceCode: wednesdaySlot?.seance || 'S1',
          seanceLabel: wednesdaySlot ? `${wednesdaySlot.startTime} - ${wednesdaySlot.endTime}` : '08:30 - 09:30',
          statut, professorId: teacherUid, professorNom: teacherLabel,
          ...PERIOD, demo: true, demoRunId: RUN_ID,
        },
      })
    })

    const behaviorRows = [
      { kind: 'merite', reason: 'participation', points: 2 },
      { kind: 'merite', reason: 'remarkableEffort', points: 2 },
      { kind: 'avertissement', reason: 'homeworkNotDone', points: -1 },
      { kind: 'avertissement', reason: 'forgotMaterials', points: -1 },
    ]
    behaviorRows.forEach((row, index) => {
      const student = classStudents[index + 4]
      comportements.push({
        id: `${RUN_ID}-${classCode(classe)}-behavior-${index + 1}`,
        data: {
          eleveId: student.id, eleveNom: student.data.nom, elevePrenom: student.data.prenom,
          classe, date: ANCHOR_DATE, seance: `S${(index % 4) + 1}`,
          teacherId: teacherUid, teacherNom: teacherLabel,
          comment: 'Situation fictive de simulation scolaire.',
          ...row, demo: true, demoRunId: RUN_ID,
        },
      })
    })

    ;[
      ['Série de calcul numérique', 'Maison', 'Exercices 1 à 8 à préparer.'],
      ['Préparation du contrôle', 'Révision', 'Réviser les propriétés et les exemples du cours.'],
    ].forEach(([titre, type, description], index) => devoirs.push({
      id: `${RUN_ID}-${classCode(classe)}-homework-${index + 1}`,
      data: {
        titre, description, type, classeId: classe,
        teacherId: teacherUid, teacherNom: teacherLabel,
        dateLimite: index === 0 ? '2026-09-09' : '2026-09-14',
        attachments: [], ...PERIOD, demo: true, demoRunId: RUN_ID,
      },
    }))

    ressources.push({
      id: `${RUN_ID}-${classCode(classe)}-resource`,
      data: {
        titre: 'Fiche de méthode — calcul numérique',
        description: 'Résumé fictif du cours et méthode de résolution.',
        matiere: SUBJECT, classeId: classe,
        teacherId: teacherUid, teacherNom: teacherLabel,
        attachments: [], viewedBy: [], ...PERIOD,
        demo: true, demoRunId: RUN_ID,
      },
    })
  })
  return { schedule, students, notes, absences, comportements, devoirs, ressources }
}

function summary(mode, simulation, extra = {}) {
  return {
    mode, project: 'mojammaa-sgs', runId: RUN_ID,
    classes: CLASSES.length, students: simulation.students.length,
    notes: simulation.notes.length, absences: simulation.absences.length,
    behaviors: simulation.comportements.length, homework: simulation.devoirs.length,
    resources: simulation.ressources.length, weeklySlots: simulation.schedule.length,
    schoolStyleClasses: CLASSES, nonSimulationRecordsReferenced: 0, ...extra,
  }
}

function writeSnapshot(body) {
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const current = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
    if (!Array.isArray(current.legacyHomework)) {
      current.legacyHomework = body.legacyHomework || []
      fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
      fs.chmodSync(SNAPSHOT_PATH, 0o600)
    }
    return
  }
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  fs.chmodSync(SNAPSHOT_PATH, 0o600)
}

async function commitBatch(db, operations) {
  const batch = db.batch()
  for (const operation of operations) {
    if (operation.type === 'delete') batch.delete(operation.ref)
    else if (operation.type === 'update') batch.update(operation.ref, operation.data)
    else batch.set(operation.ref, operation.data, operation.options || {})
  }
  await batch.commit()
}

async function waitForScheduleProjection(db, teacherUid, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await db.collection('emploiDuTemps').where('teacherUid', '==', teacherUid).get()
    if (snapshot.size === 20 && snapshot.docs.every(doc => CLASSES.includes(doc.get('classeId')))) return snapshot.size
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Projection emploiDuTemps non synchronisée dans le délai prévu')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(KEY_PATH)) throw new Error('Clé Firebase Admin introuvable')
  const admin = require('firebase-admin')
  const key = require(KEY_PATH)
  if (key.project_id !== 'mojammaa-sgs') throw new Error('Projet Firebase inattendu')
  if (options.commit) {
    if (options.confirmProject !== key.project_id) throw new Error('--confirm-project incorrect ou absent')
    if (options.confirmClasses !== CLASSES.length) throw new Error('--confirm-classes incorrect ou absent')
    if (options.confirmStudents !== CLASSES.length * STUDENTS_PER_CLASS) throw new Error('--confirm-students incorrect ou absent')
  }

  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  const db = admin.firestore(app)
  const auth = admin.auth(app)
  try {
    const authUser = await auth.getUserByEmail(TARGET_EMAIL)
    if (authUser.disabled) throw new Error('Compte test-teacher désactivé')
    const profile = await db.collection('users').doc(authUser.uid).get()
    const schedule = await db.collection('schedules').doc(authUser.uid).get()
    if (!profile.exists || profile.get('role') !== 'professeur' || profile.get('isTestData') !== true) {
      throw new Error('Le compte cible n’est pas un professeur de test confirmé')
    }
    if (profile.get('matiere') !== SUBJECT) throw new Error('La matière du compte cible n’est pas Mathématiques')
    const teacherLabel = [profile.get('prenom'), profile.get('nom')].filter(Boolean).join(' ')
    const simulation = buildSimulation(authUser.uid, teacherLabel)

    if (options.cleanup) {
      if (!fs.existsSync(SNAPSHOT_PATH)) throw new Error('Snapshot de restauration introuvable')
      const saved = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
      if (saved.runId !== RUN_ID || saved.teacherUid !== authUser.uid) throw new Error('Snapshot incompatible')
      const deletes = []
      for (const collection of COLLECTIONS) {
        const managed = await db.collection(collection).where('demoRunId', '==', RUN_ID).get()
        managed.docs.forEach(doc => deletes.push({ type: 'delete', ref: doc.ref }))
      }
      if (!options.commit) {
        console.log(JSON.stringify(summary('CLEANUP_DRY_RUN', simulation, { deletes: deletes.length, status: 'PASS' }), null, 2))
        return
      }
      for (let offset = 0; offset < deletes.length; offset += 400) await commitBatch(db, deletes.slice(offset, offset + 400))
      if (Array.isArray(saved.legacyHomework) && saved.legacyHomework.length > 0) {
        await commitBatch(db, saved.legacyHomework.map(row => ({
          type: 'update', ref: db.collection('devoirs').doc(row.id),
          data: {
            teacherId: row.teacherId,
            teacherNom: row.teacherNom,
            reassignedBySimulation: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        })))
      }
      await db.collection('users').doc(authUser.uid).set({
        classes: saved.profile.classes,
        classe: saved.profile.hasClasse ? saved.profile.classe : admin.firestore.FieldValue.delete(),
        simulationTag: saved.profile.hasSimulationTag
          ? saved.profile.simulationTag
          : admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
      await db.collection('schedules').doc(authUser.uid).set({
        uid: authUser.uid,
        teacherUid: authUser.uid,
        weeklySlots: saved.schedule.weeklySlots,
        simulationTag: saved.schedule.hasSimulationTag
          ? saved.schedule.simulationTag
          : admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
      console.log(JSON.stringify(summary('CLEANUP', simulation, { deletes: deletes.length, status: 'PASS' }), null, 2))
      return
    }

    for (const classe of CLASSES) {
      const [studentsInClass, profilesInClass] = await Promise.all([
        db.collection('eleves').where('classe', '==', classe).get(),
        db.collection('users').where('classes', 'array-contains', classe).get(),
      ])
      if (studentsInClass.docs.some(doc => doc.get('demoRunId') !== RUN_ID)) throw new Error(`Collision élève dans ${classe}`)
      if (profilesInClass.docs.some(doc => doc.id !== authUser.uid)) throw new Error(`Collision professeur dans ${classe}`)
    }

    const mapping = [
      ['eleves', simulation.students], ['notes', simulation.notes],
      ['absences', simulation.absences], ['comportements', simulation.comportements],
      ['devoirs', simulation.devoirs], ['ressources', simulation.ressources],
    ]
    const writes = []
    let staleManagedDeletes = 0
    for (const [collection, rows] of mapping) {
      const desiredIds = new Set(rows.map(row => row.id))
      const managed = await db.collection(collection).where('demoRunId', '==', RUN_ID).get()
      managed.docs.forEach(doc => {
        if (!desiredIds.has(doc.id)) {
          writes.push({ type: 'delete', ref: doc.ref })
          staleManagedDeletes += 1
        }
      })
      for (const row of rows) {
        const ref = db.collection(collection).doc(row.id)
        const existing = await ref.get()
        if (existing.exists && existing.get('demoRunId') !== RUN_ID) throw new Error(`Collision non gérée dans ${collection}`)
        writes.push({
          type: 'set', ref,
          data: { ...row.data, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        })
      }
    }
    writes.push({
      type: 'set', ref: profile.ref, options: { merge: true },
      data: {
        classes: CLASSES, classe: CLASSES[0], simulationTag: RUN_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    })
    writes.push({
      type: 'set', ref: db.collection('schedules').doc(authUser.uid), options: { merge: true },
      data: {
        uid: authUser.uid, teacherUid: authUser.uid,
        weeklySlots: simulation.schedule, simulationTag: RUN_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    })

    const teacher2Auth = await auth.getUserByEmail('test-teacher2@mojammaa.com')
    const teacher2Profile = await db.collection('users').doc(teacher2Auth.uid).get()
    if (!teacher2Profile.exists || teacher2Profile.get('role') !== 'professeur') {
      throw new Error('Professeur de reprise des anciens devoirs indisponible')
    }
    const teacher2Classes = new Set(teacher2Profile.get('classes') || [])
    const teacher2Label = [teacher2Profile.get('prenom'), teacher2Profile.get('nom')].filter(Boolean).join(' ')
    const ownedHomework = await db.collection('devoirs').where('teacherId', '==', authUser.uid).get()
    const legacyHomework = ownedHomework.docs.filter(doc => (
      !CLASSES.includes(String(doc.get('classeId') || '')) && doc.get('demoRunId') !== RUN_ID
    ))
    if (legacyHomework.some(doc => !teacher2Classes.has(String(doc.get('classeId') || '')))) {
      throw new Error('Un ancien devoir ne peut pas être repris par le professeur de l’ancienne démo')
    }
    legacyHomework.forEach(doc => writes.push({
      type: 'update', ref: doc.ref,
      data: {
        teacherId: teacher2Auth.uid,
        teacherNom: teacher2Label,
        reassignedBySimulation: RUN_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }))

    if (!options.commit) {
      console.log(JSON.stringify(summary('DRY_RUN', simulation, {
        writesPlanned: writes.length, previousClasses: (profile.get('classes') || []).length,
        previousSlots: (schedule.get('weeklySlots') || []).length,
        legacyHomeworkToReassign: legacyHomework.length,
        staleManagedDeletes, status: 'PASS',
      }), null, 2))
      return
    }

    writeSnapshot({
      runId: RUN_ID, projectId: key.project_id, teacherUid: authUser.uid,
      profile: {
        classes: profile.get('classes') || [],
        hasClasse: typeof profile.get('classe') === 'string' && profile.get('classe').length > 0,
        classe: profile.get('classe') || null,
        hasSimulationTag: typeof profile.get('simulationTag') === 'string',
        simulationTag: profile.get('simulationTag') || null,
      },
      schedule: {
        weeklySlots: schedule.exists && Array.isArray(schedule.get('weeklySlots')) ? schedule.get('weeklySlots') : [],
        hasSimulationTag: schedule.exists && typeof schedule.get('simulationTag') === 'string',
        simulationTag: schedule.exists ? schedule.get('simulationTag') || null : null,
      },
      legacyHomework: legacyHomework.map(doc => ({
        id: doc.id,
        teacherId: doc.get('teacherId'),
        teacherNom: doc.get('teacherNom') || '',
      })),
      createdAt: new Date().toISOString(),
    })
    await commitBatch(db, writes)
    const projectedSlots = await waitForScheduleProjection(db, authUser.uid)
    const counts = {}
    for (const collection of COLLECTIONS) {
      counts[collection] = (await db.collection(collection).where('demoRunId', '==', RUN_ID).get()).size
    }
    await db.collection('_presentationRuns').doc(RUN_ID).set({
      runId: RUN_ID, projectId: key.project_id, target: 'test-teacher',
      classes: CLASSES, academicYear: PERIOD.academicYear,
      counts, weeklySlots: simulation.schedule.length, status: 'READY',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    console.log(JSON.stringify(summary('COMMIT', simulation, {
      writes: writes.length, projectedSlots,
      legacyHomeworkReassigned: legacyHomework.length,
      staleManagedDeletes, status: 'PASS',
    }), null, 2))
  } finally {
    await app.delete()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'FAIL', error: error.message }))
    process.exit(1)
  })
}

module.exports = {
  ANCHOR_DATE, CLASSES, PERIOD, RUN_ID, STUDENTS_PER_CLASS, SUBJECT,
  buildSchedule, buildSimulation, gradeFor, parseArgs, studentId, summary,
}
