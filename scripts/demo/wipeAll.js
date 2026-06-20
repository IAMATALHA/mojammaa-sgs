/**
 * NETTOYAGE des données de test (DESTRUCTIF).
 *
 * Supprime tous les documents de chaque collection SAUF :
 *   • config/*                      (superadmins, paramètres app)
 *   • users/{KEEP_UIDS}             (propriétaire superadmin + reviewer Google Play)
 *
 * Les comptes Firebase Auth ne sont PAS supprimés (réversible) : sans doc
 * users/{uid}, un compte orphelin ne peut de toute façon rien faire dans l'app.
 *
 * ⚠️  Lance `node scripts/demo/backupAll.js` AVANT.
 *
 *   node scripts/demo/wipeAll.js            → dry-run (compte ce qui serait supprimé)
 *   node scripts/demo/wipeAll.js --commit   → supprime réellement
 */
const path = require('path')
const fs = require('fs')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')

// Comptes à conserver dans la collection `users`
const KEEP_UIDS = new Set([
  'emD31Tpp70fNzfxbd2NEznHS94w2', // Youssef Atalha — superadmin (propriétaire)
  'T2lpoTLWuASJRtRkKPub85ZOgx12', // Google Play — Reviewer (review closed testing)
])
// Collections entièrement préservées
const KEEP_COLLECTIONS = new Set(['config'])

const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
const db = admin.firestore()

async function deleteRefs(refs) {
  let batch = db.batch(), ops = 0, done = 0
  for (const ref of refs) {
    batch.delete(ref)
    if (++ops === 450) { await batch.commit(); done += ops; batch = db.batch(); ops = 0 }
  }
  if (ops > 0) { await batch.commit(); done += ops }
  return done
}

async function main() {
  const collections = await db.listCollections()
  let plannedTotal = 0
  const plan = []

  for (const col of collections) {
    if (KEEP_COLLECTIONS.has(col.id)) { console.log(`   ⏭  ${col.id.padEnd(18)} (préservée entièrement)`); continue }
    const snap = await col.get()
    const refs = snap.docs
      .filter(d => !(col.id === 'users' && KEEP_UIDS.has(d.id)))
      .map(d => d.ref)
    const kept = snap.size - refs.length
    plannedTotal += refs.length
    plan.push({ col, refs })
    console.log(`   ${col.id.padEnd(18)} supprime ${String(refs.length).padStart(5)}${kept ? `  (garde ${kept})` : ''}`)
  }

  console.log(`\n${plannedTotal} document(s) seraient supprimés. Collections préservées : ${[...KEEP_COLLECTIONS].join(', ')}.`)

  if (!COMMIT) {
    console.log('\n💡 Dry-run. Relance avec --commit pour supprimer réellement.')
    process.exit(0)
  }

  console.log('\n🗑️  Suppression en cours...')
  let total = 0
  for (const { col, refs } of plan) {
    const n = await deleteRefs(refs)
    total += n
    console.log(`   ✓ ${col.id.padEnd(18)} ${n} supprimé(s)`)
  }
  console.log(`\n✅ ${total} document(s) supprimés.`)
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
