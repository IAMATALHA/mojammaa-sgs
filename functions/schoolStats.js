/**
 * computeSchoolStats — agrégat COMPLET du tableau de bord « Statistiques » admin,
 * calculé côté serveur pour être écrit dans stats/summary. Le client ne lit
 * alors qu'UN document au lieu de scanner 5 collections (eleves/users/notes/
 * absences/devoirs) → chargement instantané quel que soit le volume.
 *
 * ⚠️ MIROIR EXACT de buildDashboardData dans
 *    src/screens/admin/AdminStatsScreen.tsx
 * Garder les deux en phase si l'un change (mêmes formules : healthScore,
 * heatScore, niveauGroup, tendances 5/7 jours, bandes de notes…).
 *
 * Normalisation des notes alignée sur le mapping onSnapshot du client :
 *   note    = asNumber(note)   ← volontairement PAS la moyenne des `controles`
 *                                (contrairement à classStats.js) pour rester
 *                                identique à ce que l'écran calculait avant.
 *   subject = matiereLabel || matiere || subject.
 */

function asString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function asNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

const round1 = (v) => Math.round(v * 10) / 10
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v))

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function monthStartISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function lastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date()
    d.setDate(d.getDate() - (count - 1 - index))
    return { iso: d.toISOString().split('T')[0], label: String(d.getDate()).padStart(2, '0') }
  })
}

const isAbsent = (statut) => statut === 'absent'
const isLate = (statut) => statut === 'retard' || statut === 'late'
const isActiveHomework = (dateLimite, today) => !dateLimite || dateLimite >= today

// Couleurs des bandes de notes (miroir de `palette` côté client).
const BAND = { danger: '#E5484D', orange: '#D97706', navy: '#1D3557', green: '#2F9E44' }

function gradeBands(values) {
  return [
    { label: '<8',    value: values.filter((n) => n < 8).length,            color: BAND.danger },
    { label: '8-10',  value: values.filter((n) => n >= 8 && n < 10).length, color: BAND.orange },
    { label: '10-14', value: values.filter((n) => n >= 10 && n < 14).length, color: BAND.navy },
    { label: '14+',   value: values.filter((n) => n >= 14).length,          color: BAND.green },
  ]
}

/**
 * @param cache { eleves, users, notes, absences, devoirs } — tableaux de docs
 *   bruts avec `.id` et leurs champs (équivalent de snap.docs.map(d => ({id, ...data}))).
 * @returns DashboardData (même forme que côté client) — chaque classStats
 *   porte en plus `niveauGroup` pour le drill-down niveau → classe.
 */
