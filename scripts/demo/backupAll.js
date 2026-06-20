/**
 * SAUVEGARDE COMPLÈTE (lecture seule) avant tout nettoyage.
 *
 * Exporte chaque collection Firestore + la liste des comptes Auth dans
 *   backups/firestore-<timestamp>/<collection>.json
 *
 * Les hash de mots de passe ne sont PAS exportables via listUsers ; on
 * sauvegarde l'identité des comptes (uid, email, displayName) pour mémoire,
 * mais une restauration des mots de passe nécessiterait l'export Auth dédié.
 *
 *   node scripts/demo/backupAll.js
 */
const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')

const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
const db = admin.firestore()
const auth = admin.auth()

function tsFolder() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function main() {
  const outDir = path.join(__dirname, '..', '..', 'backups', `firestore-${tsFolder()}`)
  fs.mkdirSync(outDir, { recursive: true })

  const collections = await db.listCollections()
  let grandTotal = 0
  for (const col of collections) {
    const snap = await col.get()
    const docs = snap.docs.map(d => ({ __id: d.id, ...d.data() }))
    fs.writeFileSync(path.join(outDir, `${col.id}.json`), JSON.stringify(docs, null, 2))
    grandTotal += docs.length
    console.log(`   ✓ ${col.id.padEnd(18)} ${docs.length} doc(s)`)
  }

  // Comptes Auth (identité seulement)
  const users = []
  let pageToken
  do {
    const res = await auth.listUsers(1000, pageToken)
    res.users.forEach(u => users.push({
      uid: u.uid, email: u.email || null, displayName: u.displayName || null,
      disabled: u.disabled, creationTime: u.metadata.creationTime,
      lastSignInTime: u.metadata.lastSignInTime,
    }))
    pageToken = res.pageToken
  } while (pageToken)
  fs.writeFileSync(path.join(outDir, '_auth_users.json'), JSON.stringify(users, null, 2))
  console.log(`   ✓ ${'_auth_users'.padEnd(18)} ${users.length} compte(s)`)

  console.log(`\n✅ Sauvegarde : ${outDir}`)
  console.log(`   ${grandTotal} document(s) Firestore + ${users.length} compte(s) Auth.`)
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
