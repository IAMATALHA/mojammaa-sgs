/**
 * Backfill (one-shot) de l'annuaire directory/staff — même logique que le
 * trigger onUserWritten (functions/index.js → refreshDirectory).
 *
 *   node scripts/backfillDirectory.js
 */
const path = require('path')
const admin = require('firebase-admin')

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

async function main() {
  const snap = await db.collection('users').get()
  const teachers = []
  const admins = []
  snap.forEach((d) => {
    const u = d.data() || {}
    if (u.role === 'professeur') {
      teachers.push({
        uid: d.id,
        nom: u.nom || '',
        prenom: u.prenom || '',
        matiere: u.matiere || '',
        classes: Array.isArray(u.classes) ? u.classes : (u.classe ? [u.classe] : []),
      })
    } else if (u.role === 'admin') {
      admins.push({ uid: d.id, nom: u.nom || '', prenom: u.prenom || '' })
    }
  })
  const byName = (a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
  teachers.sort(byName)
  admins.sort(byName)
  await db.collection('directory').doc('staff').set({ teachers, admins, updatedAt: new Date() })
  console.log(`directory/staff écrit : ${teachers.length} profs, ${admins.length} admins`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
