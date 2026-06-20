/**
 * syncEmploiDuTemps — reconstruit la collection `emploiDuTemps` (EDT indexé par
 * classe, lisible par tous les connectés) à partir des `schedules/{teacherUid}`
 * (source de vérité, lisible prof/admin seulement).
 *
 * Chaque créneau d'un prof devient un doc `emploiDuTemps` :
 *   id = `${classeId}__${day}__${startTime}`   (idempotent)
 *   { classeId, day, startTime, endTime, durationMin,
 *     seance?, matiere, salle?, professeurNom, teacherUid, updatedAt }
 *
 * matiere / professeurNom sont résolus depuis users/{teacherUid}
 * (champ `matiere` global du prof + prenom/nom).
 *
 * Rebuild complet : on supprime d'abord les docs `emploiDuTemps` existants,
 * puis on réécrit. Relance ce script quand un prof met à jour son EDT.
 *
 *   node scripts/syncEmploiDuTemps.js            → dry-run (affiche)
 *   node scripts/syncEmploiDuTemps.js --commit   → écrit dans Firestore
 */
const path = require('path')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

// `${classeId}__${day}__${startTime}` → doc id stable (idempotent)
function slotId(classe, day, startTime) {
  return `${classe}__${day}__${startTime}`.replace(/[/#?]/g, '-')
}

async function main() {
  const schedSnap = await db.collection('schedules').get()
  console.log(`schedules lus : ${schedSnap.size}`)

  // Cache des infos prof (matiere + nom) pour éviter les relectures.
  const teacherCache = new Map()
  async function teacherInfo(uid) {
    if (teacherCache.has(uid)) return teacherCache.get(uid)
    const u = await db.collection('users').doc(uid).get()
    const d = u.exists ? u.data() : {}
    const info = {
      matiere: d.matiere || null,
      professeurNom: `${d.prenom || ''} ${d.nom || ''}`.trim() || null,
    }
    teacherCache.set(uid, info)
    return info
  }

  // Construire les nouveaux docs.
  const docs = []
  for (const sched of schedSnap.docs) {
    const data = sched.data()
    const teacherUid = data.teacherUid || sched.id
    const info = await teacherInfo(teacherUid)
    for (const s of data.weeklySlots || []) {
      if (!s.classe || !s.day || !s.startTime) continue
      docs.push({
        id: slotId(s.classe, s.day, s.startTime),
        body: {
          classeId: s.classe,
          day: s.day,
          startTime: s.startTime,
          endTime: s.endTime || null,
          durationMin: s.durationMin || null,
          seance: s.seance || null,
          matiere: s.subject || info.matiere || null,
          salle: s.room || null,
          professeurNom: info.professeurNom,
          teacherUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      })
    }
  }

  console.log(`\ncréneaux à écrire : ${docs.length}`)
  for (const d of docs) {
    console.log(`  ${d.id} → ${d.body.matiere || '?'} · ${d.body.professeurNom || '?'} ${d.body.salle ? '· ' + d.body.salle : ''}`)
  }

  if (!COMMIT) {
    console.log('\n(dry-run — relance avec --commit pour écrire)')
    return
  }

  // 1) Purger les docs existants (rebuild complet).
  const existing = await db.collection('emploiDuTemps').get()
  let batch = db.batch()
  let ops = 0
  for (const old of existing.docs) {
    batch.delete(old.ref)
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  // 2) Réécrire.
  for (const d of docs) {
    batch.set(db.collection('emploiDuTemps').doc(d.id), d.body)
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  if (ops > 0) await batch.commit()

  console.log(`\n✅ ${docs.length} créneaux écrits (${existing.size} anciens supprimés).`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
