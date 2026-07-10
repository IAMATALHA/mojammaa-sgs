/**
 * Liste les comptes actifs (Firestore users/{uid}, non désactivés dans Auth)
 * avec leur rôle, pour retrouver rapidement des logins de test.
 *
 * Usage : node scripts/listActiveUsers.js
 */

const path = require('path')
const fs   = require('fs')

async function main() {
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

  const auth = admin.auth()
  const db   = admin.firestore()

  const snap = await db.collection('users').get()
  const rows = []

  for (const doc of snap.docs) {
    const data = doc.data()
    let disabled = false
    try {
      const authUser = await auth.getUser(doc.id)
      disabled = authUser.disabled
    } catch {
      disabled = true // pas de compte Auth = injoignable
    }
    rows.push({
      email: data.email || '(sans email)',
      role: data.role || '?',
      nom: [data.prenom, data.nom].filter(Boolean).join(' '),
      disabled,
    })
  }

  rows.sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))

  console.log(`${rows.length} compte(s) dans users/ :\n`)
  for (const r of rows) {
    const status = r.disabled ? '❌ désactivé' : '✅ actif'
    console.log(`${status}  [${r.role}]  ${r.email}  ${r.nom ? '(' + r.nom + ')' : ''}`)
  }
}

main().catch((e) => {
  console.error('❌ Erreur :', e.message)
  process.exit(1)
})
