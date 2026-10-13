/**
 * Removes the old `passwordResetCooldowns` documents that were named by the
 * e-mail address in clear. Since 2026-10-13 a slot is named by a fingerprint
 * (`e_…`, see functions/resetThrottle.js) and the old ones are never read.
 * Prints counts only, never an address.
 *
 * Run only AFTER sendBrandedPasswordReset is deployed with the new naming.
 *
 * Dry run: node scripts/cleanup-reset-cooldowns.js
 * Commit:  node scripts/cleanup-reset-cooldowns.js --commit
 */

const path = require('path')
const fs = require('fs')

async function main() {
  const commit = process.argv.includes('--commit')
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Clé Firebase Admin introuvable : ${keyPath}`)
  }

  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()

  // IDs only: the documents themselves are not downloaded.
  const refs = await db.collection('passwordResetCooldowns').listDocuments()
  const legacy = refs.filter((ref) => ref.id.includes('@'))

  if (commit) {
    for (let i = 0; i < legacy.length; i += 400) {
      const batch = db.batch()
      legacy.slice(i, i + 400).forEach((ref) => batch.delete(ref))
      await batch.commit()
    }
  }

  console.log(JSON.stringify({
    mode: commit ? 'commit' : 'dry-run',
    total: refs.length,
    namedByAddress: legacy.length,
    kept: refs.length - legacy.length,
  }))
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
