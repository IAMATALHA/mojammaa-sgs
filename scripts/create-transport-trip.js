/**
 * Crée une tournée Smart Pickup et sa liste minimale de passagers.
 *
 * Usage :
 *   node scripts/create-transport-trip.js <driverEmail> <YYYY-MM-DD> <routeId> <eleve1,eleve2,...>
 *     [--direction=from_school] [--time=16:30]
 *     --stops-file=./tournee.json
 *     [--route-label="Martil"] [--vehicle-label="Navette 1"] [--trip-id=...]
 *
 * Format tournee.json :
 *   { "stops": [
 *     { "id":"centre", "label":"Centre-ville", "sequence":1,
 *       "plannedTime":"16:45", "eleveIds":["E1","E2"] }
 *   ] }
 *
 * Aucune note, absence, adresse, téléphone ou UID parent n'est copié dans la
 * tournée. Les règles résolvent la parenté depuis eleves/{codeMassar}.
 */

const path = require('path')
const fs = require('fs')

function cleanId(value) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

async function main() {
  const args = process.argv.slice(2)
  const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const positional = args.filter(arg => !arg.startsWith('--'))
  const [driverEmail, serviceDate, routeId, elevesArg] = positional
  const direction = option('direction') || 'from_school'
  const scheduledTime = option('time') || '16:30'
  const routeLabel = option('route-label') || routeId
  const requestedVehicleLabel = option('vehicle-label') || ''
  const stopsFileArg = option('stops-file')

  if (!driverEmail || !serviceDate || !routeId || !elevesArg || !stopsFileArg) {
    console.error('Usage : node scripts/create-transport-trip.js <driverEmail> <YYYY-MM-DD> <routeId> <eleve1,eleve2,...> --stops-file=./tournee.json [options]')
    process.exit(1)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    console.error('La date doit suivre YYYY-MM-DD.')
    process.exit(1)
  }
  if (!['to_school', 'from_school'].includes(direction)) {
    console.error("--direction doit valoir 'to_school' ou 'from_school'.")
    process.exit(1)
  }
  if (!/^\d{2}:\d{2}$/.test(scheduledTime)) {
    console.error("--time doit suivre HH:mm (ex. 16:30).")
    process.exit(1)
  }

  const eleveIds = [...new Set(elevesArg.split(',').map(value => value.trim()).filter(Boolean))]
  if (eleveIds.length === 0 || eleveIds.length > 450) {
    console.error('La tournée doit contenir entre 1 et 450 élèves.')
    process.exit(1)
  }

  const stopsPath = path.resolve(process.cwd(), stopsFileArg)
  if (!fs.existsSync(stopsPath)) {
    console.error(`Fichier d'arrêts introuvable : ${stopsPath}`)
    process.exit(1)
  }

  let stopsInput
  try {
    const parsed = JSON.parse(fs.readFileSync(stopsPath, 'utf8'))
    stopsInput = Array.isArray(parsed) ? parsed : parsed.stops
  } catch (error) {
    console.error(`Fichier d'arrêts JSON invalide : ${error.message}`)
    process.exit(1)
  }
  if (!Array.isArray(stopsInput) || stopsInput.length === 0 || stopsInput.length > 100) {
    console.error('Le fichier doit contenir entre 1 et 100 arrêts.')
    process.exit(1)
  }

  const stopIds = new Set()
  const assignedStudents = new Map()
  const stops = []
  for (const raw of stopsInput) {
    const id = typeof raw?.id === 'string' ? cleanId(raw.id) : ''
    const label = typeof raw?.label === 'string' ? raw.label.trim() : ''
    const sequence = Number(raw?.sequence)
    const plannedTime = typeof raw?.plannedTime === 'string' ? raw.plannedTime.trim() : ''
    const assigned = Array.isArray(raw?.eleveIds)
      ? raw.eleveIds.map(value => String(value).trim()).filter(Boolean)
      : []
    if (!id || stopIds.has(id) || !label || label.length > 120
        || !Number.isInteger(sequence) || sequence < 1
        || (plannedTime && !/^\d{2}:\d{2}$/.test(plannedTime))) {
      console.error(`Arrêt invalide ou dupliqué : ${JSON.stringify(raw)}`)
      process.exit(1)
    }
    stopIds.add(id)
    for (const eleveId of assigned) {
      if (!eleveIds.includes(eleveId)) {
        console.error(`L'arrêt '${label}' référence un élève absent de la tournée : ${eleveId}`)
        process.exit(1)
      }
      if (assignedStudents.has(eleveId)) {
        console.error(`L'élève ${eleveId} est affecté à plusieurs arrêts.`)
        process.exit(1)
      }
      assignedStudents.set(eleveId, { stopId: id, stopLabel: label })
    }
    stops.push({ id, label, sequence, ...(plannedTime ? { plannedTime } : {}) })
  }
  stops.sort((a, b) => a.sequence - b.sequence)
  const duplicateSequences = new Set(stops.map(stop => stop.sequence)).size !== stops.length
  if (duplicateSequences) {
    console.error('Chaque arrêt doit avoir un numéro de séquence unique.')
    process.exit(1)
  }
  const withoutStop = eleveIds.filter(eleveId => !assignedStudents.has(eleveId))
  if (withoutStop.length > 0) {
    console.error(`Chaque élève doit avoir un arrêt. Manquants : ${withoutStop.join(', ')}`)
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

  const driver = await auth.getUserByEmail(driverEmail)
  const driverSnap = await db.collection('driverProfiles').doc(driver.uid).get()
  if (!driverSnap.exists || driverSnap.get('active') !== true) {
    console.error('Le compte ne possède pas de profil chauffeur actif.')
    process.exit(1)
  }
  const driverProfile = driverSnap.data()
  const routeIds = Array.isArray(driverProfile.routeIds) ? driverProfile.routeIds : []
  if (routeIds.length > 0 && !routeIds.includes(routeId)) {
    console.error(`Le circuit '${routeId}' n'est pas assigné à ce chauffeur.`)
    process.exit(1)
  }

  const studentRefs = eleveIds.map(id => db.collection('eleves').doc(id))
  const studentSnaps = await db.getAll(...studentRefs)
  const missing = studentSnaps.filter(snap => !snap.exists).map(snap => snap.id)
  if (missing.length > 0) {
    console.error(`Élèves introuvables : ${missing.join(', ')}`)
    process.exit(1)
  }

  const vehicleId = driverProfile.vehicleId || ''
  const vehicleLabel = requestedVehicleLabel || vehicleId || 'Véhicule scolaire'
  const defaultTripId = [serviceDate, routeId, direction, scheduledTime.replace(':', '')]
    .map(cleanId)
    .filter(Boolean)
    .join('_')
  const tripId = cleanId(option('trip-id') || defaultTripId)
  if (!tripId) {
    console.error('Identifiant de tournée invalide.')
    process.exit(1)
  }

  const tripRef = db.collection('transportTrips').doc(tripId)
  if ((await tripRef.get()).exists) {
    console.error(`La tournée ${tripId} existe déjà ; aucun écrasement effectué.`)
    process.exit(1)
  }

  const now = admin.firestore.FieldValue.serverTimestamp()
  const batch = db.batch()
  batch.create(tripRef, {
    driverUid: driver.uid,
    serviceDate,
    direction,
    routeId,
    routeLabel,
    vehicleId,
    vehicleLabel,
    scheduledTime,
    stops,
    stopIds: stops.map(stop => stop.id),
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  })

  let unlinkedParents = 0
  studentSnaps.forEach(snap => {
    const student = snap.data()
    const assignedStop = assignedStudents.get(snap.id)
    if (!student.parentUid) unlinkedParents++
    batch.create(tripRef.collection('passengers').doc(snap.id), {
      tripId,
      eleveId: snap.id,
      elevePrenom: student.prenomLatin || student.prenom || '',
      eleveNom: student.nomLatin || student.nom || '',
      classe: student.classe || '',
      serviceDate,
      direction,
      routeLabel,
      vehicleLabel,
      scheduledTime,
      stopId: assignedStop.stopId,
      stopLabel: assignedStop.stopLabel,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    })
  })

  await batch.commit()
  console.log(`Tournée créée : transportTrips/${tripId}`)
  console.log(`Chauffeur : ${driverEmail}`)
  console.log(`Passagers : ${studentSnaps.length}`)
  if (unlinkedParents > 0) {
    console.log(`Attention : ${unlinkedParents} élève(s) sans compte parent lié ne recevront pas le suivi parent.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur :', error.message || error)
    process.exit(1)
  })
