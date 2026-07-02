/**
 * emploiDuTempsSync — construit les docs `emploiDuTemps` (indexés par classe)
 * à partir des `weeklySlots` d'un prof (`schedules/{teacherUid}`).
 *
 * Logique partagée par :
 *   - functions/index.js (exports.onScheduleWritten — déclenché en live)
 *   - scripts/syncEmploiDuTemps.js (rebuild manuel de secours / backfill)
 *
 * id = `${classe}__${day}__${startTime}` (idempotent, stable si le créneau
 * ne bouge pas).
 */

function slotId(classe, day, startTime) {
  return `${classe}__${day}__${startTime}`.replace(/[/#?]/g, '-')
}

/**
 * @param {string} teacherUid
 * @param {Array<{day:string, startTime:string, endTime?:string, durationMin?:number, classe:string, subject?:string, room?:string, seance?:string}>} weeklySlots
 * @param {{matiere?: string|null, professeurNom?: string|null}} teacherInfo
 * @returns {Array<{id: string, body: object}>}
 */
function buildSlotDocs(teacherUid, weeklySlots, teacherInfo) {
  const docs = []
  for (const s of weeklySlots || []) {
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
        matiere: s.subject || teacherInfo.matiere || null,
        salle: s.room || null,
        professeurNom: teacherInfo.professeurNom || null,
        teacherUid,
      },
    })
  }
  return docs
}

module.exports = { buildSlotDocs, slotId }
