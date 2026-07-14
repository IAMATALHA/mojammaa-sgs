/**
 * Configure le profil "parent" d'un user + lie ses enfants via codeMassar.
 *
 *   - Crée le compte Firebase Auth si email inconnu (avec mdp aléatoire imprimé)
 *   - Préserve le rôle principal existant (professeur/chauffeur/admin) et
 *     ajoute la capacité parent via les liens eleves.parentUid
 *   - Met `parentUid`, `parentEmail`, `parentNom` sur chaque doc eleves/<codeMassar>
 *     (parentUid sert à l'app mobile ; parentEmail/parentNom à l'app web admin)
 *
 * Usage :
 *   node scripts/setupParent.js <email> "<nom>" "<prenom>" <codeMassar1,codeMassar2,...> [--reassign]
 *
 * Exemple (parent d'Omar Hassan en 1APIC-3 — codeMassar A171010188) :
 *   node scripts/setupParent.js hassan.father@example.com Hassan Omar A171010188
 *
 * Exemple (parent de 2 enfants) :
 *   node scripts/setupParent.js multi@example.com Bennani Karim A171010188,A172079483
 */

const path = require('path')
const fs   = require('fs')
const { randomPassword } = require('./lib/password')

async function main() {
  const args = process.argv.slice(2)
  const reassign = args.includes('--reassign')
  const [email, nom, prenom, codeMassarArg] = args.filter(arg => !arg.startsWith('--'))

  if (!email || !codeMassarArg) {
    console.error('Usage : node scripts/setupParent.js <email> "<nom>" "<prenom>" <codeMassar1,codeMassar2,...> [--reassign]')
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
      // Défaut = mot de passe aléatoire fort (plus jamais `email + '1234'`).
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
  const conflicting = children.filter(child => (
    typeof child.parentUid === 'string'
    && child.parentUid.length > 0
    && child.parentUid !== user.uid
  ))
  if (conflicting.length > 0 && !reassign) {
    if (createdNow) await auth.deleteUser(user.uid)
    console.error(
      `❌ ${conflicting.length} élève(s) sont déjà liés à un autre compte. `
      + 'Aucune réaffectation effectuée ; utilisez --reassign après vérification administrative.',
    )
    process.exit(1)
  }
  const preservedRole = typeof existing.role === 'string' && existing.role
    ? existing.role
    : 'parent'
  const linkedChildren = [...new Set([
    ...(Array.isArray(existing.children) ? existing.children : []),
    ...childMassarCodes,
  ])]
  const profile = {
    uid:     user.uid,
    email:   user.email,
    role:    preservedRole,
    nom:     nom    || existing.nom    || '',
    prenom:  prenom || existing.prenom || '',
    children: linkedChildren,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  await ref.set(profile, { merge: true })
  console.log(`\n✅ Profil mis à jour (rôle principal préservé : ${preservedRole})`)

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