function computeSchoolStats(cache) {
  const today = todayISO()
  const monthStart = monthStartISO()

  // ── normalisation (miroir du mapping onSnapshot client) ──
  const eleves = (cache.eleves || []).map((d) => ({
    id: d.id, classe: asString(d.classe), niveau: asString(d.niveau),
  }))
  const users = (cache.users || []).map((d) => ({ id: d.id, role: asString(d.role) || 'parent' }))
  const notes = (cache.notes || []).map((d) => ({
    id: d.id,
    eleveId: asString(d.eleveId),
    classe: asString(d.classe),
    subject: asString(d.matiereLabel) || asString(d.matiere) || asString(d.subject),
    note: asNumber(d.note),
  }))
  const absences = (cache.absences || []).map((d) => ({
    id: d.id, eleveId: asString(d.eleveId), classe: asString(d.classe),
    date: asString(d.date), statut: asString(d.statut),
  }))
  const devoirs = (cache.devoirs || []).map((d) => ({
    id: d.id, classeId: asString(d.classeId) || asString(d.classe), dateLimite: asString(d.dateLimite),
  }))

  const validNotes = notes.filter((r) => r.note != null && r.note >= 0 && r.note <= 20)
  const classStudents = new Map()
  const notesByEleve = new Map()
  const notesByClass = new Map()
  const notesBySubject = new Map()
  const todayAbsentEleves = new Set()
  const todayLateEleves = new Set()
  const absentTodayByClass = new Map()
  const incidentsMonthByClass = new Map()
  const activeHomeworkByClass = new Map()

  eleves.forEach((eleve) => {
    if (!eleve.classe) return
    const rows = classStudents.get(eleve.classe) || []
    rows.push(eleve)
    classStudents.set(eleve.classe, rows)
  })

  validNotes.forEach((note) => {
    if (note.eleveId) {
      const rows = notesByEleve.get(note.eleveId) || []
      rows.push(note.note)
      notesByEleve.set(note.eleveId, rows)
    }
    if (note.classe) {
      const rows = notesByClass.get(note.classe) || []
      rows.push(note)
      notesByClass.set(note.classe, rows)
    }
    if (note.subject) {
      const rows = notesBySubject.get(note.subject) || []
      rows.push(note)
      notesBySubject.set(note.subject, rows)
    }
  })

  const trendDays = lastDays(5)
  const trendByClass = new Map()

  absences.forEach((absence) => {
    if (!isAbsent(absence.statut) && !isLate(absence.statut)) return

    if (absence.date === today) {
      const id = absence.eleveId || absence.id
      if (isAbsent(absence.statut)) {
        todayAbsentEleves.add(id)
        if (absence.classe) {
          const set = absentTodayByClass.get(absence.classe) || new Set()
          set.add(id)
          absentTodayByClass.set(absence.classe, set)
        }
      }
      if (isLate(absence.statut)) todayLateEleves.add(id)
    }

    if (absence.date >= monthStart && absence.classe) {
      incidentsMonthByClass.set(absence.classe, (incidentsMonthByClass.get(absence.classe) || 0) + 1)
    }

    if (absence.classe) {
      const day = trendDays.find((d) => d.iso === absence.date)
      if (day) {
        const classMap = trendByClass.get(absence.classe) || new Map()
        const set = classMap.get(day.iso) || new Set()
        set.add(`${absence.eleveId || absence.id}-${absence.statut}`)
        classMap.set(day.iso, set)
        trendByClass.set(absence.classe, classMap)
      }
    }
  })

  devoirs.forEach((devoir) => {
    if (!devoir.classeId || !isActiveHomework(devoir.dateLimite, today)) return
    activeHomeworkByClass.set(devoir.classeId, (activeHomeworkByClass.get(devoir.classeId) || 0) + 1)
  })

  const studentAverages = [...notesByEleve.values()].map((vals) => vals.reduce((s, v) => s + v, 0) / vals.length)
  const avgNote = validNotes.length > 0 ? round1(validNotes.reduce((s, r) => s + r.note, 0) / validNotes.length) : null
  const successRate = studentAverages.length > 0
    ? Math.round((studentAverages.filter((v) => v >= 10).length / studentAverages.length) * 100)
    : null

  const classStats = [...classStudents.entries()].map(([name, students]) => {
    const classNotes = notesByClass.get(name) || []
    const classNoteValues = classNotes.map((r) => r.note).filter((v) => v >= 0 && v <= 20)
    const classNotesByEleve = new Map()
    const subjects = new Set()

    classNotes.forEach((note) => {
      if (note.subject) subjects.add(note.subject)
      if (!note.eleveId || note.note == null) return
      const rows = classNotesByEleve.get(note.eleveId) || []
      rows.push(note.note)
      classNotesByEleve.set(note.eleveId, rows)
    })

    const averages = [...classNotesByEleve.values()].map((vals) => vals.reduce((s, v) => s + v, 0) / vals.length)
    const absencesToday = absentTodayByClass.get(name)?.size || 0
    const presenceRate = students.length > 0 ? Math.round(((students.length - absencesToday) / students.length) * 100) : 100
    const classAvg = classNoteValues.length > 0 ? round1(classNoteValues.reduce((s, v) => s + v, 0) / classNoteValues.length) : null
    const classSuccess = averages.length > 0
      ? Math.round((averages.filter((v) => v >= 10).length / averages.length) * 100)
      : null
    const noteScore = classAvg == null ? 55 : (classAvg / 20) * 100
    const successScore = classSuccess ?? 55
    const coverageScore = subjects.size > 0 ? Math.min(100, subjects.size * 18) : 45
    const incidentsPenalty = Math.min(24, (incidentsMonthByClass.get(name) || 0) * 2)
    const classTrend = trendByClass.get(name)
    const niveau = students.find((e) => e.niveau)?.niveau || ''

    return {
      name,
      niveau,
      niveauGroup: niveau || name.replace(/[-\d]/g, '').trim() || 'Autre',
      studentCount: students.length,
      presenceRate: clamp(presenceRate),
      avgNote: classAvg,
      successRate: classSuccess,
      absencesToday,
      incidentsMonth: incidentsMonthByClass.get(name) || 0,
      activeHomework: activeHomeworkByClass.get(name) || 0,
      subjectsCovered: subjects.size,
      healthScore: clamp(Math.round((presenceRate * 0.38) + (noteScore * 0.34) + (successScore * 0.18) + (coverageScore * 0.10) - incidentsPenalty)),
      trend: trendDays.map((day) => ({ label: day.label, value: classTrend?.get(day.iso)?.size || 0 })),
    }
  }).sort((a, b) => a.healthScore - b.healthScore || a.name.localeCompare(b.name, 'fr'))

  const subjectStats = [...notesBySubject.entries()].map(([name, subjectNotes]) => {
    const values = subjectNotes.map((r) => r.note).filter((v) => v >= 0 && v <= 20)
    const byEleve = new Map()
    const byClass = new Map()

    subjectNotes.forEach((note) => {
      if (note.eleveId && note.note != null) {
        const rows = byEleve.get(note.eleveId) || []
        rows.push(note.note)
        byEleve.set(note.eleveId, rows)
      }
      if (note.classe && note.note != null) {
        const rows = byClass.get(note.classe) || []
        rows.push(note.note)
        byClass.set(note.classe, rows)
      }
    })

    const averages = [...byEleve.values()].map((rows) => rows.reduce((s, v) => s + v, 0) / rows.length)
    const classAverages = [...byClass.entries()]
      .map(([className, rows]) => ({ className, avg: rows.reduce((s, v) => s + v, 0) / rows.length }))
      .sort((a, b) => a.avg - b.avg)
    const subjectAvg = values.length > 0 ? round1(values.reduce((s, v) => s + v, 0) / values.length) : null
    const subjectSuccess = averages.length > 0
      ? Math.round((averages.filter((v) => v >= 10).length / averages.length) * 100)
      : null
    const noteScore = subjectAvg == null ? 55 : (subjectAvg / 20) * 100
    const successScore = subjectSuccess ?? 55
    const coverageScore = Math.min(100, byClass.size * 14)

    return {
      name,
      notesCount: values.length,
      classesCount: byClass.size,
      avgNote: subjectAvg,
      successRate: subjectSuccess,
      below10Count: values.filter((v) => v < 10).length,
      strongestClass: classAverages[classAverages.length - 1]?.className || '—',
      weakestClass: classAverages[0]?.className || '—',
      heatScore: clamp(Math.round((noteScore * 0.50) + (successScore * 0.35) + (coverageScore * 0.15))),
    }
  }).sort((a, b) => a.heatScore - b.heatScore || a.name.localeCompare(b.name, 'fr'))

  const matrixClasses = classStats.slice(0, 6).map((row) => row.name)
  const matrixSubjects = subjectStats
    .slice()
    .sort((a, b) => b.notesCount - a.notesCount)
    .slice(0, 5)
    .map((row) => row.name)
  const classSubjectMatrix = []
  matrixClasses.forEach((className) => {
    matrixSubjects.forEach((subject) => {
      const rows = validNotes.filter((note) => note.classe === className && note.subject === subject)
      classSubjectMatrix.push({
        className,
        subject,
        avgNote: rows.length > 0 ? round1(rows.reduce((s, r) => s + r.note, 0) / rows.length) : null,
        notesCount: rows.length,
      })
    })
  })

  const days = lastDays(7)
  const trendSets = new Map()
  days.forEach((day) => trendSets.set(day.iso, new Set()))
  absences.forEach((absence) => {
    if (!trendSets.has(absence.date) || (!isAbsent(absence.statut) && !isLate(absence.statut))) return
    trendSets.get(absence.date).add(`${absence.eleveId || absence.id}-${absence.statut}`)
  })

  const niveauMap = new Map()
  classStats.forEach((cs) => {
    const list = niveauMap.get(cs.niveauGroup) || []
    list.push(cs)
    niveauMap.set(cs.niveauGroup, list)
  })
  const niveauStats = [...niveauMap.entries()].map(([name, classes]) => {
    const totalStudents = classes.reduce((s, c) => s + c.studentCount, 0)
    const allAvgs = classes.filter((c) => c.avgNote != null).map((c) => c.avgNote)
    const allSuccess = classes.filter((c) => c.successRate != null).map((c) => c.successRate)
    const totalIncidents = classes.reduce((s, c) => s + c.incidentsMonth, 0)
    const avgPresence = classes.length > 0 ? Math.round(classes.reduce((s, c) => s + c.presenceRate, 0) / classes.length) : 100
    return {
      name,
      classCount: classes.length,
      studentCount: totalStudents,
      avgNote: allAvgs.length > 0 ? round1(allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length) : null,
      successRate: allSuccess.length > 0 ? Math.round(allSuccess.reduce((s, v) => s + v, 0) / allSuccess.length) : null,
      presenceRate: avgPresence,
      incidentsMonth: totalIncidents,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return {
    totalEleves: eleves.length,
    totalClasses: classStudents.size,
    totalTeachers: users.filter((u) => u.role === 'professeur').length,
    totalParents: users.filter((u) => u.role === 'parent').length,
    absentsToday: todayAbsentEleves.size,
    retardsToday: todayLateEleves.size,
    presenceRate: eleves.length > 0 ? Math.round(((eleves.length - todayAbsentEleves.size) / eleves.length) * 100) : 100,
    avgNote,
    successRate,
    notesCount: validNotes.length,
    activeHomework: devoirs.filter((d) => isActiveHomework(d.dateLimite, today)).length,
    absenceTrend: days.map((day) => ({ label: day.label, value: trendSets.get(day.iso)?.size || 0 })),
    gradeDistribution: gradeBands(validNotes.map((r) => r.note)),
    classStats,
    subjectStats,
    matrixClasses,
    matrixSubjects,
    classSubjectMatrix,
    niveauStats,
  }
}

module.exports = { computeSchoolStats }
