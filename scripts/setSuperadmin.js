/**
 * Gère la liste des SUPER-ADMINS, stockée dans le document protégé
 *   config/superadmins  →  { uids: [...], emails: [...], updatedAt }
 *
 * Ce doc n'est modifiable QUE par ce script (admin SDK) : les règles Firestore
 * interdisent toute écriture depuis une app (allow write: if false). Impossible
 * donc pour un admin de s'auto-promouvoir superadmin.
 *
 * Les comptes superadmin gardent role:'admin' (pour que l'app continue de les
 * traiter comme admin) ; le super-pouvoir vient uniquement de leur présence ici.
 *
 * Usage :
 *   node scripts/setSuperadmin.js --list                 # affiche les superadmins actuels
 *   node scripts/setSuperadmin.js <email>                # promeut (ajoute)
 *   node scripts/setSuperadmin.js <email> --remove       # rétrograde (retire)
 */

const path = require('path')
const fs   = require('fs')

async function main() {
  const args   = process.argv.slice(2)
  const LIST   = args.includes('--list')
  const REMOVE = args.includes('--remove')
  const email  = args.find(a => !a.startsWith('--'))

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const auth = admin.auth()
  const db   = admin.firestore()
  const ref  = db.collection('config').doc('superadmins')

  if (LIST || (!email)) {
    const snap = await ref.get()
    const data = snap.exists ? snap.data() : { uids: [], emails: [] }
    console.log(`\n👑 Super-admins actuels (${(data.uids || []).length}) :`)
    ;(data.emails || []).forEach((e, i) => console.log(`   - ${e}  (${(data.uids || [])[i] || '?'})`))
    if (!email) {
      if (!LIST) console.log('\nUsage : node scripts/setSuperadmin.js <email> [--remove] | --list')
      process.exit(0)
    }
    if (LIST) process.exit(0)
  }

  // Résoudre email → uid
  let user
  try { user = await auth.getUserByEmail(email) }
  catch (e) { console.error(`❌ Aucun compte Auth pour "${email}" : ${e.code || e.message}`); process.exit(1) }

  // Charger l'état courant
  const snap = await ref.get()
  const data = snap.exists ? snap.data() : { uids: [], emails: [] }
  let uids   = Array.isArray(data.uids) ? [...data.uids] : []
  let emails = Array.isArray(data.emails) ? [...data.emails] : []

  if (REMOVE) {
    const idx = uids.indexOf(user.uid)
    if (idx === -1) { console.log(`ℹ️ ${email} n'est pas superadmin — rien à faire.`); process.exit(0) }
    uids.splice(idx, 1)
    emails = emails.filter(e => e !== user.email)
    console.log(`➖ Retrait de ${email} des superadmins.`)
  } else {
    if (uids.includes(user.uid)) { console.log(`ℹ️ ${email} est déjà superadmin.`); process.exit(0) }
    uids.push(user.uid)
    if (!emails.includes(user.email)) emails.push(user.email)
    console.log(`➕ Ajout de ${email} aux superadmins.`)
  }

  await ref.set({
    uids, emails,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`\n👑 Super-admins (${uids.length}) :`)
  emails.forEach((e, i) => console.log(`   - ${e}  (${uids[i] || '?'})`))
  console.log('\n✅ config/superadmins mis à jour.')
  process.exit(0)
}

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
