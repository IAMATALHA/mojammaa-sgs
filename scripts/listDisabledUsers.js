/**
 * Liste les comptes Firebase Auth désactivés (= "supprimés" via l'app, cf. onUserWritten
 * qui fait disabled:true au lieu de deleteUser). Sert à retrouver un email oublié
 * avant suppression définitive.
 *
 * Usage : node scripts/listDisabledUsers.js
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
  const disabled = []
  let pageToken

  do {
    const result = await auth.listUsers(1000, pageToken)
    for (const u of result.users) {
      if (u.disabled) disabled.push(u)
    }
    pageToken = result.pageToken
  } while (pageToken)

  if (disabled.length === 0) {
    console.log('Aucun compte désactivé trouvé.')
    return
  }

  console.log(`${disabled.length} compte(s) désactivé(s) :\n`)
  for (const u of disabled) {
    console.log(`- ${u.email}  (uid: ${u.uid})`)
  }
}

main().catch((e) => {
  console.error('❌ Erreur :', e.message)
  process.exit(1)
})
