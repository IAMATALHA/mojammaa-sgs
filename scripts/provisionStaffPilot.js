#!/usr/bin/env node
/**
 * Provisionne un petit lot de comptes staff et des EDT de démonstration isolés.
 *
 * Sécurité :
 *   - simulation par défaut ; --commit obligatoire pour écrire ;
 *   - manifeste et mot de passe hors Git (.secrets, chmod 600) ;
 *   - aucune adresse, UID ou mot de passe dans les logs ;
 *   - préflight global avant la première mutation ;
 *   - classes TEST uniques et contrôle des collisions emploiDuTemps ;
 *   - --cleanup retire uniquement les EDT/classes du pilote, pas les comptes.
 *
 * Usage :
 *   node scripts/provisionStaffPilot.js --manifest .secrets/staff-pilot.json
 *   node scripts/provisionStaffPilot.js --manifest .secrets/staff-pilot.json \
 *     --password-file .secrets/staff-pilot.credentials.json --commit \
 *     --confirm-project mojammaa-sgs --confirm-create 11
 *   node scripts/provisionStaffPilot.js --manifest .secrets/staff-pilot.json \
 *     --cleanup --commit --confirm-project mojammaa-sgs
 */

const fs = require('fs')
const path = require('path')
const { slotId } = require('../functions/emploiDuTempsSync')
const { randomPassword } = require('./lib/password')

const ROOT = path.join(__dirname, '..')
const ADMIN_KEY = path.join(ROOT, '.secrets', 'firebase-admin.json')
const TEST_CLASS_PREFIX = 'TEST-2026-09-01-'
const ALLOWED_ROLES = new Set(['professeur', 'admin'])

function parseArgs(argv) {
  const out = { commit: false, cleanup: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--commit') out.commit = true
    else if (arg === '--cleanup') out.cleanup = true
    else if (arg === '--manifest') out.manifest = argv[++i]
    else if (arg.startsWith('--manifest=')) out.manifest = arg.slice('--manifest='.length)
    else if (arg === '--password-file') out.passwordFile = argv[++i]
    else if (arg.startsWith('--password-file=')) out.passwordFile = arg.slice('--password-file='.length)
    else if (arg === '--generate-passwords') out.generatePasswords = argv[++i]
    else if (arg.startsWith('--generate-passwords=')) out.generatePasswords = arg.slice('--generate-passwords='.length)
    else if (arg === '--confirm-project') out.confirmProject = argv[++i]
    else if (arg.startsWith('--confirm-project=')) out.confirmProject = arg.slice('--confirm-project='.length)
    else if (arg === '--confirm-create') out.confirmCreate = Number(argv[++i])
    else if (arg.startsWith('--confirm-create=')) out.confirmCreate = Number(arg.slice('--confirm-create='.length))
    else throw new Error(`Option inconnue : ${arg}`)
  }
  return out
}

function clean(value) {
  return String(value == null ? '' : value).trim()
}

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function safeTag(value) {
  const tag = clean(value)
  if (!/^[a-z0-9][a-z0-9-]{5,80}$/i.test(tag)) {
    throw new Error('provisioningTag invalide')
  }
  return tag
}

