/**
 * Script de secours : réinitialise le mot de passe d'un utilisateur avec un
 * mot de passe ALÉATOIRE fort (imprimé une seule fois) et s'assure qu'il a le
 * rôle "admin".
 *
 * ⚠️ Plus de mot de passe codé en dur (`Password123!` supprimé — batch
 * sécurité 4, 2026-07-11) : un défaut prévisible dans un script versionné est
 * un secret qui fuit. Le mot de passe généré n'est affiché qu'ici, jamais
 * stocké. Alternative sans mot de passe partagé : scripts/sendPasswordReset.js
 * (envoie un lien de réinitialisation à usage unique).
 *
 * Usage :
 *   node scripts/resetAdmin.js <email>
 */
const path  = require('path')
const fs    = require('fs')
const admin = require('firebase-admin')
const { randomPassword } = require('./lib/password')

async function main() {
  const adminEmail = process.argv[2]
  if (!adminEmail) {
    console.error('Usage : node scripts/resetAdmin.js <email>')
    process.exit(1)
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })

  const auth = admin.auth()
  const db   = admin.firestore()
  const newPassword = randomPassword()

  try {
    const userRecord = await auth.getUserByEmail(adminEmail)
    console.log(`Utilisateur trouvé : ${userRecord.uid}`)

    await auth.updateUser(userRecord.uid, { password: newPassword })
    await db.collection('users').doc(userRecord.uid).set(
      { role: 'admin', email: adminEmail },
      { merge: true },
    )
    console.log(`✅ Rôle 'admin' sécurisé et mot de passe réinitialisé pour ${adminEmail}`)
    console.log('\n🔑 NOUVEAU MOT DE PASSE (à noter — ne sera plus affiché)')
    console.log(`   ${newPassword}`)
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation :', error.message || error)
    process.exit(1)
  }
}

main()
