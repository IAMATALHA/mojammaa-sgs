/**
 * Quick parent account (test) — no children linked.
 *   node scripts/quickParent.js <email> <password> [nom] [prenom]
 */
const path = require('path')
const fs   = require('fs')

async function main() {
  const [, , email, password, nom = '', prenom = ''] = process.argv
  if (!email || !password) {
    console.error('Usage : node scripts/quickParent.js <email> <password> [nom] [prenom]')
    process.exit(1)
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const auth = admin.auth()
  const db   = admin.firestore()

  let user, createdNow = false
  try {
    user = await auth.getUserByEmail(email)
    console.log(`   (existe déjà : ${user.uid}) — mise à jour du mot de passe`)
    await auth.updateUser(user.uid, { password })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      user = await auth.createUser({
        email,
        password,
        displayName: [prenom, nom].filter(Boolean).join(' ') || undefined,
        emailVerified: true,
      })
      createdNow = true
      console.log(`   ✓ Compte créé : ${user.uid}`)
    } else {
      console.error('❌ Erreur Auth :', err.message)
      process.exit(1)
    }
  }

  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email,
    role: 'parent',
    nom,
    prenom,
    children: [],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`\n✅ users/${user.uid} (role='parent')`)
  console.log('\n🔑 IDENTIFIANTS')
  console.log(`   Email    : ${email}`)
  console.log(`   Password : ${password}`)
  console.log(createdNow ? '   (compte créé)' : '   (compte existant, mdp réinitialisé)')
  process.exit(0)
}

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
