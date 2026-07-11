/**
 * Configure le profil "admin" (direction) d'un utilisateur.
 *
 * Trouve l'utilisateur dans Firebase Auth via son email, puis écrit
 * son document `users/<uid>` avec :
 *   - role: 'admin'   (valeur exacte attendue par l'app — cf. rawToLogic)
 *   - nom / prenom : récupérés des arguments
 *
 * Si l'utilisateur n'existe pas, il est créé (mot de passe fourni ou aléatoire).
 *
 * Usage :
 *   node scripts/setupAdmin.js <email> [nom] [prenom] [--password=...]
 *
 * Exemple :
 *   node scripts/setupAdmin.js dir@mojammaa.com Dahmani "Nasr ed-din"
 */

const path = require('path')
const fs   = require('fs')
const { randomPassword } = require('./lib/password')

async function main() {
  const args = process.argv.slice(2)
  const passwordArg = args.find(a => a.startsWith('--password='))
  const positional  = args.filter(a => !a.startsWith('--'))
  const [email, nom, prenom] = positional
  const explicitPwd = passwordArg ? passwordArg.replace('--password=', '') : null

  if (!email) {
    console.error('Usage : node scripts/setupAdmin.js <email> [nom] [prenom] [--password=...]')
    process.exit(1)
  }

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

  console.log(`🔍 Recherche du user "${email}" dans Firebase Auth...`)
  let user
  let createdNow = false
  let usedPassword = null
  try {
    user = await auth.getUserByEmail(email)
    console.log('   (user existe déjà)')
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Défaut = mot de passe aléatoire fort (plus jamais `email + '1234'`,
      // devinable). Affiché une fois ; le compte reset au 1er accès.
      usedPassword = explicitPwd || randomPassword()
      console.log('   (user inexistant — création avec un nouveau mot de passe)')
      user = await auth.createUser({
        email,
        password: usedPassword,
        displayName: [prenom, nom].filter(Boolean).join(' ') || undefined,
        emailVerified: true,
      })
      createdNow = true
    } else {
      console.error('❌ Erreur Auth :', err.message)
      process.exit(1)
    }
  }

  console.log(`✅ User : ${user.uid} (${user.email})`)

  const ref  = db.collection('users').doc(user.uid)
  const existing = (await ref.get()).data() || {}
  const profile = {
    uid:    user.uid,
    email:  user.email,
    role:   'admin',
    nom:    nom    ?? existing.nom    ?? '',
    prenom: prenom ?? existing.prenom ?? '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  await ref.set(profile, { merge: true })
  console.log(`\n✅ Profil mis à jour dans users/${user.uid} (role='admin')`)

  if (createdNow) {
    console.log('\n🔑 IDENTIFIANTS DE CONNEXION (à noter — ne sera plus affiché)')
    console.log(`   Email    : ${email}`)
    console.log(`   Password : ${usedPassword}`)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
