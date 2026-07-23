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
 *   note    = asNumber(note), convertie en équivalent /20 pour les agrégats
 *             école entière. Une note primaire /10 compte donc x2.
 *             Volontairement PAS la moyenne des `controles`
 *             (contrairement à classStats.js) pour rester identique au client.
 *   subject = matiereLabel || matiere || subject.
 *
 * Coefficients marocains (cache.coefficients = settings/coefficients, même
 * doc que mojammaa-admin/src/pages/Statistiques.tsx) : les moyennes par
 * élève (avgNote classe/niveau/école) sont pondérées Σ(note×coef)/Σ(coef)
 * sur les matières de l'élève — miroir de coefOf() côté web. Les stats
 * PAR MATIÈRE (subjectStats, classSubjectMatrix) restent des moyennes
 * simples : un coefficient ne compare que des matières entre elles, il n'a
 * pas de sens en isolant une seule matière.
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

/**
 * Coefficients marocains (settings/coefficients : { matieres: {matiere: coef},
 * parNiveau: {niveau: {matiere: coef}} }). Résolution PAR ÉLÈVE, miroir exact
 * de coefOf dans mojammaa-admin/src/pages/Statistiques.tsx : parNiveau[niveau]
 * > matieres (global) > 1. Clé = `matiere` brute (pas matiereLabel).
 */
function makeCoefOf(coefficients) {
  const matieres = (coefficients && coefficients.matieres) || {}
  const parNiveau = (coefficients && coefficients.parNiveau) || {}
  return (matiere, niveau) => {
    const n = niveau ? parNiveau[niveau] && parNiveau[niveau][matiere] : undefined
    if (n !== undefined && n > 0) return n
    const g = matieres[matiere]
    return g > 0 ? g : 1
  }
}

/** Moyenne pondérée Σ(note×coef)/Σ(coef) — replie sur la moyenne simple si aucun coef. */
function weightedAvg(pairs) {
  const totalCoef = pairs.reduce((s, p) => s + p.c, 0)
  if (totalCoef <= 0) return pairs.reduce((s, p) => s + p.v, 0) / pairs.length
  return pairs.reduce((s, p) => s + p.v * p.c, 0) / totalCoef
}

function baremeFromData(data) {
  const explicit = asNumber(data.bareme)
  if (explicit === 10 || explicit === 20) return explicit
  const cycle = asString(data.cycle).toLowerCase()
  if (cycle === 'primaire') return 10
  if (/aep/i.test(asString(data.classe))) return 10
  return 20
}

function normalizedNote20(data) {
  const note = asNumber(data.note)
  if (note == null) return null
  const bareme = baremeFromData(data)
  if (note < 0 || note > bareme) return null
  return note * (20 / bareme)
}

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
const isPresent = (statut) => statut === 'present' || isLate(statut)

const HOMEWORK_NOT_DONE_STATUSES = new Set(['not_started', 'not_done', 'non_fait', 'nonfait', 'todo', 'assigned'])
const HOMEWORK_NOT_SUBMITTED_STATUSES = new Set(['not_submitted', 'non_rendu', 'nonrendu', 'missing', 'overdue', 'late'])

function homeworkAlertKind(status, dateLimite, today) {
  if (HOMEWORK_NOT_DONE_STATUSES.has(status)) return 'notDone'
  if (HOMEWORK_NOT_SUBMITTED_STATUSES.has(status)) return 'notSubmitted'
  if (status === 'pending' && dateLimite < today) return 'notSubmitted'
  return null
}

function submissionMatchesEleve(row, eleve) {
  const codeFromId = row.id.startsWith(`${row.homeworkId}_`)
    ? row.id.slice(row.homeworkId.length + 1)
    : ''
  return row.eleveId === eleve.id
    || (!!eleve.codeMassar && (row.eleveCodeMassar === eleve.codeMassar || codeFromId === eleve.codeMassar))
}

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

// ── Élèves à suivre — prédicat UNIQUE ────────────────────────────────────
// `computeSchoolStats` en tire le compteur `studentsToFollow`, la callable de
// drill-down en tire la liste. Toute divergence entre les deux serait un bug
// visible par l'admin (« 23 à suivre » puis 19 lignes) : un seul prédicat,
// deux consommateurs, verrouillé par un test d'invariant.

