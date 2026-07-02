/**
 * syncEmploiDuTemps — OUTIL DE SECOURS / BACKFILL.
 *
 * Depuis l'ajout de la Cloud Function `onScheduleWritten` (functions/index.js,
 * juillet 2026), `emploiDuTemps` se resynchronise TOUT SEUL à chaque écriture
 * de `schedules/{teacherUid}` (via l'admin web /emploi-du-temps ou un script
 * comme importSchedule.js) — plus besoin de lancer ce script après une
 * modification normale.
 *
 * Reste utile pour : un rebuild complet après une migration, une correction
 * en masse, ou si la CF a été désactivée temporairement.
 *
 * Chaque créneau d'un prof devient un doc `emploiDuTemps` :
 *   id = `${classeId}__${day}__${startTime}`   (idempotent)
 *   { classeId, day, startTime, endTime, durationMin,
 *     seance?, matiere, salle?, professeurNom, teacherUid, updatedAt }
 *
 * matiere / professeurNom sont résolus depuis users/{teacherUid}
 * (champ `matiere` global du prof + prenom/nom).
 *
 * Rebuild complet : on supprime d'abord TOUS les docs `emploiDuTemps`
 * existants, puis on réécrit depuis `schedules/*`.
 *
 *   node scripts/syncEmploiDuTemps.js            → dry-run (affiche)
 *   node scripts/syncEmploiDuTemps.js --commit   → écrit dans Firestore
 */
const path = require('path')
const { buildSlotDocs } = require('./../functions/emploiDuTempsSync')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

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

  // Construire les nouveaux docs (même logique que la CF onScheduleWritten).
  const docs = []
  for (const sched of schedSnap.docs) {
    const data = sched.data()
    const teacherUid = data.teacherUid || sched.id
    const info = await teacherInfo(teacherUid)
    for (const d of buildSlotDocs(teacherUid, data.weeklySlots || [], info)) {
      docs.push({ id: d.id, body: { ...d.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() } })
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
