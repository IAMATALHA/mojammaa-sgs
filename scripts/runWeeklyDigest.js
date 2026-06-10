/**
 * Digest hebdo — exécution manuelle. Même logique que la CF `weeklyDigest`.
 *
 *   node scripts/runWeeklyDigest.js            → dry-run (affiche les digests)
 *   node scripts/runWeeklyDigest.js --commit   → ÉCRIT les messages (push réel !)
 */
const path = require('path')
const admin = require('firebase-admin')
const { buildWeeklyDigests, sendWeeklyDigests } = require('../functions/digest')

const COMMIT = process.argv.includes('--commit')

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

async function main() {
  const digests = await buildWeeklyDigests(db)
  console.log(`${digests.length} parent(s) avec activité cette semaine\n`)
  for (const d of digests) {
    console.log(`── parent ${d.parentUid}`)
    console.log(d.body)
    console.log('---')
    console.log(d.bodyAr)
    console.log()
  }
  if (COMMIT) {
    const sent = await sendWeeklyDigests(db, digests)
    console.log(`✓ ${sent} message(s) digest écrits (push via CF)`)
  } else {
    console.log('(dry-run — --commit pour envoyer réellement)')
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
