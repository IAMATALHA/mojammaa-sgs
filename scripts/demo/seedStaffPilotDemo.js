#!/usr/bin/env node
/**
 * Remplit les classes isolées créées par provisionStaffPilot.js avec une
 * démonstration professeur entièrement synthétique.
 *
 * Sécurité :
 *   - dry-run par défaut ;
 *   - classes TEST uniquement, profils portant le provisioningTag attendu ;
 *   - identifiants et noms explicitement factices ;
 *   - IDs déterministes et collision refusée si un document n'est pas taggé ;
 *   - aucune adresse, aucun UID ni mot de passe dans les logs ;
 *   - cleanup ciblé sur demoRunId, sans toucher aux classes réelles.
 *
 * Usage :
 *   node scripts/demo/seedStaffPilotDemo.js \
 *     --manifest .secrets/staff-pilot-2026-09-01.json
 *
 *   node scripts/demo/seedStaffPilotDemo.js \
 *     --manifest .secrets/staff-pilot-2026-09-01.json --commit \
 *     --confirm-project mojammaa-sgs --confirm-teachers 8 --confirm-students 80
 *
 *   node scripts/demo/seedStaffPilotDemo.js \
 *     --manifest .secrets/staff-pilot-2026-09-01.json --cleanup --commit \
 *     --confirm-project mojammaa-sgs --confirm-teachers 8 --confirm-students 80
 */

const fs = require('fs')
const path = require('path')
const { validateManifest } = require('../provisionStaffPilot')
const { syntheticMoroccanName } = require('./lib/syntheticMoroccanNames')

const ROOT = path.join(__dirname, '..', '..')
const ADMIN_KEY = path.join(ROOT, '.secrets', 'firebase-admin.json')
const DEMO_RUN_ID = 'staff-pilot-demo-2026-09-02-v1'
const IMPORTED_BY = `demo:${DEMO_RUN_ID}`
const ANCHOR_DATE = '2026-09-02'
const FALLBACK_SUBJECT = 'Test provisoire'
const STUDENTS_PER_CLASS = 10
const COLLECTIONS = ['eleves', 'notes', 'absences', 'comportements', 'devoirs', 'ressources']

function parseArgs(argv) {
  const out = { commit: false, cleanup: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--commit') out.commit = true
    else if (arg === '--cleanup') out.cleanup = true
    else if (arg === '--manifest') out.manifest = argv[++index]
    else if (arg.startsWith('--manifest=')) out.manifest = arg.slice('--manifest='.length)
    else if (arg === '--confirm-project') out.confirmProject = argv[++index]
    else if (arg.startsWith('--confirm-project=')) out.confirmProject = arg.slice('--confirm-project='.length)
    else if (arg === '--confirm-teachers') out.confirmTeachers = Number(argv[++index])
    else if (arg.startsWith('--confirm-teachers=')) out.confirmTeachers = Number(arg.slice('--confirm-teachers='.length))
    else if (arg === '--confirm-students') out.confirmStudents = Number(argv[++index])
    else if (arg.startsWith('--confirm-students=')) out.confirmStudents = Number(arg.slice('--confirm-students='.length))
    else throw new Error(`Option inconnue : ${arg}`)
  }
  return out
}

function assertPrivateFile(filePath, label) {
  const resolved = path.resolve(ROOT, filePath)
  const stat = fs.statSync(resolved)
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} doit être protégé par chmod 600`)
  return resolved
}

function periodForISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error('Date ISO invalide')
  const year = Number(match[1])
  const month = Number(match[2])
  const schoolYearStart = month >= 9 ? year : year - 1
  return {
    academicYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${match[1]}-${match[2]}`,
  }
}

