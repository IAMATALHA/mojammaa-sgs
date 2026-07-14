/**
 * Répare un pilote chauffeur explicitement synthétique dont le passager de
 * tournée n'a pas de fiche `eleves` correspondante. Le script est en dry-run
 * par défaut et refuse tout compte, passager ou élève qui ne soit pas de test.
 *
 * Usage :
 *   node scripts/provision-test-driver-child.js test-driver@mojammaa.test
 *   node scripts/provision-test-driver-child.js test-driver@mojammaa.test --commit
 */

const fs = require('fs')
const path = require('path')

const TEST_MARKERS = ['test', 'demo', 'synthetic', 'synthetique', 'pilot']

function isTestString(value) {
  if (typeof value !== 'string') return false
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return TEST_MARKERS.some(marker => normalized.includes(marker))
}

function hasExplicitTestMarker(id, data) {
  return data?.isTestData === true
    || data?.testData === true
    || data?.synthetic === true
    || isTestString(id)
    || isTestString(data?.eleveNom)
    || isTestString(data?.elevePrenom)
    || isTestString(data?.routeLabel)
}

async function main() {
  const args = process.argv.slice(2)
  const email = args.find(arg => !arg.startsWith('--'))
  const commit = args.includes('--commit')

  if (!email || !email.toLowerCase().endsWith('.test')) {
    throw new Error('Ce script accepte uniquement une adresse de test se terminant par .test.')
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) throw new Error('Clé Firebase Admin introuvable.')

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const auth = admin.auth()
  const db = admin.firestore()

  const account = await auth.getUserByEmail(email)
  const userRef = db.collection('users').doc(account.uid)
  const driverRef = db.collection('driverProfiles').doc(account.uid)
  const [userSnap, driverSnap] = await Promise.all([userRef.get(), driverRef.get()])
  const role = userSnap.get('role')
  if (!['chauffeur', 'driver'].includes(role)) throw new Error('Le compte n’est pas chauffeur-only.')
  if (!driverSnap.exists || driverSnap.get('active') !== true) {
    throw new Error('Le profil chauffeur de test n’est pas actif.')
  }

  const trips = await db.collection('transportTrips').where('driverUid', '==', account.uid).get()
  const candidates = []
  let alreadyLinked = 0
  for (const trip of trips.docs) {
    const tripData = trip.data()
    const passengers = await trip.ref.collection('passengers').get()
    for (const passenger of passengers.docs) {
      const passengerData = passenger.data()
      const eleveId = typeof passengerData.eleveId === 'string'
        ? passengerData.eleveId.trim()
        : passenger.id
      if (!eleveId || eleveId !== passenger.id) continue
      if (!hasExplicitTestMarker(trip.id, tripData) && !hasExplicitTestMarker(passenger.id, passengerData)) continue
      const eleveRef = db.collection('eleves').doc(eleveId)
      const eleveSnap = await eleveRef.get()
      if (!eleveSnap.exists) {
        candidates.push({ tripRef: trip.ref, passengerRef: passenger.ref, eleveRef, passengerData })
      } else if (eleveSnap.get('isTestData') === true && eleveSnap.get('parentUid') === account.uid) {
        alreadyLinked++
      }
    }
  }

  if (candidates.length === 0 && alreadyLinked === 1) {
    console.log('Compte chauffeur test valide : oui')
    console.log('Passager synthétique déjà lié : oui')
    console.log('Écriture nécessaire : non')
    return
  }

  if (candidates.length !== 1) {
    throw new Error(`Réparation refusée : ${candidates.length} passager(s) synthétique(s) sans fiche élève.`)
  }

  const candidate = candidates[0]
  const student = {
    codeMassar: candidate.eleveRef.id,
    nom: candidate.passengerData.eleveNom || 'Test',
    prenom: candidate.passengerData.elevePrenom || 'Enfant',
    nomLatin: candidate.passengerData.eleveNom || 'Test',
    prenomLatin: candidate.passengerData.elevePrenom || 'Enfant',
    classe: candidate.passengerData.classe || 'TEST-PICKUP',
    niveau: 'TEST',
    parentUid: account.uid,
    parentEmail: account.email,
    isTestData: true,
    testDataKind: 'smart-pickup-parent-workspace',
  }

  console.log('Compte chauffeur test valide : oui')
  console.log('Passager synthétique orphelin unique : oui')
  console.log('Élève réel réattribué : non')
  console.log(`Mode : ${commit ? 'COMMIT' : 'DRY-RUN'}`)
  if (!commit) return

  await db.runTransaction(async transaction => {
    const [freshUser, freshDriver, freshPassenger, freshStudent] = await Promise.all([
      transaction.get(userRef),
      transaction.get(driverRef),
      transaction.get(candidate.passengerRef),
      transaction.get(candidate.eleveRef),
    ])
    if (!freshUser.exists || !['chauffeur', 'driver'].includes(freshUser.get('role'))) {
      throw new Error('Le rôle chauffeur a changé ; transaction annulée.')
    }
    if (!freshDriver.exists || freshDriver.get('active') !== true) {
      throw new Error('Le profil chauffeur a changé ; transaction annulée.')
    }
    if (!freshPassenger.exists || freshPassenger.get('eleveId') !== candidate.eleveRef.id) {
      throw new Error('Le passager test a changé ; transaction annulée.')
    }
    if (freshStudent.exists) throw new Error('La fiche élève existe désormais ; transaction annulée.')

    const now = admin.firestore.FieldValue.serverTimestamp()
    transaction.create(candidate.eleveRef, { ...student, createdAt: now, updatedAt: now })
    transaction.set(userRef, {
      children: admin.firestore.FieldValue.arrayUnion(candidate.eleveRef.id),
      updatedAt: now,
    }, { merge: true })
  })

  console.log('Fiche élève synthétique créée : 1')
  console.log('Lien parent test créé : 1')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`Erreur : ${error.message || error}`)
    process.exit(1)
  })
