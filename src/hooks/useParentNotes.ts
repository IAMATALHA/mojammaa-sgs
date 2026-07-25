import { useEffect, useMemo, useState } from 'react'
import {
  subscribeNotesForEleve,
  getClassStats,
  type NoteDoc,
  type ClassStatsDoc,
  type CompetenceValue,
} from '../services/notesService'
import { getCoefficients, makeCoefOf, type CoefOf } from '../services/coefficientsService'
import { currentAcademicPeriod } from '../utils/academicPeriod'
import { noteOn20, resolveBareme, weightedAverage } from '../utils/gradeScale'

export type ParentNotesScope = 'semester' | 'academicYear'

export interface SubjectGradeReal {
  subject: string
  average: number
  classAvg: number
  trend: 'up' | 'down' | 'flat'
  controles: number[]   // notes des contrôles du semestre (détail dépliable)
}

export interface ChildReportReal {
  semestre: string
  hasClassComparison: boolean
  generalAvg: number
  rank: string
  honor: 'felicitations' | 'encouragements' | 'avertissement' | null
  subjects: SubjectGradeReal[]
  bareme: 10 | 20   // système marocain : primaire /10, collège /20
}

export interface SubjectCompetenceReal {
  subject: string
  s1: CompetenceValue | null
  s2: CompetenceValue | null
  trend: 'up' | 'down' | 'flat' | 'new'
}

export interface ChildCompetenceReportReal {
  title: string
  subjects: SubjectCompetenceReal[]
  summary: {
    acquis: number
    encours: number
    nonAcquis: number
  }
}

function round1(v: number): number { return Math.round(v * 10) / 10 }

function computeHonor(avg: number, bareme: number): ChildReportReal['honor'] {
  const v = avg * (20 / bareme)   // seuils calibrés /20
  if (v >= 16) return 'felicitations'
  if (v >= 14) return 'encouragements'
  if (v < 10) return 'avertissement'
  return null
}

function isPrescolaireClasse(classe: string | undefined): boolean {
  return /(^|[^a-z])(ps|gs)([^a-z]|$)/i.test(classe || '')
}

function competenceRank(value: CompetenceValue | null): number | null {
  if (value === 'Acquis') return 3
  if (value === 'En cours') return 2
  if (value === 'Non acquis') return 1
  return null
}

function competenceTrend(s1: CompetenceValue | null, s2: CompetenceValue | null): SubjectCompetenceReal['trend'] {
  if (!s1 && s2) return 'new'
  const a = competenceRank(s1)
  const b = competenceRank(s2)
  if (a == null || b == null || a === b) return 'flat'
  return b > a ? 'up' : 'down'
}

