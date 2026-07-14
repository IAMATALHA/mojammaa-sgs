/**
 * Active l'espace chauffeur Smart Pickup pour un compte existant.
 *
 * Le rôle chauffeur est ADDITIF : un parent garde users/{uid}.role='parent'
 * et reçoit un driverProfiles/{uid}. Un compte créé avec --driver-only reçoit
 * le rôle principal 'chauffeur'. Le client ne peut jamais s'auto-attribuer cet
 * accès ; ce script passe par Firebase Admin.
 *
 * Usage :
 *   node scripts/setup-driver.js <email> [nom] [prenom] [routeIds,virgule]
 *     [--vehicle=VAN-01] [--driver-only] [--password=...]
 *
 * Exemples :
 *   node scripts/setup-driver.js parent@example.com El Amrani Karim R-MARTIL --vehicle=VAN-01
 *   node scripts/setup-driver.js chauffeur@example.com Benali Samir R-CENTRE --driver-only
 */

const path = require('path')
const fs = require('fs')
const { randomPassword } = require('./lib/password')

async function main() {
  const args = process.argv.slice(2)
  const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const positional = args.filter(arg => !arg.startsWith('--'))
  const [email, nom = '', prenom = '', routeIdsArg = ''] = positional
  const driverOnly = args.includes('--driver-only')
  const explicitPassword = option('password')
  const vehicleId = option('vehicle')?.trim() || ''
  const routeIds = routeIdsArg.split(',').map(value => value.trim()).filter(Boolean)

  if (!email) {
    console.error('Usage : node scripts/setup-driver.js <email> [nom] [prenom] [routeIds,virgule] [--vehicle=...] [--driver-only] [--password=...]')
    process.exit(1)
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

  const auth = admin.auth()
  const db = admin.firestore()
  let user
  let createdNow = false
  let generatedPassword = null

  try {
    user = await auth.getUserByEmail(email)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
    if (!driverOnly) {
      console.error('Compte introuvable. Créez d’abord le parent, ou utilisez --driver-only pour un chauffeur sans espace parent.')
      process.exit(1)
    }
    generatedPassword = explicitPassword || randomPassword()
    user = await auth.createUser({
      email,
      password: generatedPassword,
      displayName: [prenom, nom].filter(Boolean).join(' ') || undefined,
      emailVerified: true,
    })
    createdNow = true
  }

  const userRef = db.collection('users').doc(user.uid)
  const userSnap = await userRef.get()
  const existingUser = userSnap.exists ? userSnap.data() : {}
  const currentRole = existingUser.role

  if (driverOnly && currentRole && !['chauffeur', 'driver'].includes(currentRole)) {
    console.error(`Le compte possède déjà le rôle principal '${currentRole}'. Relancez sans --driver-only pour conserver cet espace.`)
    process.exit(1)
  }

  const primaryRole = currentRole || 'chauffeur'
  await userRef.set({
    uid: user.uid,
    email: user.email || email,
    role: primaryRole,
    nom: nom || existingUser.nom || '',
    prenom: prenom || existingUser.prenom || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  const driverRef = db.collection('driverProfiles').doc(user.uid)
  const driverSnap = await driverRef.get()
  const existingDriver = driverSnap.exists ? driverSnap.data() : {}
  await driverRef.set({
    uid: user.uid,
    active: true,
    routeIds: routeIds.length > 0 ? routeIds : (existingDriver.routeIds || []),
    vehicleId: vehicleId || existingDriver.vehicleId || '',
    createdAt: existingDriver.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`Accès chauffeur activé pour ${email}`)
  console.log(`UID : ${user.uid}`)
  console.log(`Rôle principal conservé : ${primaryRole}`)
  console.log(`Circuits : ${(routeIds.length > 0 ? routeIds : existingDriver.routeIds || []).join(', ') || '(à assigner)'}`)
  console.log(`Véhicule : ${vehicleId || existingDriver.vehicleId || '(à assigner)'}`)

  if (createdNow) {
    console.log('\nIdentifiants temporaires (affichés une seule fois)')
    console.log(`Email : ${email}`)
    console.log(`Password : ${generatedPassword}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur :', error.message || error)
    process.exit(1)
  })