function buildSchedule(user) {
  if (user.role !== 'professeur') return []
  const subject = clean(user.matiere) || 'Test provisoire'
  const base = [
    ['09:00', '10:00', 60, 'S1'],
    ['10:15', '11:15', 60, 'S2'],
    ['11:30', '12:30', 60, 'S3'],
  ]
  return base.map(([startTime, endTime, durationMin, seance]) => ({
    day: 'tuesday',
    startTime,
    endTime,
    durationMin,
    classe: user.testClass,
    subject,
    room: 'Salle test',
    seance,
  }))
}

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Manifeste JSON invalide')
  const projectId = clean(raw.projectId)
  if (projectId !== 'mojammaa-sgs') throw new Error('Le manifeste doit cibler mojammaa-sgs')
  const provisioningTag = safeTag(raw.provisioningTag)
  const provisionalFor = clean(raw.provisionalFor)
  const cleanupAfter = clean(raw.cleanupAfter)
  if (provisionalFor !== '2026-09-01') throw new Error('provisionalFor doit être 2026-09-01')
  if (!/^2026-09-02(?:T|$)/.test(cleanupAfter)) throw new Error('cleanupAfter doit commencer le 2026-09-02')
  if (!Array.isArray(raw.users) || raw.users.length === 0) throw new Error('users doit être un tableau non vide')

  const seenEmails = new Set()
  const seenClasses = new Set()
  const seenSlotIds = new Set()
  const users = raw.users.map((entry, index) => {
    const email = normalizeEmail(entry.email)
    const role = clean(entry.role)
    if (!validEmail(email)) throw new Error(`Adresse invalide à l’index ${index + 1}`)
    if (seenEmails.has(email)) throw new Error(`Adresse dupliquée à l’index ${index + 1}`)
    if (!ALLOWED_ROLES.has(role)) throw new Error(`Rôle invalide à l’index ${index + 1}`)
    seenEmails.add(email)

    const user = {
      index: index + 1,
      email,
      role,
      nom: clean(entry.nom),
      prenom: clean(entry.prenom),
    }
    if (!user.nom && !user.prenom) throw new Error(`Nom/prénom manquant à l’index ${index + 1}`)

    if (role === 'professeur') {
      user.matiere = clean(entry.matiere)
      user.cycle = clean(entry.cycle) || 'college'
      user.testClass = clean(entry.testClass)
      if (!['primaire', 'college'].includes(user.cycle)) throw new Error(`Cycle invalide à l’index ${index + 1}`)
      if (!user.testClass.startsWith(TEST_CLASS_PREFIX)) throw new Error(`Classe test invalide à l’index ${index + 1}`)
      if (seenClasses.has(user.testClass)) throw new Error(`Classe test dupliquée à l’index ${index + 1}`)
      seenClasses.add(user.testClass)
      user.weeklySlots = buildSchedule(user)
      for (const slot of user.weeklySlots) {
        const id = slotId(slot.classe, slot.day, slot.startTime)
        if (seenSlotIds.has(id)) throw new Error(`Collision de créneau dans le manifeste à l’index ${index + 1}`)
        seenSlotIds.add(id)
      }
    } else {
      if (entry.testClass || entry.weeklySlots) throw new Error(`Un admin ne doit pas recevoir d’EDT (index ${index + 1})`)
      user.weeklySlots = []
    }
    return user
  })

  return { projectId, provisioningTag, provisionalFor, cleanupAfter, users }
}

function assertPrivateFile(filePath, label) {
  const resolved = path.resolve(ROOT, filePath)
  const stat = fs.statSync(resolved)
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} doit être protégé par chmod 600`)
  return resolved
}

function validatePasswords(raw, manifest) {
  const source = raw && typeof raw === 'object' && raw.passwords ? raw.passwords : raw
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Le fichier de mots de passe doit être un objet JSON email → mot de passe')
  }
  const passwords = new Map()
  for (const user of manifest.users) {
    const password = clean(source[user.email])
    if (password.length < 12) throw new Error(`Mot de passe absent ou trop court à l’index ${user.index}`)
    passwords.set(user.email, password)
  }
  if (new Set(passwords.values()).size !== manifest.users.length) {
    throw new Error('Chaque compte doit avoir un mot de passe temporaire unique')
  }
  return passwords
}

function loadPasswords(filePath, manifest) {
  if (!filePath) throw new Error('--password-file est obligatoire avec --commit')
  const resolved = assertPrivateFile(filePath, 'Le fichier de mots de passe')
  return validatePasswords(JSON.parse(fs.readFileSync(resolved, 'utf8')), manifest)
}

function generatePasswords(manifest, outputPath) {
  const target = path.resolve(ROOT, outputPath)
  if (!target.startsWith(path.join(ROOT, '.secrets') + path.sep)) {
    throw new Error('Les identifiants doivent être écrits sous .secrets/')
  }
  if (fs.existsSync(target)) throw new Error('Le fichier d’identifiants existe déjà')
  const used = new Set()
  const passwords = {}
  for (const user of manifest.users) {
    let password
    do { password = randomPassword() } while (used.has(password))
    used.add(password)
    passwords[user.email] = password
  }
  fs.writeFileSync(target, `${JSON.stringify({ passwords }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  fs.chmodSync(target, 0o600)
  return { generated: manifest.users.length, fileProtected: true }
}

function snapshotPath(tag) {
  return path.join(ROOT, '.secrets', `${tag}.snapshot.json`)
}

function writeSnapshot(tag, body) {
  const target = snapshotPath(tag)
  fs.writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(target, 0o600)
  return target
}

function readSnapshot(tag) {
  const target = assertPrivateFile(path.relative(ROOT, snapshotPath(tag)), 'Le snapshot')
  return JSON.parse(fs.readFileSync(target, 'utf8'))
}

function publicSummary(manifest, mode, extra = {}) {
  const teachers = manifest.users.filter(user => user.role === 'professeur')
  return {
    mode,
    project: manifest.projectId,
    accounts: manifest.users.length,
    teachers: teachers.length,
    admins: manifest.users.length - teachers.length,
    schedules: teachers.length,
    slots: teachers.reduce((sum, user) => sum + user.weeklySlots.length, 0),
    realClassesReferenced: 0,
    ...extra,
  }
}

async function initAdmin() {
  if (!fs.existsSync(ADMIN_KEY)) throw new Error('Clé Firebase Admin introuvable')
  const admin = require('firebase-admin')
  const key = require(ADMIN_KEY)
  if (key.project_id !== 'mojammaa-sgs') throw new Error('La clé Admin ne cible pas mojammaa-sgs')
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id })
  return { admin, app, auth: admin.auth(app), db: admin.firestore(app) }
}

