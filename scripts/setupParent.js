/**
 * Configure le profil "parent" d'un user + lie ses enfants via codeMassar.
 *
 *   - Crée le compte Firebase Auth si email inconnu (avec mdp aléatoire imprimé)
 *   - Écrit users/<uid> avec role='parent'
 *   - Met `parentUid`, `parentEmail`, `parentNom` sur chaque doc eleves/<codeMassar>
 *     (parentUid sert à l'app mobile ; parentEmail/parentNom à l'app web admin)
 *
 * Usage :
 *   node scripts/setupParent.js <email> "<nom>" "<prenom>" <codeMassar1,codeMassar2,...>
 *
 * Exemple (parent d'Omar Hassan en 1APIC-3 — codeMassar A171010188) :
 *   node scripts/setupParent.js hassan.father@example.com Hassan Omar A171010188
 *
 * Exemple (parent de 2 enfants) :
 *   node scripts/setupParent.js multi@example.com Bennani Karim A171010188,A172079483
 */

const path = require('path')
const fs   = require('fs')

function randomPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd + '!'
}

async function main() {
  const [, , email, nom, prenom, codeMassarArg] = process.argv

  if (!email || !codeMassarArg) {
    console.error('Usage : node scripts/setupParent.js <email> "<nom>" "<prenom>" <codeMassar1,codeMassar2,...>')
    process.exit(1)
  }

  const childMassarCodes = codeMassarArg.split(',').map(s => s.trim()).filter(Boolean)
  if (childMassarCodes.length === 0) {
    console.error('❌ Aucun code MASSAR fourni.')
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

  // ── 1. Vérifier que tous les enfants existent ──────────────
  console.log(`🔍 Vérification des ${childMassarCodes.length} enfant(s)...`)
  const children = []
  for (const code of childMassarCodes) {
    const snap = await db.collection('eleves').doc(code).get()
    if (!snap.exists) {
      console.error(`❌ Élève introuvable : ${code}`)
      process.exit(1)
    }
    const data = snap.data()
    children.push({ code, ...data })
    console.log(`   ✓ ${code} → ${data.nomComplet || (data.nom + ' ' + data.prenom)} (${data.classe})`)
  }

  // ── 2. Trouver ou créer le user Auth ──────────────────────
  console.log(`\n🔍 Recherche du user "${email}"...`)
  let user
  let createdNow  = false
  let usedPwd     = null
  try {
    user = await auth.getUserByEmail(email)
    console.log(`   (existe déjà : ${user.uid})`)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      usedPwd = randomPassword()
      user = await auth.createUser({
        email,
        password: usedPwd,
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

  // ── 3. Écrire users/<uid> ─────────────────────────────────
  const ref = db.collection('users').doc(user.uid)
  const existing = (await ref.get()).data() || {}
  const profile = {
    uid:     user.uid,
    email:   user.email,
    role:    'parent',
    nom:     nom    || existing.nom    || '',
    prenom:  prenom || existing.prenom || '',
    children: childMassarCodes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  await ref.set(profile, { merge: true })
  console.log(`\n✅ users/${user.uid} mis à jour (role='parent')`)

  // ── 4. Mettre parentUid + parentEmail + parentNom sur chaque enfant ──
  console.log(`\n🔗 Liaison ${childMassarCodes.length} enfant(s) → parent ${user.uid}`)
  const parentNom = [prenom, nom].filter(Boolean).join(' ')
  const batch = db.batch()
  childMassarCodes.forEach(code => {
    const eleveUpdate = {
      parentUid:   user.uid,
      parentEmail: user.email || email,
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }
    if (parentNom) eleveUpdate.parentNom = parentNom
    batch.set(db.collection('eleves').doc(code), eleveUpdate, { merge: true })
  })
  await batch.commit()
  console.log(`   ✓ ${childMassarCodes.length} doc(s) eleves mis à jour`)

  // ── 5. Imprimer identifiants si compte créé ──────────────
  if (createdNow) {
    console.log('\n🔑 IDENTIFIANTS DE CONNEXION (à noter)')
    console.log(`   Email    : ${email}`)
    console.log(`   Password : ${usedPwd}`)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