function safeSegment(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function classCode(classe) {
  return classe.slice(classe.lastIndexOf('-') + 1).toUpperCase()
}

function studentId(classe, position) {
  return `DEMO-20260902-${classCode(classe)}-${String(position).padStart(2, '0')}`
}

function gradeFor(position) {
  return [8.5, 10, 11.5, 12, 13.5, 14, 15.5, 16, 17, 9.5][position - 1]
}

function buildTeacherDataset(teacher, teacherUid, teacherLabel) {
  const subject = teacher.matiere || FALLBACK_SUBJECT
  const period = periodForISO(ANCHOR_DATE)
  const students = Array.from({ length: STUDENTS_PER_CLASS }, (_, offset) => {
    const position = offset + 1
    const id = studentId(teacher.testClass, position)
    const identity = syntheticMoroccanName(offset, Number(classCode(teacher.testClass).slice(1)) || 0)
    return {
      id,
      data: {
        codeMassar: id,
        ...identity,
        classe: teacher.testClass,
        classes: [teacher.testClass],
        niveau: 'DEMO',
        cycle: teacher.cycle,
        academicYear: period.academicYear,
        active: true,
        demo: true,
        isTestData: true,
        testDataKind: 'staff-pilot-student',
        demoRunId: DEMO_RUN_ID,
        provisioningTag: teacher.provisioningTag,
        importedBy: IMPORTED_BY,
      },
    }
  })

  const notes = students.map((student, offset) => {
    const position = offset + 1
    const average = gradeFor(position)
    const control1 = Math.max(0, average - 1)
    const control2 = Math.min(20, average + 1)
    return {
      id: `${student.id}_${period.academicYear}_${period.semestre}_${safeSegment(subject)}`,
      data: {
        eleveId: student.id,
        codeMassar: student.id,
        eleveNom: student.data.nom,
        elevePrenom: student.data.prenom,
        classe: teacher.testClass,
        cycle: teacher.cycle,
        academicYear: period.academicYear,
        semestre: period.semestre,
        monthKey: period.monthKey,
        matiere: subject,
        matiereLabel: subject,
        bareme: 20,
        note: average,
        controles: [
          { numero: 1, label: 'Contrôle 1', note: control1 },
          { numero: 2, label: 'Contrôle 2', note: control2 },
        ],
        controls: [control1, control2],
        controlesCount: 2,
        demo: true,
        demoRunId: DEMO_RUN_ID,
        provisioningTag: teacher.provisioningTag,
        importedBy: IMPORTED_BY,
      },
    }
  })

  const attendanceStates = ['absent', 'retard', 'absent']
  const absences = attendanceStates.map((statut, offset) => ({
    id: `${DEMO_RUN_ID}-${classCode(teacher.testClass)}-attendance-${offset + 1}`,
    data: {
      eleveId: students[offset].id,
      eleveNom: students[offset].data.nom,
      elevePrenom: students[offset].data.prenom,
      classe: teacher.testClass,
      date: ANCHOR_DATE,
      seance: 'S1',
      seanceCode: 'S1',
      seanceLabel: '09:00 - 10:00',
      statut,
      professorId: teacherUid,
      professorNom: teacherLabel,
      ...period,
      demo: true,
      demoRunId: DEMO_RUN_ID,
      provisioningTag: teacher.provisioningTag,
    },
  }))

  const comportements = [
    { kind: 'merite', reason: 'participation', points: 1 },
    { kind: 'avertissement', reason: 'homeworkNotDone', points: -1 },
  ].map((row, offset) => ({
    id: `${DEMO_RUN_ID}-${classCode(teacher.testClass)}-behavior-${offset + 1}`,
    data: {
      eleveId: students[offset + 3].id,
      eleveNom: students[offset + 3].data.nom,
      elevePrenom: students[offset + 3].data.prenom,
      classe: teacher.testClass,
      date: ANCHOR_DATE,
      seance: 'S2',
      teacherId: teacherUid,
      teacherNom: teacherLabel,
      comment: 'Entrée de démonstration',
      ...row,
      demo: true,
      demoRunId: DEMO_RUN_ID,
      provisioningTag: teacher.provisioningTag,
    },
  }))

  const devoirs = [{
    id: `${DEMO_RUN_ID}-${classCode(teacher.testClass)}-homework`,
    data: {
      titre: 'Exercice de démonstration',
      description: `Activité de démonstration en ${subject}.`,
      type: 'Maison',
      classeId: teacher.testClass,
      teacherId: teacherUid,
      teacherNom: teacherLabel,
      dateLimite: '2026-09-09',
      attachments: [],
      ...period,
      demo: true,
      demoRunId: DEMO_RUN_ID,
      provisioningTag: teacher.provisioningTag,
    },
  }]

  const ressources = [{
    id: `${DEMO_RUN_ID}-${classCode(teacher.testClass)}-resource`,
    data: {
      titre: 'Support de cours — démonstration',
      description: `Exemple de ressource visible pour la classe ${teacher.testClass}.`,
      matiere: subject,
      classeId: teacher.testClass,
      teacherId: teacherUid,
      teacherNom: teacherLabel,
      attachments: [],
      viewedBy: [],
      ...period,
      demo: true,
      demoRunId: DEMO_RUN_ID,
      provisioningTag: teacher.provisioningTag,
    },
  }]

  return { subject, students, notes, absences, comportements, devoirs, ressources }
}

function publicSummary(mode, teachers, datasets, extra = {}) {
  const count = name => datasets.reduce((sum, dataset) => sum + dataset[name].length, 0)
  return {
    mode,
    project: 'mojammaa-sgs',
    runId: DEMO_RUN_ID,
    academicYear: periodForISO(ANCHOR_DATE).academicYear,
    teachers: teachers.length,
    classes: teachers.length,
    students: count('students'),
    notes: count('notes'),
    absences: count('absences'),
    behaviors: count('comportements'),
    homework: count('devoirs'),
    resources: count('ressources'),
    realClassesReferenced: 0,
    ...extra,
  }
}

async function authUserByEmail(auth, email) {
  try { return await auth.getUserByEmail(email) }
  catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

async function resolveTeachers(manifest, auth, db) {
  const teachers = manifest.users.filter(user => user.role === 'professeur')
  const resolved = []
  for (const teacher of teachers) {
    if (!teacher.testClass.startsWith('TEST-')) throw new Error('Une classe non synthétique a été détectée')
    const authUser = await authUserByEmail(auth, teacher.email)
    if (!authUser || authUser.disabled) throw new Error(`Compte professeur indisponible à l’index ${teacher.index}`)
    const profile = await db.collection('users').doc(authUser.uid).get()
    if (!profile.exists || profile.get('role') !== 'professeur') {
      throw new Error(`Profil professeur invalide à l’index ${teacher.index}`)
    }
    if (profile.get('provisioningTag') !== manifest.provisioningTag) {
      throw new Error(`Profil hors pilote à l’index ${teacher.index}`)
    }
    const classes = Array.isArray(profile.get('classes')) ? profile.get('classes') : []
    if (classes.length !== 1 || classes[0] !== teacher.testClass) {
      throw new Error(`Périmètre de classe inattendu à l’index ${teacher.index}`)
    }
    resolved.push({
      ...teacher,
      provisioningTag: manifest.provisioningTag,
      uid: authUser.uid,
      label: [profile.get('prenom'), profile.get('nom')].filter(Boolean).join(' '),
      liveSubject: String(profile.get('matiere') || '').trim(),
      profile,
    })
  }
  return resolved
}

function operationsFor(db, teachers, datasets, admin) {
  const operations = []
  teachers.forEach((teacher, index) => {
    const dataset = datasets[index]
    const mapping = [
      ['eleves', dataset.students], ['notes', dataset.notes],
      ['absences', dataset.absences], ['comportements', dataset.comportements],
      ['devoirs', dataset.devoirs], ['ressources', dataset.ressources],
    ]
    mapping.forEach(([collection, rows]) => rows.forEach(row => operations.push({
      type: 'set', collection, ref: db.collection(collection).doc(row.id),
      data: { ...row.data, createdAt: admin.firestore.FieldValue.serverTimestamp() },
    })))
    if (!teacher.liveSubject) {
      operations.push({
        type: 'update', collection: 'users', ref: teacher.profile.ref,
        data: {
          matiere: FALLBACK_SUBJECT,
          pilotDemoTag: DEMO_RUN_ID,
          pilotDemoOriginalMatiere: '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      })
    }
  })
  return operations
}

async function assertNoForeignCollisions(operations) {
  const setOperations = operations.filter(operation => operation.type === 'set')
  const snapshots = await Promise.all(setOperations.map(operation => operation.ref.get()))
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists && snapshot.get('demoRunId') !== DEMO_RUN_ID) {
      throw new Error(`Collision avec un document non géré dans ${setOperations[index].collection}`)
    }
  })
  return snapshots.filter(snapshot => snapshot.exists).length
}

async function commitOperations(db, operations) {
  let completed = 0
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch()
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.type === 'update') batch.update(operation.ref, operation.data)
      else batch.set(operation.ref, operation.data)
    }
    await batch.commit()
    completed += Math.min(400, operations.length - offset)
  }
  return completed
}