const FOLLOW_UP_LOW_AVERAGE = 10        // /20
const FOLLOW_UP_DECLINE_POINTS = 2      // baisse S1 → S2, en points
// E2 — l'absentéisme ne peut pas être un seuil absolu : « 3 absences » ne veut
// pas dire la même chose sur une semaine et sur une année. Trois conditions
// cumulatives, dont un plancher d'observations qui neutralise les débuts de
// période où deux journées relevées suffiraient à déclencher l'alerte.
const ABSENTEEISM_MIN_DAYS = 3
const ABSENTEEISM_MIN_OBSERVED = 5
const ABSENTEEISM_MIN_RATIO = 0.1

// Poids déterministes : même entrée → même priorité, aucun classement flou.
const FOLLOW_UP_WEIGHTS = {
  low_average: 3,
  absenteeism: 3,
  declining: 2,
  homework_not_done: 1,
  homework_not_submitted: 1,
}

function followUpPriority(score) {
  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

/**
 * Construit le contexte du prédicat de suivi.
 *
 * `followUpNotes` (optionnel) = notes du périmètre SANS filtre matière. Quand
 * il est absent — recalcul planifié, qui ne filtre jamais — on réutilise les
 * maps déjà construites : le résultat est alors strictement identique, sans
 * second passage sur les notes.
 */
function buildFollowUpContext(opts) {
  const shared = {
    absentDatesByEleve: opts.absentDatesByEleve,
    observedDatesByEleve: opts.observedDatesByEleve,
    homeworkAlertsByEleve: opts.homeworkAlertsByEleve,
  }
  if (!Array.isArray(opts.followUpNotes)) {
    return {
      ...shared,
      notesByEleve: opts.fallbackNotesByEleve,
      semesterNotesByEleve: opts.fallbackSemesterNotesByEleve,
    }
  }

  const notesByEleve = new Map()
  const semesterNotesByEleve = new Map()

  opts.followUpNotes
    .filter(opts.belongsToActiveEleve)
    .forEach((row) => {
      const eleveId = asString(row.eleveId)
      if (!eleveId) return
      const note = normalizedNote20(row)
      if (note == null || note < 0 || note > 20) return
      const semestre = asString(row.semestre)
      const pair = { v: note, c: opts.coefOf(asString(row.matiere), opts.eleveNiveauById.get(eleveId)) }

      if (!opts.semScope || semestre === opts.semScope) {
        const rows = notesByEleve.get(eleveId) || []
        rows.push(pair)
        notesByEleve.set(eleveId, rows)
      }
      if (semestre === 'S1' || semestre === 'S2') {
        const rows = semesterNotesByEleve.get(eleveId) || { S1: [], S2: [] }
        rows[semestre].push(pair)
        semesterNotesByEleve.set(eleveId, rows)
      }
    })

  return { ...shared, notesByEleve, semesterNotesByEleve }
}

/**
 * Évalue un élève pour la file « à suivre ».
 *
 * @param eleve { id, classe, niveau }
 * @param ctx { notesByEleve, semesterNotesByEleve, absentDatesByEleve,
 *              observedDatesByEleve, homeworkAlertsByEleve }
 *   `notesByEleve` / `semesterNotesByEleve` sont les notes de PÉRIMÈTRE, jamais
 *   filtrées par matière (A3) : le suivi d'un élève est global, sinon le
 *   compteur changerait en sélectionnant une matière et deviendrait inexplicable.
 * @returns null si rien à signaler, sinon { reasons[], metrics, priority }
 */
function evaluateFollowUp(eleve, ctx) {
  const currentPairs = ctx.notesByEleve.get(eleve.id) || []
  const currentAvg = currentPairs.length > 0 ? weightedAvg(currentPairs) : null
  const semesters = ctx.semesterNotesByEleve.get(eleve.id) || { S1: [], S2: [] }
  const s1 = semesters.S1.length > 0 ? weightedAvg(semesters.S1) : null
  const s2 = semesters.S2.length > 0 ? weightedAvg(semesters.S2) : null
  const comparisonAvg = currentAvg ?? s2 ?? s1

  const absentDays = ctx.absentDatesByEleve.get(eleve.id)?.size || 0
  const observedDays = ctx.observedDatesByEleve.get(eleve.id)?.size || 0
  const homework = ctx.homeworkAlertsByEleve.get(eleve.id)

  const reasons = []
  const metrics = {}

  if (comparisonAvg != null && comparisonAvg < FOLLOW_UP_LOW_AVERAGE) {
    reasons.push('low_average')
    metrics.average = round1(comparisonAvg)
  }
  if (s1 != null && s2 != null && s2 - s1 <= -FOLLOW_UP_DECLINE_POINTS) {
    reasons.push('declining')
    metrics.semesterS1 = round1(s1)
    metrics.semesterS2 = round1(s2)
    metrics.decline = round1(s1 - s2)
  }
  if (
    absentDays >= ABSENTEEISM_MIN_DAYS
    && observedDays >= ABSENTEEISM_MIN_OBSERVED
    && absentDays / observedDays >= ABSENTEEISM_MIN_RATIO
  ) {
    reasons.push('absenteeism')
    // Numérateur ET dénominateur remontent au client : le badge affiche
    // « 3 j. / 24 j. observés · ce mois », jamais un pourcentage nu qui
    // inviterait à le comparer au taux d'assiduité du hero (calculé, lui,
    // sur des lignes de relevé et non sur des journées).
    metrics.absentDays = absentDays
    metrics.observedDays = observedDays
  }
  // `homeworkAlertsByEleve` porte déjà des compteurs ({ notDone, notSubmitted }),
  // truthy dès la première alerte : la valeur EST la preuve à afficher.
  if (homework?.notDone) {
    reasons.push('homework_not_done')
    metrics.homeworkNotDone = homework.notDone
  }
  if (homework?.notSubmitted) {
    reasons.push('homework_not_submitted')
    metrics.homeworkNotSubmitted = homework.notSubmitted
  }

  if (reasons.length === 0) return null

  const score = reasons.reduce((sum, reason) => sum + (FOLLOW_UP_WEIGHTS[reason] || 0), 0)
  return { reasons, metrics, priority: followUpPriority(score), score }
}

/**
 * @param cache { eleves, users, notes, absences, devoirs, homeworkSubmissions } — tableaux de docs
 *   bruts avec `.id` et leurs champs (équivalent de snap.docs.map(d => ({id, ...data}))).
 * @param options { semestre?: 'S1'|'S2' } — période des résultats. Les deux
 *   semestres restent disponibles pour détecter une baisse S1 → S2.
 * @returns DashboardData (même forme que côté client) — chaque classStats
 *   porte en plus `niveauGroup` pour le drill-down niveau → classe.
 */
function computeSchoolStats(cache, options = {}) {
  const today = todayISO()
  const semScope = options.semestre === 'S1' || options.semestre === 'S2' ? options.semestre : null
  const periodAttendance = options.periodAttendance === true
  // Opt-in strict : voir la note PII sur `followUpStudents` dans le retour.
  const includeFollowUpStudents = options.includeFollowUpStudents === true
  // Index élève → moyenne / récidive. Porte des `eleveId` (= codes Massar),
  // donc même règle : jamais dans le payload du hero, seulement les callables
  // de drill-down qui doivent segmenter une liste nominative.
  const includeStudentIndex = options.includeStudentIndex === true

  // ── normalisation (miroir du mapping onSnapshot client) ──
  const eleves = (cache.eleves || [])
    // Compatibilité : les documents antérieurs à la synchronisation annuelle
    // n'ont pas `active`; seul `active: false` signifie archivé.
    .filter((d) => d?.active !== false)
    .map((d) => ({
      id: d.id,
      classe: asString(d.classe),
      niveau: asString(d.niveau),
      codeMassar: asString(d.codeMassar),
    }))
  const activeEleveIds = new Set(
    eleves.flatMap((eleve) => [eleve.id, eleve.codeMassar].filter(Boolean)),
  )
  const belongsToActiveEleve = (row) => {
    const eleveId = asString(row?.eleveId) || asString(row?.studentId)
    const codeMassar = asString(row?.eleveCodeMassar) || asString(row?.codeMassar)
    if (!eleveId && !codeMassar) return true
    return activeEleveIds.has(eleveId) || activeEleveIds.has(codeMassar)
  }
  const eleveNiveauById = new Map(eleves.map((e) => [e.id, e.niveau]))
  const users = (cache.users || []).map((d) => ({ id: d.id, role: asString(d.role) || 'parent' }))
  const coefOf = makeCoefOf(cache.coefficients)
  const notes = (cache.notes || []).filter(belongsToActiveEleve).map((d) => {
    const eleveId = asString(d.eleveId)
    const matiere = asString(d.matiere)
    return {
      id: d.id,
      eleveId,
      classe: asString(d.classe),
      subject: asString(d.matiereLabel) || matiere || asString(d.subject),
      matiere,
      semestre: asString(d.semestre),
      note: normalizedNote20(d),
      coef: coefOf(matiere, eleveNiveauById.get(eleveId)),
    }
  })
  const absences = (cache.absences || []).filter(belongsToActiveEleve).map((d) => ({
    id: d.id, eleveId: asString(d.eleveId), classe: asString(d.classe),
    date: asString(d.date), statut: asString(d.statut),
  }))
  const devoirs = (cache.devoirs || []).map((d) => ({
    id: d.id, classeId: asString(d.classeId) || asString(d.classe), dateLimite: asString(d.dateLimite),
  }))
  const homeworkSubmissions = (cache.homeworkSubmissions || [])
    .filter(belongsToActiveEleve)
    .map((d) => ({
    id: d.id,
    homeworkId: asString(d.homeworkId),
    eleveId: asString(d.eleveId) || asString(d.studentId),
    eleveCodeMassar: asString(d.eleveCodeMassar) || asString(d.codeMassar),
    status: asString(d.status).toLowerCase(),
    }))

  const allValidNotes = notes.filter((r) => r.note != null && r.note >= 0 && r.note <= 20)
  const validNotes = allValidNotes.filter((r) => !semScope || r.semestre === semScope)
  const classStudents = new Map()
  const notesByEleve = new Map()
  const semesterNotesByEleve = new Map()
  const notesByClass = new Map()
  const notesBySubject = new Map()
  const todayAbsentEleves = new Set()
  const todayLateEleves = new Set()
  const absentTodayByClass = new Map()
  const attendanceByClass = new Map()
  const absentDatesByEleve = new Map()
  // A10 — dénominateur du critère d'absentéisme. Symétrique de
  // `absentDatesByEleve` : un Set de DATES, pas un compteur de lignes. Si
  // l'assiduité est relevée par cours, un élève a plusieurs lignes le même
  // jour ; les compter gonflerait le dénominateur et masquerait l'absentéisme.
  const observedDatesByEleve = new Map()
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
      rows.push({ v: note.note, c: note.coef })
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

  allValidNotes.forEach((note) => {
    if (!note.eleveId || (note.semestre !== 'S1' && note.semestre !== 'S2')) return
    const rows = semesterNotesByEleve.get(note.eleveId) || { S1: [], S2: [] }
    rows[note.semestre].push({ v: note.note, c: note.coef })
    semesterNotesByEleve.set(note.eleveId, rows)
  })

  const trendDays = lastDays(5)
  const trendByClass = new Map()

  absences.forEach((absence) => {
    if (absence.classe) {
      const attendance = attendanceByClass.get(absence.classe) || { total: 0, present: 0 }
      attendance.total++
      if (isPresent(absence.statut)) attendance.present++
      attendanceByClass.set(absence.classe, attendance)
    }

    // Journées d'assiduité observées, tous statuts confondus (présent, retard,
    // absent). Placé AVANT le filtre ci-dessous : une journée où l'élève était
    // présent compte au dénominateur, sinon le ratio vaudrait toujours 100 %.
    if (absence.eleveId && absence.date) {
      const observed = observedDatesByEleve.get(absence.eleveId) || new Set()
      observed.add(absence.date)
      observedDatesByEleve.set(absence.eleveId, observed)
    }

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

    if (isAbsent(absence.statut) && absence.eleveId && absence.date) {
      const dates = absentDatesByEleve.get(absence.eleveId) || new Set()
      dates.add(absence.date)
      absentDatesByEleve.set(absence.eleveId, dates)
    }

    if (absence.classe) {
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

  // Moyenne pondérée par élève (Σ note×coef / Σ coef sur toutes ses matières),
  // puis moyennée entre élèves — coefficients marocains (settings/coefficients).
  const studentAverages = [...notesByEleve.values()].map((pairs) => weightedAvg(pairs))
  const avgNote = studentAverages.length > 0
    ? round1(studentAverages.reduce((s, v) => s + v, 0) / studentAverages.length)
    : null
  const successRate = studentAverages.length > 0
    ? Math.round((studentAverages.filter((v) => v >= 10).length / studentAverages.length) * 100)
    : null

  const submissionsByHomework = new Map()
  homeworkSubmissions.forEach((row) => {
    if (!row.homeworkId) return
    const rows = submissionsByHomework.get(row.homeworkId) || []
    rows.push(row)
    submissionsByHomework.set(row.homeworkId, rows)
  })
  const homeworkAlertsByEleve = new Map()
  const addHomeworkAlert = (eleveId, kind) => {
    const current = homeworkAlertsByEleve.get(eleveId) || { notDone: 0, notSubmitted: 0 }
    current[kind]++
    homeworkAlertsByEleve.set(eleveId, current)
  }
  devoirs.forEach((devoir) => {
    if (!devoir.classeId || !devoir.dateLimite) return
    const rows = submissionsByHomework.get(devoir.id) || []
    if (rows.length === 0) return
    const classEleves = eleves.filter((eleve) => eleve.classe === devoir.classeId)
    classEleves.forEach((eleve) => {
      const matching = rows.filter((row) => submissionMatchesEleve(row, eleve))
      const status = matching.some((row) =>
        row.status === 'submitted' || row.status === 'submitted_late' || row.status === 'graded')
        ? 'submitted'
        : matching[0]?.status || ''
      const kind = homeworkAlertKind(status, devoir.dateLimite, today)
      if (kind) addHomeworkAlert(eleve.id, kind)
    })
  })

  // A3 — le suivi d'un élève est GLOBAL : il ne doit pas changer quand l'admin
  // filtre sur une matière. `followUpNotes` porte les notes de périmètre sans
  // filtre matière ; en son absence (recalcul planifié, qui ne filtre rien) on
  // retombe sur `notes`, strictement équivalent.
  const followUpCtx = buildFollowUpContext({
    fallbackNotesByEleve: notesByEleve,
    fallbackSemesterNotesByEleve: semesterNotesByEleve,
    followUpNotes: cache.followUpNotes,
    semScope,
    coefOf,
    eleveNiveauById,
    belongsToActiveEleve,
    absentDatesByEleve,
    observedDatesByEleve,
    homeworkAlertsByEleve,
  })

  const followUpStudents = []
  // « Récidivistes » = exactement les élèves porteurs du motif d'absentéisme.
  // Dérivé du même verdict que le compteur : la liste ne peut pas contenir un
  // élève que le prédicat n'aurait pas signalé.
  const recidivistIds = []
  eleves.forEach((eleve) => {
    const verdict = evaluateFollowUp(eleve, followUpCtx)
    if (!verdict) return
    followUpStudents.push({ eleveId: eleve.id, ...verdict })
    if (verdict.reasons.includes('absenteeism')) recidivistIds.push(eleve.id)
  })
  const studentsToFollow = followUpStudents.length

  const classStats = [...classStudents.entries()].map(([name, students]) => {
    const classNotes = notesByClass.get(name) || []
    const classNoteValues = classNotes.map((r) => r.note).filter((v) => v >= 0 && v <= 20)
    const classNotesByEleve = new Map()
    const subjects = new Set()

    classNotes.forEach((note) => {
      if (note.subject) subjects.add(note.subject)
      if (!note.eleveId || note.note == null) return
      const rows = classNotesByEleve.get(note.eleveId) || []
      rows.push({ v: note.note, c: note.coef })
      classNotesByEleve.set(note.eleveId, rows)
    })

    // Moyenne pondérée par élève, puis moyennée sur la classe (miroir école-entière ci-dessus).
    const averages = [...classNotesByEleve.values()].map((pairs) => weightedAvg(pairs))
    const attendance = attendanceByClass.get(name) || { total: 0, present: 0 }
    const absencesToday = absentTodayByClass.get(name)?.size || 0
    const presenceRate = periodAttendance
      ? (attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 100)
      : (students.length > 0 ? Math.round(((students.length - absencesToday) / students.length) * 100) : 100)
    const classAvg = averages.length > 0 ? round1(averages.reduce((s, v) => s + v, 0) / averages.length) : null
    const passingStudents = averages.filter((v) => v >= 10).length
    const classSuccess = averages.length > 0
      ? Math.round((passingStudents / averages.length) * 100)
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
      attendanceCount: periodAttendance ? attendance.total : students.length,
      avgNote: classAvg,
      successRate: classSuccess,
      absencesToday,
      incidentsMonth: incidentsMonthByClass.get(name) || 0,
      activeHomework: activeHomeworkByClass.get(name) || 0,
      subjectsCovered: subjects.size,
      notesCount: classNoteValues.length,
      gradedStudents: averages.length,
      passingStudents,
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
      below10Count: averages.filter((v) => v < 10).length,
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
    const totalGradedStudents = classes.reduce((s, c) => s + c.gradedStudents, 0)
    const totalPassingStudents = classes.reduce((s, c) => s + c.passingStudents, 0)
    const totalIncidents = classes.reduce((s, c) => s + c.incidentsMonth, 0)
    const attendanceWeight = classes.reduce((s, c) => s + c.attendanceCount, 0)
    const avgPresence = attendanceWeight > 0
      ? Math.round(classes.reduce((s, c) => s + c.presenceRate * c.attendanceCount, 0) / attendanceWeight)
      : 100
    return {
      name,
      classCount: classes.length,
      studentCount: totalStudents,
      // Pondéré par élèves notés (pas par nb de notes) : avgNote est déjà une moyenne par élève.
      avgNote: totalGradedStudents > 0 ? round1(classes.reduce((s, c) => s + ((c.avgNote || 0) * c.gradedStudents), 0) / totalGradedStudents) : null,
      successRate: totalGradedStudents > 0 ? Math.round((totalPassingStudents / totalGradedStudents) * 100) : null,
      presenceRate: avgPresence,
      incidentsMonth: totalIncidents,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const attendanceCount = periodAttendance ? absences.length : eleves.length
  const presentCount = absences.filter((row) => isPresent(row.statut)).length

  return {
    totalEleves: eleves.length,
    totalClasses: classStudents.size,
    totalTeachers: users.filter((u) => u.role === 'professeur').length,
    totalParents: users.filter((u) => u.role === 'parent').length,
    absentsToday: todayAbsentEleves.size,
    retardsToday: todayLateEleves.size,
    presenceRate: periodAttendance
      ? (attendanceCount > 0 ? Math.round((presentCount / attendanceCount) * 100) : 0)
      : (eleves.length > 0 ? Math.round(((eleves.length - todayAbsentEleves.size) / eleves.length) * 100) : 100),
    attendanceCount,
    avgNote,
    successRate,
    studentsToFollow,
    notesCount: validNotes.length,
    activeHomework: devoirs.filter((d) => isActiveHomework(d.dateLimite, today)).length,
    absenceTrend: days.map((day) => ({ label: day.label, value: trendSets.get(day.iso)?.size || 0 })),
    // A9/E6 — réparti sur les MOYENNES PAR ÉLÈVE, pas sur les documents de
    // notes. Avant : un élève à 13 notes pesait 13 fois ici et 1 fois dans
    // `avgNote`, donc la distribution ne pouvait pas être réconciliée avec les
    // deux KPI affichés à côté d'elle. Désormais la borne des bandes (≥10)
    // coïncide avec le seuil de `successRate`, ce qui rend structurels :
    //   Σ bandes = élèves notés ; bandes hautes = successRate × élèves / 100.
    gradeDistribution: gradeBands(studentAverages),
    gradedStudents: studentAverages.length,
    // PII — `followUpStudents` porte des `eleveId`, or l'ID d'un élève EST son
    // code Massar (DATA_MODEL : « Document ID = codeMassar »). Il ne sort JAMAIS
    // par défaut : le hero, qui alimente le téléphone, ne reçoit que le
    // compteur. Seule la callable de drill-down admin-only demande la liste.
    ...(includeFollowUpStudents ? { followUpStudents } : {}),
    ...(includeStudentIndex ? {
      studentAveragesById: [...notesByEleve.entries()].map(([eleveId, pairs]) => ({
        eleveId,
        average: round1(weightedAvg(pairs)),
      })),
      recidivistIds,
    } : {}),
    classStats,
    subjectStats,
    matrixClasses,
    matrixSubjects,
    classSubjectMatrix,
    niveauStats,
  }
}

module.exports = {
  computeSchoolStats,
  evaluateFollowUp,
  buildFollowUpContext,
  gradeBands,
  FOLLOW_UP_WEIGHTS,
  ABSENTEEISM_MIN_DAYS,
  ABSENTEEISM_MIN_OBSERVED,
  ABSENTEEISM_MIN_RATIO,
}
