/**
 * digest.js — récapitulatif hebdomadaire par parent (logique partagée).
 *
 * Utilisé par :
 *   - le trigger planifié `weeklyDigest` (index.js, vendredi 16h Casablanca)
 *   - scripts/runWeeklyDigest.js (dry-run de vérification / envoi manuel)
 *
 * Pour chaque parent : nouvelles notes, absences de la semaine et devoirs
 * à venir de SES enfants. Les parents sans aucune activité sont SAUTÉS
 * (pas de spam « 0 partout »). L'envoi écrit un doc `messages` par parent
 * (bilingue fr+ar) — la CF onMessageCreated fait le push.
 */

function iso(d) { return d.toISOString().split('T')[0] }

function tsToDate(v) {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (v._seconds != null) return new Date(v._seconds * 1000)
  return null
}

/** Construit les digests (sans rien écrire). */
async function buildWeeklyDigests(db) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400e3)
  const isoWeekAgo = iso(weekAgo)
  const isoToday = iso(now)
  const isoNextWeek = iso(new Date(now.getTime() + 7 * 86400e3))

  // Petite école (~100 élèves) : lectures complètes acceptables.
  const [elevesSnap, notesSnap, absSnap, devoirsSnap] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('notes').get(),
    db.collection('absences').where('date', '>=', isoWeekAgo).get(),
    db.collection('devoirs').get(),
  ])

  // enfants par parent
  const childrenByParent = new Map()
  elevesSnap.forEach((d) => {
    const e = d.data()
    if (e.active === false || !e.parentUid) return
    const list = childrenByParent.get(e.parentUid) || []
    list.push({
      id: d.id,
      prenom: e.prenomLatin || e.prenom || '',
      prenomAr: e.prenom || e.prenomLatin || '',
      classe: e.classe || '',
    })
    childrenByParent.set(e.parentUid, list)
  })

  // nouvelles notes par élève (créées/importées cette semaine)
  const newNotesByEleve = new Map()
  notesSnap.forEach((d) => {
    const n = d.data()
    const when = tsToDate(n.updatedAt) || tsToDate(n.importedAt) || tsToDate(n.createdAt)
    if (!when || when < weekAgo) return
    newNotesByEleve.set(n.eleveId, (newNotesByEleve.get(n.eleveId) || 0) + 1)
  })

  // absences de la semaine par élève (jours distincts)
  const absDaysByEleve = new Map()
  absSnap.forEach((d) => {
    const a = d.data()
    if (a.statut !== 'absent' || !a.eleveId) return
    const set = absDaysByEleve.get(a.eleveId) || new Set()
    set.add(a.date)
    absDaysByEleve.set(a.eleveId, set)
  })

  // devoirs à venir par classe (échéance dans les 7 prochains jours)
  const upcomingByClasse = new Map()
  devoirsSnap.forEach((d) => {
    const dev = d.data()
    const due = dev.dateLimite
    if (typeof due !== 'string' || due <= isoToday || due > isoNextWeek) return
    upcomingByClasse.set(dev.classeId, (upcomingByClasse.get(dev.classeId) || 0) + 1)
  })

  const digests = []
  for (const [parentUid, children] of childrenByParent) {
    const linesFr = []
    const linesAr = []
    let activity = 0
    for (const c of children) {
      const notes = newNotesByEleve.get(c.id) || 0
      const absDays = (absDaysByEleve.get(c.id) || new Set()).size
      const homework = upcomingByClasse.get(c.classe) || 0
      activity += notes + absDays + homework
      if (notes + absDays + homework === 0) continue
      const fr = []
      const ar = []
      if (notes > 0)    { fr.push(`${notes} nouvelle(s) note(s)`);      ar.push(`${notes} نقطة جديدة`) }
      if (absDays > 0)  { fr.push(`${absDays} jour(s) d'absence`);      ar.push(`${absDays} يوم غياب`) }
      if (homework > 0) { fr.push(`${homework} devoir(s) à venir`);     ar.push(`${homework} واجب قادم`) }
      linesFr.push(`• ${c.prenom} : ${fr.join(', ')}`)
      linesAr.push(`• ${c.prenomAr} : ${ar.join('، ')}`)
    }
    if (activity === 0 || linesFr.length === 0) continue

    digests.push({
      parentUid,
      body:   `Cette semaine :\n${linesFr.join('\n')}\n\nOuvrez l'application pour le détail.`,
      bodyAr: `هذا الأسبوع :\n${linesAr.join('\n')}\n\nافتحوا التطبيق لمزيد من التفاصيل.`,
    })
  }
  return digests
}

/** Écrit un message digest par parent (déclenche le push serveur). */
async function sendWeeklyDigests(db, digests) {
  let sent = 0
  for (const d of digests) {
    await db.collection('messages').add({
      type:      'announcement',
      category:  'announcement',
      subject:   'Récapitulatif de la semaine 📋',
      subjectAr: 'ملخص الأسبوع 📋',
      body:      d.body,
      bodyAr:    d.bodyAr,
      fromId:    'system-digest',
      fromNom:   'Mojammaa Al Maarifa',
      fromRole:  'admin',
      toType:    'user',
      toIds:     [d.parentUid],
      toLabel:   'Digest hebdomadaire',
      priority:  'normal',
      readBy:    [],
      status:    'sent',
      createdAt: new Date(),
    })
    sent++
  }
  return sent
}

module.exports = { buildWeeklyDigests, sendWeeklyDigests }
