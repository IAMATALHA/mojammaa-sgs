/**
 * cleanupOrphanPedago.js — supprime les devoirs / ressources rattachés à un
 * prof pour une classe qu'il N'ENSEIGNE PAS (données de démo incohérentes :
 * le prof démo s'était vu attribuer des devoirs de primaire).
 *
 * Critère de suppression : doc dont le `teacherId` appartient à un professeur,
 * mais dont le `classeId` n'est PAS dans les classes de ce professeur
 * (champ `classes[]` ou legacy `classe`).
 *
 * Sécurité : DRY-RUN par défaut (liste seulement). Passer `--commit` pour
 * supprimer réellement.
 *
 *   node scripts/demo/cleanupOrphanPedago.js            # aperçu
 *   node scripts/demo/cleanupOrphanPedago.js --commit   # suppression
 */
const path = require('path')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
const COLLECTIONS = ['devoirs', 'ressources']

async function main() {
  const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()

  // Carte uid → Set(classes) pour les professeurs.
  const usersSnap = await db.collection('users').where('role', '==', 'professeur').get()
  const teacherClasses = new Map()
  usersSnap.forEach(d => {
    const u = d.data()
    const set = new Set(Array.isArray(u.classes) ? u.classes : [])
    if (typeof u.classe === 'string' && u.classe) set.add(u.classe)
    teacherClasses.set(d.id, { set, nom: `${u.prenom || ''} ${u.nom || ''}`.trim() })
  })
  console.log(`Professeurs: ${teacherClasses.size}`)

  let totalToDelete = 0
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get()
    const orphans = []
    snap.forEach(d => {
      const data = d.data()
      const owner = teacherClasses.get(data.teacherId)
      if (!owner) return // pas un prof connu → on ne touche pas
      if (!data.classeId) return
      if (!owner.set.has(data.classeId)) {
        orphans.push({ id: d.id, ref: d.ref, classeId: data.classeId, titre: data.titre, owner: owner.nom })
      }
    })
    console.log(`\n[${col}] ${snap.size} docs, ${orphans.length} hors-périmètre :`)
    orphans.forEach(o => console.log(`   - ${o.classeId.padEnd(8)} « ${o.titre || '?'} »  (prof ${o.owner})`))
    totalToDelete += orphans.length

    if (COMMIT && orphans.length) {
      // Suppression par lots de 400.
      for (let i = 0; i < orphans.length; i += 400) {
        const batch = db.batch()
        orphans.slice(i, i + 400).forEach(o => batch.delete(o.ref))
        await batch.commit()
      }
      console.log(`   ✓ supprimés`)
    }
  }

  console.log(`\n${COMMIT ? 'Supprimés' : 'À supprimer (dry-run)'} : ${totalToDelete}`)
  if (!COMMIT && totalToDelete) console.log('→ relancer avec --commit pour appliquer.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
