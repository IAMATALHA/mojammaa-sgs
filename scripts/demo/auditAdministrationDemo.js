/**
 * Read-only, anonymized production inventory for the administration demo reset.
 * Never prints student names, Massar IDs, full emails, message bodies, or UIDs.
 */
const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')

const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
if (!fs.existsSync(keyPath)) { console.error('Firebase Admin key missing'); process.exit(1) }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
const db = admin.firestore()
const auth = admin.auth()

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function aliasesFor(user, authUser) {
  const haystack = normalize([
    user.nom, user.prenom, user.email,
    authUser?.email, authUser?.displayName,
  ].filter(Boolean).join(' '))
  const aliases = []
  const raw = [user.nom, user.prenom, user.email, authUser?.email, authUser?.displayName].filter(Boolean).join(' ')
  if ((/\bhabiba\b/.test(haystack) && /\bidrissi\b/.test(haystack)) || (/حبيبة/.test(raw) && /الإ?دريسي/.test(raw))) aliases.push('HABIBA IDRISSI')
  if (/\bzakaria\b/.test(haystack) || /زكرياء|زكريا/.test(raw)) aliases.push('ZAKARIA')
  if (/\btest\b/.test(haystack) || /\bdemo\b/.test(haystack) || /\breviewer\b/.test(haystack)) {
    const role = user.role || 'unknown'
    aliases.push(`TEST/${role}`)
  }
  return aliases
}

function maskedEmail(value) {
  const email = String(value || '')
  const at = email.indexOf('@')
  if (at <= 0) return email ? '[non-email]' : null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local.slice(0, Math.min(4, local.length))}…@${domain}`
}

async function listAuthUsers() {
  const users = []
  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  return users
}

async function main() {
  const collections = await db.listCollections()
  const snapshots = await Promise.all(collections.map(async collection => ({
    id: collection.id,
    snap: await collection.get(),
  })))
  const collectionCounts = Object.fromEntries(snapshots.map(({ id, snap }) => [id, snap.size]))
  const collectionFields = Object.fromEntries(snapshots.map(({ id, snap }) => [
    id,
    [...new Set(snap.docs.flatMap(doc => Object.keys(doc.data())))].sort(),
  ]))

  const classCounts = new Map()
  for (const { id, snap } of snapshots) {
    for (const doc of snap.docs) {
      const data = doc.data()
      const values = []
      if (typeof data.classe === 'string') values.push(data.classe)
      if (typeof data.classeId === 'string') values.push(data.classeId)
      if (Array.isArray(data.classes)) values.push(...data.classes.filter(value => typeof value === 'string'))
      for (const classe of new Set(values.map(value => value.trim()).filter(Boolean))) {
        if (!classCounts.has(classe)) classCounts.set(classe, {})
        const counts = classCounts.get(classe)
        counts[id] = (counts[id] || 0) + 1
      }
    }
  }

  const usersSnap = snapshots.find(item => item.id === 'users')?.snap
  const elevesSnap = snapshots.find(item => item.id === 'eleves')?.snap
  const authUsers = await listAuthUsers()
  const authByUid = new Map(authUsers.map(user => [user.uid, user]))
  const accountMatches = []
  const roleCounts = {}
  for (const doc of usersSnap?.docs || []) {
    const data = doc.data()
    roleCounts[data.role || 'unknown'] = (roleCounts[data.role || 'unknown'] || 0) + 1
    const authUser = authByUid.get(doc.id)
    for (const alias of aliasesFor(data, authUser)) {
      accountMatches.push({
        uid: doc.id,
        alias,
        role: data.role || null,
        authExists: Boolean(authUser),
        disabled: authUser?.disabled ?? null,
        email: maskedEmail(data.email || authUser?.email),
        classes: Array.isArray(data.classes) ? data.classes : (data.classe ? [data.classe] : []),
      })
    }
  }

  const parentsLinked = new Map()
  let activeStudents = 0
  for (const doc of elevesSnap?.docs || []) {
    const data = doc.data()
    if (data.active !== false) activeStudents += 1
    if (typeof data.parentUid === 'string' && data.parentUid) {
      parentsLinked.set(data.parentUid, (parentsLinked.get(data.parentUid) || 0) + 1)
    }
  }
  const safeAccountMatches = accountMatches.map(({ uid, ...match }) => ({
    ...match,
    linkedChildren: parentsLinked.get(uid) || 0,
  }))

  console.log(JSON.stringify({
    projectId: admin.app().options.projectId,
    collectionCounts,
    collectionFields,
    classCounts: Object.fromEntries([...classCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    users: { firestore: usersSnap?.size || 0, auth: authUsers.length, roles: roleCounts },
    students: { total: elevesSnap?.size || 0, active: activeStudents, linkedToParent: [...parentsLinked.values()].reduce((a, b) => a + b, 0) },
    accountMatches: safeAccountMatches,
  }, null, 2))
}

main().catch(error => { console.error(error.message || error); process.exit(1) })
