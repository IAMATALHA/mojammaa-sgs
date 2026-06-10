/**
 * Backfill des agrégats classStats/{classe}_{semestre} à partir des notes
 * existantes. Même logique que le trigger onNoteWritten (functions/classStats.js).
 *
 *   node scripts/backfillClassStats.js            → dry-run (affiche)
 *   node scripts/backfillClassStats.js --commit   → écrit dans Firestore
 */
const path = require('path')
const admin = require('firebase-admin')
const { computeClassStats, statsDocId } = require('../functions/classStats')

const COMMIT = process.argv.includes('--commit')

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

async function main() {
  const snap = await db.collection('notes').get()
  console.log(`notes lues : ${snap.size}`)

  // Grouper par (classe, semestre)
  const groups = new Map()
  snap.forEach((d) => {
    const x = d.data()
    if (!x.classe || !x.semestre) return
    const key = `${x.classe}|${x.semestre}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(x)
  })

  for (const [key, docs] of groups) {
    const [classe, semestre] = key.split('|')
    const stats = computeClassStats(docs)
    const id = statsDocId(classe, semestre)
    console.log(`\nclassStats/${id} — ${stats.students} élèves, ${stats.notesCount} notes`)
    console.log('  subjectAvgs:', JSON.stringify(stats.subjectAvgs))
    console.log('  studentAvgs:', JSON.stringify(stats.studentAvgs))
    if (COMMIT) {
      await db.collection('classStats').doc(id).set({ classe, semestre, ...stats, updatedAt: new Date() })
      console.log('  ✓ écrit')
    }
  }
  if (!COMMIT) console.log('\n(dry-run — relancer avec --commit pour écrire)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