async function verifyAdminState(db, teachers, datasets) {
  const counts = Object.fromEntries(COLLECTIONS.map(collection => [collection, 0]))
  for (const collection of COLLECTIONS) {
    const snapshot = await db.collection(collection).where('demoRunId', '==', DEMO_RUN_ID).get()
    counts[collection] = snapshot.size
  }
  const expected = {
    eleves: datasets.reduce((sum, row) => sum + row.students.length, 0),
    notes: datasets.reduce((sum, row) => sum + row.notes.length, 0),
    absences: datasets.reduce((sum, row) => sum + row.absences.length, 0),
    comportements: datasets.reduce((sum, row) => sum + row.comportements.length, 0),
    devoirs: datasets.reduce((sum, row) => sum + row.devoirs.length, 0),
    ressources: datasets.reduce((sum, row) => sum + row.ressources.length, 0),
  }
  for (const collection of COLLECTIONS) {
    if (counts[collection] !== expected[collection]) throw new Error(`Vérification ${collection} en échec`)
  }
  for (const teacher of teachers) {
    const profile = await teacher.profile.ref.get()
    const expectedSubject = teacher.liveSubject || FALLBACK_SUBJECT
    if (profile.get('matiere') !== expectedSubject) throw new Error('Matière professeur non conforme')
  }
  return counts
}

