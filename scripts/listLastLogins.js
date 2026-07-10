/**
 * Affiche la dernière connexion (Firebase Auth metadata.lastSignInTime) de chaque
 * compte présent dans users/, pour voir qui s'est réellement connecté.
 *
 * Usage : node scripts/listLastLogins.js
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
    let lastSignIn = null
    let created = null
    try {
      const authUser = await auth.getUser(doc.id)
      lastSignIn = authUser.metadata.lastSignInTime
      created = authUser.metadata.creationTime
    } catch {
      // pas de compte Auth
    }
    rows.push({
      email: data.email || '(sans email)',
      role: data.role || '?',
      lastSignIn,
      created,
    })
  }

  rows.sort((a, b) => {
    const ta = a.lastSignIn ? new Date(a.lastSignIn).getTime() : 0
    const tb = b.lastSignIn ? new Date(b.lastSignIn).getTime() : 0
    return tb - ta
  })

  console.log(`Dernière connexion par compte :\n`)
  for (const r of rows) {
    const last = r.lastSignIn ? new Date(r.lastSignIn).toLocaleString('fr-FR') : 'jamais connecté'
    console.log(`[${r.role}]  ${r.email}  →  ${last}`)
  }
}

main().catch((e) => {
  console.error('❌ Erreur :', e.message)
  process.exit(1)
})
