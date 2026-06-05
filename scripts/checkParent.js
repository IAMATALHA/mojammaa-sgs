/**
 * Diagnostic LECTURE SEULE d'un compte parent (n'écrit rien).
 * Vérifie pourquoi un parent ne reçoit pas les messages des profs.
 *
 *   node scripts/checkParent.js <email>
 */
const path = require('path')
const fs   = require('fs')

async function main() {
  const [, , email] = process.argv
  if (!email) {
    console.error('Usage : node scripts/checkParent.js <email>')
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

  // 1. Compte Auth
  let user
  try {
    user = await auth.getUserByEmail(email)
  } catch (err) {
    console.error(`❌ Aucun compte Auth pour ${email} (${err.code})`)
    process.exit(1)
  }
  const uid = user.uid
  console.log(`\n👤 Auth : ${email}`)
  console.log(`   uid = ${uid}`)

  // 2. Doc users/<uid>
  const userSnap = await db.collection('users').doc(uid).get()
  if (!userSnap.exists) {
    console.log(`\n⚠️  users/${uid} N'EXISTE PAS → l'app ne connaît pas son rôle.`)
  } else {
    const u = userSnap.data()
    console.log(`\n📄 users/${uid}`)
    console.log(`   role     : ${u.role}${u.role === 'parent' ? ' ✓' : '  ⚠️ attendu "parent"'}`)
    console.log(`   nom      : ${u.prenom || ''} ${u.nom || ''}`)
    console.log(`   children : ${JSON.stringify(u.children || [])}`)
  }

  // 3. Élèves réellement liés (c'est CE qui détermine la réception prof)
  const linked = await db.collection('eleves').where('parentUid', '==', uid).get()
  console.log(`\n🔗 eleves où parentUid == ${uid} : ${linked.size}`)
  if (linked.size === 0) {
    console.log(`   ❌ AUCUN élève lié → les profs ne peuvent pas le cibler.`)
    console.log(`      (probable compte créé via quickParent.js)`)
  } else {
    linked.forEach(d => {
      const e = d.data()
      console.log(`   ✓ ${d.id} → ${e.nomComplet || (e.prenom + ' ' + e.nom)} (${e.classe})`)
    })
  }

  // 4. Messages qui le ciblent nominativement (toIds array-contains uid)
  const targeted = await db.collection('messages').where('toIds', 'array-contains', uid).get()
  console.log(`\n✉️  messages où toIds contient son uid : ${targeted.size}`)
  targeted.forEach(d => {
    const m = d.data()
    console.log(`   • [${m.fromRole}] "${m.subject}" de ${m.fromNom || m.fromId}`)
  })

  // 5. Broadcasts larges qu'il devrait voir (all / parents)
  const all = await db.collection('messages').where('toType', '==', 'all').get()
  const par = await db.collection('messages').where('toType', '==', 'parents').get()
  console.log(`\n📢 broadcasts visibles sans lien : toType:'all'=${all.size}, toType:'parents'=${par.size}`)

  console.log('\n— Conclusion —')
  if (linked.size === 0 && targeted.size === 0) {
    console.log('Compte parent NON lié à un élève. Corriger avec :')
    console.log(`  node scripts/setupParent.js ${email} "<nom>" "<prenom>" <codeMassar>`)
  } else {
    console.log('Le lien existe ; si le souci persiste, regarder le rôle / les règles.')
  }
  process.exit(0)
}

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