async function cleanup(db, teachers, datasets, admin) {
  const operations = []
  const expectedRefs = new Map()
  COLLECTIONS.forEach(collection => expectedRefs.set(collection, new Set()))
  datasets.forEach(dataset => {
    const mapping = [
      ['eleves', dataset.students], ['notes', dataset.notes],
      ['absences', dataset.absences], ['comportements', dataset.comportements],
      ['devoirs', dataset.devoirs], ['ressources', dataset.ressources],
    ]
    mapping.forEach(([collection, rows]) => rows.forEach(row => expectedRefs.get(collection).add(row.id)))
  })

  for (const collection of COLLECTIONS) {
    const snapshot = await db.collection(collection).where('demoRunId', '==', DEMO_RUN_ID).get()
    for (const document of snapshot.docs) {
      if (!expectedRefs.get(collection).has(document.id)) throw new Error(`Document géré inattendu dans ${collection}`)
      operations.push({ type: 'delete', collection, ref: document.ref })
    }
  }
  for (const teacher of teachers) {
    const profile = await teacher.profile.ref.get()
    if (profile.get('pilotDemoTag') === DEMO_RUN_ID) {
      if (profile.get('matiere') !== FALLBACK_SUBJECT || profile.get('pilotDemoOriginalMatiere') !== '') {
        throw new Error('Profil de matière modifié depuis le seed : cleanup annulé')
      }
      operations.push({
        type: 'update', collection: 'users', ref: profile.ref,
        data: {
          matiere: admin.firestore.FieldValue.delete(),
          pilotDemoTag: admin.firestore.FieldValue.delete(),
          pilotDemoOriginalMatiere: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      })
    }
  }
  let completed = 0
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch()
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.type === 'delete') batch.delete(operation.ref)
      else batch.update(operation.ref, operation.data)
    }
    await batch.commit()
    completed += Math.min(400, operations.length - offset)
  }
  return completed
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.manifest) throw new Error('--manifest est obligatoire')
  const manifestPath = assertPrivateFile(options.manifest, 'Le manifeste')
  const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  const manifestTeachers = manifest.users.filter(user => user.role === 'professeur')
  const totalStudents = manifestTeachers.length * STUDENTS_PER_CLASS

  if (options.commit) {
    if (options.confirmProject !== manifest.projectId) throw new Error('--confirm-project incorrect ou absent')
    if (options.confirmTeachers !== manifestTeachers.length) throw new Error('--confirm-teachers incorrect ou absent')
    if (options.confirmStudents !== totalStudents) throw new Error('--confirm-students incorrect ou absent')
  }

  if (!fs.existsSync(ADMIN_KEY)) throw new Error('Clé Firebase Admin introuvable')
  const admin = require('firebase-admin')
  const key = require(ADMIN_KEY)
  if (key.project_id !== manifest.projectId) throw new Error('Projet Firebase incohérent')
  const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  const db = admin.firestore(app)
  const auth = admin.auth(app)
  try {
    const teachers = await resolveTeachers(manifest, auth, db)
    const datasets = teachers.map(teacher => buildTeacherDataset(
      { ...teacher, matiere: teacher.liveSubject || FALLBACK_SUBJECT },
      teacher.uid,
      teacher.label,
    ))

    if (options.cleanup) {
      if (!options.commit) {
        const current = {}
        for (const collection of COLLECTIONS) {
          current[collection] = (await db.collection(collection).where('demoRunId', '==', DEMO_RUN_ID).get()).size
        }
        console.log(JSON.stringify(publicSummary('CLEANUP_DRY_RUN', teachers, datasets, { current, status: 'PASS' }), null, 2))
        return
      }
      const deletedOrRestored = await cleanup(db, teachers, datasets, admin)
      console.log(JSON.stringify(publicSummary('CLEANUP', teachers, datasets, { deletedOrRestored, status: 'PASS' }), null, 2))
      return
    }

    const operations = operationsFor(db, teachers, datasets, admin)
    const existingManaged = await assertNoForeignCollisions(operations)
    if (!options.commit) {
      console.log(JSON.stringify(publicSummary('DRY_RUN', teachers, datasets, {
        existingManaged,
        fallbackSubjects: teachers.filter(teacher => !teacher.liveSubject).length,
        writesPlanned: operations.length,
        status: 'PASS',
      }), null, 2))
      return
    }

    const writes = await commitOperations(db, operations)
    const counts = await verifyAdminState(db, teachers, datasets)
    await db.collection('_presentationRuns').doc(DEMO_RUN_ID).set({
      runId: DEMO_RUN_ID,
      projectId: manifest.projectId,
      provisioningTag: manifest.provisioningTag,
      academicYear: periodForISO(ANCHOR_DATE).academicYear,
      anchorDate: ANCHOR_DATE,
      counts,
      status: 'READY',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    console.log(JSON.stringify(publicSummary('COMMIT', teachers, datasets, {
      writes,
      fallbackSubjects: teachers.filter(teacher => !teacher.liveSubject).length,
      status: 'PASS',
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
  ANCHOR_DATE,
  DEMO_RUN_ID,
  FALLBACK_SUBJECT,
  STUDENTS_PER_CLASS,
  buildTeacherDataset,
  gradeFor,
  parseArgs,
  periodForISO,
  publicSummary,
  studentId,
}
