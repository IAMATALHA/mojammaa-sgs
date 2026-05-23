/**
 * Configure le profil "professeur" d'un user existant.
 *
 * Trouve l'utilisateur dans Firebase Auth via son email, puis écrit
 * son document `users/<uid>` avec :
 *   - role: 'professeur'
 *   - classes: tableau des classes assignées
 *   - nom / prenom : récupérés des arguments
 *
 * Si l'utilisateur n'existe pas encore dans Firebase Auth, le script
 * le crée avec un mot de passe fourni (ou généré aléatoirement et imprimé).
 *
 * Usage :
 *   node scripts/setupTeacher.js <email> [nom] [prenom] [classes,virgule] [--password=...]
 *
 * Exemple :
 *   node scripts/setupTeacher.js youssef@mojammaa.com Atalha Youssef 1APIC-3,1APIC-4,2APIC-4
 *   node scripts/setupTeacher.js youssef@mojammaa.com Atalha Youssef "" --password=Maths2026!
 */

const path  = require('path')
const fs    = require('fs')

function randomPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd + '!'
}

async function main() {
  const args = process.argv.slice(2)
  const passwordArg = args.find(a => a.startsWith('--password='))
  const positional  = args.filter(a => !a.startsWith('--'))
  const [email, nom, prenom, classesArg] = positional
  const explicitPwd = passwordArg ? passwordArg.replace('--password=', '') : null

  if (!email) {
    console.error('Usage : node scripts/setupTeacher.js <email> [nom] [prenom] [classes,séparées,virgule] [--password=...]')
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

  // Default classes if not provided
  const classes = classesArg
    ? classesArg.split(',').map(s => s.trim()).filter(Boolean)
    : ['1APIC-3', '1APIC-4', '2APIC-4']

  console.log(`🔍 Recherche du user "${email}" dans Firebase Auth...`)
  let user
  let createdNow = false
  let usedPassword = null
  try {
    user = await auth.getUserByEmail(email)
    console.log('   (user existe déjà)')
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      usedPassword = explicitPwd || randomPassword()
      console.log(`   (user inexistant — création avec un nouveau mot de passe)`)
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

  console.log(`✅ User trouvé : ${user.uid}`)
  console.log(`   Email      : ${user.email}`)
  console.log(`   Créé le    : ${new Date(user.metadata.creationTime).toLocaleString('fr-FR')}`)

  // Read existing profile to merge
  const ref  = db.collection('users').doc(user.uid)
  const snap = await ref.get()
  const existing = snap.exists ? snap.data() : {}

  const profile = {
    uid:     user.uid,
    email:   user.email,
    role:    'professeur',
    classes,
    nom:     nom    ?? existing.nom    ?? '',
    prenom:  prenom ?? existing.prenom ?? '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  console.log('\n📝 Écriture du profil :')
  console.log(JSON.stringify({ ...profile, updatedAt: '<serverTs>' }, null, 2))

  await ref.set(profile, { merge: true })
  console.log(`\n✅ Profil mis à jour dans users/${user.uid}`)
  console.log(`   Role    : professeur`)
  console.log(`   Classes : ${classes.join(', ')}`)

  if (createdNow) {
    console.log('\n🔑 IDENTIFIANTS DE CONNEXION (à noter — ne sera plus affiché)')
    console.log(`   Email    : ${email}`)
    console.log(`   Password : ${usedPassword}`)
    console.log('   → Ouvre l\'app, écran de connexion, et utilise ces identifiants.')
  }
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