async function getAuthUser(auth, email) {
  try {
    return await auth.getUserByEmail(email)
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

async function preflight(manifest, auth, db) {
  const existing = []
  for (const user of manifest.users) {
    const [authUser, profilesByEmail] = await Promise.all([
      getAuthUser(auth, user.email),
      db.collection('users').where('email', '==', user.email).limit(1).get(),
    ])
    if (authUser || !profilesByEmail.empty) existing.push(user.index)
  }
  if (existing.length) throw new Error(`${existing.length} compte(s) ou profil(s) existent déjà : arrêt global sans modification`)

  for (const user of manifest.users.filter(item => item.role === 'professeur')) {
    const [profileCollision, classProjection] = await Promise.all([
      db.collection('users').where('classes', 'array-contains', user.testClass).limit(1).get(),
      db.collection('emploiDuTemps').where('classeId', '==', user.testClass).limit(1).get(),
    ])
    if (!profileCollision.empty || !classProjection.empty) {
      throw new Error(`Collision live pour la classe test index ${user.index}`)
    }
    for (const slot of user.weeklySlots) {
      const projected = await db.collection('emploiDuTemps').doc(slotId(slot.classe, slot.day, slot.startTime)).get()
      if (projected.exists) throw new Error(`Collision live pour un créneau test index ${user.index}`)
    }
  }
}

function profileBody(user, authUser, manifest, admin) {
  const base = {
    uid: authUser.uid,
    email: authUser.email,
    role: user.role,
    nom: user.nom,
    prenom: user.prenom,
    provisioningTag: manifest.provisioningTag,
    provisionalFor: manifest.provisionalFor,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (user.role === 'professeur') {
    return {
      ...base,
      classes: [user.testClass],
      matiere: user.matiere,
      cycle: user.cycle,
    }
  }
  return base
}

function scheduleBody(user, authUser, manifest, admin) {
  return {
    uid: authUser.uid,
    teacherUid: authUser.uid,
    weeklySlots: user.weeklySlots,
    provisioningTag: manifest.provisioningTag,
    provisionalFor: manifest.provisionalFor,
    cleanupAfter: manifest.cleanupAfter,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
}

async function rollbackCreatedAuth(auth, created) {
  for (const row of created) {
    try { await auth.deleteUser(row.uid) } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error
    }
  }
}

async function rollbackCreatedState(manifest, created, auth, db) {
  if (created.length) {
    const byIndex = new Map(created.map(row => [row.index, row]))
    const batch = db.batch()
    for (const user of manifest.users) {
      const row = byIndex.get(user.index)
      if (!row) continue
      batch.delete(db.collection('schedules').doc(row.uid))
      batch.delete(db.collection('users').doc(row.uid))
      for (const slot of user.weeklySlots) {
        batch.delete(db.collection('emploiDuTemps').doc(slotId(slot.classe, slot.day, slot.startTime)))
      }
    }
    await batch.commit()
  }
  await rollbackCreatedAuth(auth, created)
}

async function waitForProjections(manifest, created, db, timeoutMs = 45000) {
  const byIndex = new Map(created.map(row => [row.index, row]))
  const expected = manifest.users
    .filter(user => user.role === 'professeur')
    .flatMap(user => user.weeklySlots.map(slot => ({
      id: slotId(slot.classe, slot.day, slot.startTime),
      uid: byIndex.get(user.index).uid,
    })))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const reads = await Promise.all(expected.map(row => db.collection('emploiDuTemps').doc(row.id).get()))
    if (reads.every((snap, index) => snap.exists && snap.get('teacherUid') === expected[index].uid)) return expected.length
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Délai dépassé pendant la vérification des projections EDT')
}

async function verifyAdminState(manifest, created, auth, db) {
  const byIndex = new Map(created.map(row => [row.index, row]))
  for (const user of manifest.users) {
    const row = byIndex.get(user.index)
    const [authUser, profile] = await Promise.all([
      auth.getUser(row.uid),
      db.collection('users').doc(row.uid).get(),
    ])
    if (authUser.disabled || !profile.exists) throw new Error(`Invariant Auth/profil rompu à l’index ${user.index}`)
    if (profile.get('role') !== user.role || profile.get('provisioningTag') !== manifest.provisioningTag) {
      throw new Error(`Invariant profil rompu à l’index ${user.index}`)
    }
    if (user.role === 'professeur') {
      const schedule = await db.collection('schedules').doc(row.uid).get()
      if (!schedule.exists || schedule.get('provisioningTag') !== manifest.provisioningTag) {
        throw new Error(`Invariant EDT rompu à l’index ${user.index}`)
      }
      if (JSON.stringify(schedule.get('weeklySlots')) !== JSON.stringify(user.weeklySlots)) {
        throw new Error(`Créneaux EDT non conformes à l’index ${user.index}`)
      }
    }
  }
  return waitForProjections(manifest, created, db)
}

async function apply(manifest, options, services) {
  if (options.confirmProject !== manifest.projectId) throw new Error('--confirm-project incorrect ou absent')
  if (options.confirmCreate !== manifest.users.length) throw new Error('--confirm-create incorrect ou absent')
  const passwords = loadPasswords(options.passwordFile, manifest)
  await preflight(manifest, services.auth, services.db)

  const created = []
  let firestoreCommitted = false
  try {
    for (const user of manifest.users) {
      const authUser = await services.auth.createUser({
        email: user.email,
        password: passwords.get(user.email),
        displayName: [user.prenom, user.nom].filter(Boolean).join(' ') || undefined,
        emailVerified: false,
        disabled: false,
      })
      created.push({ index: user.index, uid: authUser.uid, role: user.role })
      writeSnapshot(manifest.provisioningTag, {
        status: 'MUTATING',
        projectId: manifest.projectId,
        provisioningTag: manifest.provisioningTag,
        accounts: created,
      })
    }

    const batch = services.db.batch()
    const byIndex = new Map(created.map(row => [row.index, row]))
    for (const user of manifest.users) {
      const row = byIndex.get(user.index)
      const authUser = await services.auth.getUser(row.uid)
      batch.create(
        services.db.collection('users').doc(row.uid),
        profileBody(user, authUser, manifest, services.admin),
      )
      if (user.role === 'professeur') {
        batch.create(
          services.db.collection('schedules').doc(row.uid),
          scheduleBody(user, authUser, manifest, services.admin),
        )
      }
    }
    await batch.commit()
    firestoreCommitted = true
    const projectedSlots = await verifyAdminState(manifest, created, services.auth, services.db)
    writeSnapshot(manifest.provisioningTag, {
      status: 'READY',
      projectId: manifest.projectId,
      provisioningTag: manifest.provisioningTag,
      accounts: created,
      verifiedAt: new Date().toISOString(),
    })
    return publicSummary(manifest, 'COMMIT', { created: created.length, projectedSlots, status: 'PASS' })
  } catch (error) {
    let rollbackError = null
    if (!firestoreCommitted) {
      try {
        await rollbackCreatedState(manifest, created, services.auth, services.db)
      } catch (failure) {
        rollbackError = failure
      }
    }
    writeSnapshot(manifest.provisioningTag, {
      status: firestoreCommitted
        ? 'COMMITTED_VERIFICATION_FAILED'
        : rollbackError ? 'FAILED_RECOVERY_REQUIRED' : 'FAILED_ROLLED_BACK',
      projectId: manifest.projectId,
      provisioningTag: manifest.provisioningTag,
      accounts: created,
      failedAt: new Date().toISOString(),
    })
    if (firestoreCommitted) {
      throw new Error(`${error.message}; écritures conservées pour vérification/cleanup ciblé`)
    } else if (rollbackError) {
      throw new Error(`${error.message}; rollback incomplet : ${rollbackError.message}`)
    }
    throw error
  }
}

async function cleanup(manifest, options, services) {
  if (options.confirmProject !== manifest.projectId) throw new Error('--confirm-project incorrect ou absent')
  const snapshot = readSnapshot(manifest.provisioningTag)
  if (!['READY', 'COMMITTED_VERIFICATION_FAILED', 'CLEANED'].includes(snapshot.status)) {
    throw new Error(`Snapshot non nettoyable : ${snapshot.status}`)
  }
  if (snapshot.projectId !== manifest.projectId || snapshot.accounts.length !== manifest.users.length) {
    throw new Error('Snapshot incompatible avec le manifeste')
  }
  if (snapshot.status === 'CLEANED') return publicSummary(manifest, 'CLEANUP', { status: 'ALREADY_CLEANED' })

  const byIndex = new Map(snapshot.accounts.map(row => [row.index, row]))
  const batch = services.db.batch()
  let writes = 0
  let schedulesRemoved = 0
  let projectionsRemoved = 0
  for (const user of manifest.users.filter(item => item.role === 'professeur')) {
    const row = byIndex.get(user.index)
    const projectionRefs = user.weeklySlots.map(slot => (
      services.db.collection('emploiDuTemps').doc(slotId(slot.classe, slot.day, slot.startTime))
    ))
    const [profile, schedule, ...projections] = await Promise.all([
      services.db.collection('users').doc(row.uid).get(),
      services.db.collection('schedules').doc(row.uid).get(),
      ...projectionRefs.map(ref => ref.get()),
    ])
    if (!profile.exists || profile.get('provisioningTag') !== manifest.provisioningTag) {
      throw new Error(`Profil non taggé à l’index ${user.index} : nettoyage annulé`)
    }
    if (schedule.exists && schedule.get('provisioningTag') !== manifest.provisioningTag) {
      throw new Error(`EDT non taggé à l’index ${user.index} : nettoyage annulé`)
    }
    if (schedule.exists && JSON.stringify(schedule.get('weeklySlots')) !== JSON.stringify(user.weeklySlots)) {
      throw new Error(`EDT modifié à l’index ${user.index} : nettoyage manuel requis`)
    }
    const currentClasses = Array.isArray(profile.get('classes')) ? profile.get('classes') : []
    const hasTestClass = currentClasses.includes(user.testClass)
    const existingProjections = projections.filter(projected => projected.exists)
    for (const projected of existingProjections) {
      if (projected.get('teacherUid') !== row.uid) throw new Error(`Projection étrangère à l’index ${user.index}`)
    }
    if (!hasTestClass) {
      if (schedule.exists || existingProjections.length) {
        throw new Error(`Nettoyage partiel détecté à l’index ${user.index} : intervention requise`)
      }
      continue
    }
    batch.update(profile.ref, {
      classes: services.admin.firestore.FieldValue.arrayRemove(user.testClass),
      pilotScheduleCleanedAt: services.admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: services.admin.firestore.FieldValue.serverTimestamp(),
    })
    writes += 1
    if (schedule.exists) {
      batch.delete(schedule.ref)
      writes += 1
      schedulesRemoved += 1
    }
    for (const projected of existingProjections) {
      batch.delete(projected.ref)
      writes += 1
      projectionsRemoved += 1
    }
  }
  if (writes) await batch.commit()
  writeSnapshot(manifest.provisioningTag, {
    ...snapshot,
    status: 'CLEANED',
    cleanedAt: new Date().toISOString(),
  })
  return publicSummary(manifest, 'CLEANUP', { status: 'PASS', schedulesRemoved, projectionsRemoved })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.manifest) throw new Error('--manifest est obligatoire')
  const manifestPath = assertPrivateFile(options.manifest, 'Le manifeste')
  const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))

  if (options.generatePasswords) {
    if (options.commit || options.cleanup || options.passwordFile) {
      throw new Error('--generate-passwords doit être exécuté seul avec --manifest')
    }
    console.log(JSON.stringify({
      mode: 'GENERATE_PASSWORDS',
      ...generatePasswords(manifest, options.generatePasswords),
      status: 'PASS',
    }, null, 2))
    return
  }

  if (!options.commit) {
    console.log(JSON.stringify(publicSummary(manifest, options.cleanup ? 'CLEANUP_DRY_RUN' : 'DRY_RUN', { status: 'PASS' }), null, 2))
    return
  }

  const services = await initAdmin()
  try {
    const result = options.cleanup
      ? await cleanup(manifest, options, services)
      : await apply(manifest, options, services)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await services.app.delete()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'FAIL', error: error.message }))
    process.exit(1)
  })
}

module.exports = {
  TEST_CLASS_PREFIX,
  buildSchedule,
  generatePasswords,
  loadPasswords,
  parseArgs,
  publicSummary,
  validateManifest,
  validatePasswords,
}