export function useParentNotes(
  eleveId: string | undefined,
  classe: string | undefined,
  scope: ParentNotesScope = 'semester',
  niveau?: string,
) {
  const period = currentAcademicPeriod()
  const [notes, setNotes] = useState<NoteDoc[]>([])
  const [classStats, setClassStats] = useState<ClassStatsDoc | null>(null)
  const [coefOf, setCoefOf] = useState<CoefOf | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Coefficients ministériels — mêmes valeurs que l'administration.
  // `setState(fn)` interpréterait une fonction comme un updater : on l'emballe.
  useEffect(() => {
    let cancelled = false
    getCoefficients().then(doc => {
      if (!cancelled) setCoefOf(() => makeCoefOf(doc))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!eleveId) { setNotes([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    const unsub = subscribeNotesForEleve(
      eleveId,
      {
        academicYear: period.academicYear,
        ...(scope === 'semester' ? { semestre: period.semestre } : {}),
      },
      list => { setNotes(list); setError(null); setLoading(false) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [eleveId, period.academicYear, period.semestre, scope])

  const semestres = useMemo(() => {
    const set = new Set<string>()
    notes.forEach(n => { if (n.semestre) set.add(n.semestre) })
    return [...set].sort()
  }, [notes])

  const latestSemestre = scope === 'semester'
    ? period.semestre
    : semestres[semestres.length - 1] || ''
  const prevSemestre = ''

  // Moyenne/rang de classe : agrégat serveur ANONYME (classStats) — plus
  // jamais les notes brutes des autres élèves (confidentialité).
  useEffect(() => {
    if (scope !== 'semester' || !classe || !latestSemestre) { setClassStats(null); return }
    getClassStats(classe, period.academicYear, latestSemestre).then(setClassStats).catch(() => setClassStats(null))
  }, [classe, latestSemestre, period.academicYear, scope])

  const report: ChildReportReal | null = useMemo(() => {
    if (!latestSemestre || notes.length === 0) return null

    const currentNotes = notes.filter(n =>
      (scope === 'academicYear' || n.semestre === latestSemestre) && typeof n.note === 'number'
    )
    const prevNotes = prevSemestre ? notes.filter(n => n.semestre === prevSemestre && typeof n.note === 'number') : []
    if (currentNotes.length === 0) return null

    // Barème d'AFFICHAGE (primaire /10, collège /20). Les agrégats de classe
    // sont déjà exprimés dans `classStats.bareme` : on s'y aligne pour que la
    // comparaison élève ↔ classe porte sur la même échelle.
    const bareme: 10 | 20 = classStats?.bareme
      || resolveBareme(currentNotes[0], classe)
    const toDisplay = (on20: number) => on20 * (bareme / 20)

    // Les notes sont agrégées SUR 20 quel que soit leur barème d'origine : une
    // matière peut mélanger des saisies /10 et /20, et les moyenner brutes
    // donnait un résultat sans signification.
    const bySubject = new Map<string, number[]>()
    const ctrlBySubject = new Map<string, number[]>()
    currentNotes.forEach(n => {
      const value = noteOn20(n.note, n, classe)
      if (value == null) return
      bySubject.set(n.matiere, [...(bySubject.get(n.matiere) || []), value])
      if (Array.isArray(n.controles) && n.controles.length > 0) {
        // ControlNote peut être un nombre brut ou un objet { note, … }
        const vals = n.controles
          .map(c => (typeof c === 'number' ? c : (c as { note?: number }).note))
          .filter((v): v is number => typeof v === 'number')
        ctrlBySubject.set(n.matiere, [...(ctrlBySubject.get(n.matiere) || []), ...vals])
      }
    })
    if (bySubject.size === 0) return null

    const prevBySubject = new Map<string, number[]>()
    prevNotes.forEach(n => {
      const value = noteOn20(n.note, n, classe)
      if (value == null) return
      prevBySubject.set(n.matiere, [...(prevBySubject.get(n.matiere) || []), value])
    })

    // Agrégat serveur (mêmes formules round1 que l'ancien calcul local —
    // voir functions/classStats.js).
    const classAvgBySubject = new Map<string, number>(
      classStats ? Object.entries(classStats.subjectAvgs) : [],
    )
    const classStudentAvgs: number[] = classStats ? classStats.studentAvgs : []

    // Moyennes par matière, sur 20, avant conversion pour l'affichage.
    const avgOn20BySubject = new Map<string, number>()
    const subjects: SubjectGradeReal[] = [...bySubject.entries()].map(([subj, vals]) => {
      const avgOn20 = vals.reduce((s, v) => s + v, 0) / vals.length
      avgOn20BySubject.set(subj, avgOn20)
      const avg = round1(toDisplay(avgOn20))
      const classAvg = classAvgBySubject.get(subj) ?? avg
      const prevVals = prevBySubject.get(subj)
      let trend: 'up' | 'down' | 'flat' = 'flat'
      if (prevVals && prevVals.length > 0) {
        const prevAvg = toDisplay(prevVals.reduce((s, v) => s + v, 0) / prevVals.length)
        if (avg - prevAvg > 0.5) trend = 'up'
        else if (prevAvg - avg > 0.5) trend = 'down'
      }
      return { subject: subj, average: avg, classAvg, trend, controles: ctrlBySubject.get(subj) || [] }
    }).sort((a, b) => a.subject.localeCompare(b.subject, 'fr'))

    // Moyenne générale PONDÉRÉE par les coefficients ministériels, comme le
    // fait l'administration (functions/schoolStats.js). La moyenne simple qui
    // était calculée ici donnait un chiffre différent de celui de la direction
    // pour le même élève. Tant que les coefficients ne sont pas chargés, le
    // repli à 1 partout reproduit exactement l'ancien résultat.
    const weighted = weightedAverage(
      [...avgOn20BySubject.entries()].map(([subj, value]) => ({
        value,
        coef: coefOf ? coefOf(subj, niveau) : 1,
      })),
    )
    const generalAvgOn20 = weighted ?? 0
    const generalAvg = round1(toDisplay(generalAvgOn20))

    // Le rang se compare à `classStats.studentAvgs`, que le serveur calcule
    // SANS pondération : on le confronte donc à la moyenne simple de l'élève,
    // pas à sa moyenne pondérée — sinon on classerait deux grandeurs
    // différentes.
    let rank = '—'
    if (classStudentAvgs.length > 0) {
      const simpleOn20 = [...avgOn20BySubject.values()]
        .reduce((s, v) => s + v, 0) / avgOn20BySubject.size
      const simpleAvg = round1(toDisplay(simpleOn20))
      const sorted = [...classStudentAvgs].sort((a, b) => b - a)
      const pos = sorted.findIndex(v => v <= simpleAvg) + 1
      rank = `${pos || sorted.length} / ${sorted.length}`
    }

    return {
      semestre: scope === 'academicYear' ? `Année ${period.academicYear}` : latestSemestre,
      hasClassComparison: scope === 'semester' && classStats != null,
      generalAvg,
      rank,
      honor: computeHonor(generalAvgOn20, 20),
      subjects,
      bareme,
    }
  }, [notes, classStats, coefOf, niveau, latestSemestre, prevSemestre, classe, period.academicYear, scope])

  const competenceReport: ChildCompetenceReportReal | null = useMemo(() => {
    const competenceNotes = notes.filter(n => n.competence)
    if (competenceNotes.length === 0) return null
    if (!isPrescolaireClasse(classe) && notes.some(n => typeof n.note === 'number')) return null

    const bySubject = new Map<string, { subject: string; s1: CompetenceValue | null; s2: CompetenceValue | null }>()
    competenceNotes.forEach(n => {
      const competence = n.competence
      if (!competence) return
      const key = n.matiere || n.matiereLabel
      if (!key) return
      if (!bySubject.has(key)) bySubject.set(key, { subject: n.matiereLabel || key, s1: null, s2: null })
      const row = bySubject.get(key)!
      if (n.semestre === 'S1') row.s1 = competence
      if (n.semestre === 'S2') row.s2 = competence
    })

    const subjects = [...bySubject.values()]
      .map(row => ({
        ...row,
        trend: competenceTrend(row.s1, row.s2),
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'fr'))

    if (subjects.length === 0) return null

    const currentValues = subjects
      .map(item => item.s2 || item.s1)
      .filter((item): item is CompetenceValue => item != null)

    return {
      title: 'Compétences — S1 / S2',
      subjects,
      summary: {
        acquis: currentValues.filter(value => value === 'Acquis').length,
        encours: currentValues.filter(value => value === 'En cours').length,
        nonAcquis: currentValues.filter(value => value === 'Non acquis').length,
      },
    }
  }, [notes, classe])

  return { loading, error, notes, semestres, report, competenceReport }
}
