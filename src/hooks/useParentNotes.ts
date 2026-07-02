import { useEffect, useMemo, useState } from 'react'
import {
  subscribeNotesForEleve,
  getClassStats,
  type NoteDoc,
  type ClassStatsDoc,
  type CompetenceValue,
} from '../services/notesService'

export interface SubjectGradeReal {
  subject: string
  average: number
  classAvg: number
  trend: 'up' | 'down' | 'flat'
  controles: number[]   // notes des contrôles du semestre (détail dépliable)
}

export interface ChildReportReal {
  semestre: string
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

export function useParentNotes(eleveId: string | undefined, classe: string | undefined) {
  const [notes, setNotes] = useState<NoteDoc[]>([])
  const [classStats, setClassStats] = useState<ClassStatsDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eleveId) { setNotes([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    const unsub = subscribeNotesForEleve(
      eleveId,
      list => { setNotes(list); setError(null); setLoading(false) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [eleveId])

  const semestres = useMemo(() => {
    const set = new Set<string>()
    notes.forEach(n => { if (n.semestre) set.add(n.semestre) })
    return [...set].sort()
  }, [notes])

  const latestSemestre = semestres[semestres.length - 1] || ''
  const prevSemestre = semestres.length >= 2 ? semestres[semestres.length - 2] : ''

  // Moyenne/rang de classe : agrégat serveur ANONYME (classStats) — plus
  // jamais les notes brutes des autres élèves (confidentialité).
  useEffect(() => {
    if (!classe || !latestSemestre) { setClassStats(null); return }
    getClassStats(classe, latestSemestre).then(setClassStats).catch(() => setClassStats(null))
  }, [classe, latestSemestre])

  const report: ChildReportReal | null = useMemo(() => {
    if (!latestSemestre || notes.length === 0) return null

    const currentNotes = notes.filter(n => n.semestre === latestSemestre && typeof n.note === 'number')
    const prevNotes = prevSemestre ? notes.filter(n => n.semestre === prevSemestre && typeof n.note === 'number') : []
    if (currentNotes.length === 0) return null

    const bySubject = new Map<string, number[]>()
    const ctrlBySubject = new Map<string, number[]>()
    currentNotes.forEach(n => {
      const list = bySubject.get(n.matiere) || []
      list.push(n.note as number)
      bySubject.set(n.matiere, list)
      if (Array.isArray(n.controles) && n.controles.length > 0) {
        // ControlNote peut être un nombre brut ou un objet { note, … }
        const vals = n.controles
          .map(c => (typeof c === 'number' ? c : (c as { note?: number }).note))
          .filter((v): v is number => typeof v === 'number')
        ctrlBySubject.set(n.matiere, [...(ctrlBySubject.get(n.matiere) || []), ...vals])
      }
    })

    const prevBySubject = new Map<string, number[]>()
    prevNotes.forEach(n => {
      const list = prevBySubject.get(n.matiere) || []
      list.push(n.note as number)
      prevBySubject.set(n.matiere, list)
    })

    // Agrégat serveur (mêmes formules round1 que l'ancien calcul local —
    // voir functions/classStats.js).
    const classAvgBySubject = new Map<string, number>(
      classStats ? Object.entries(classStats.subjectAvgs) : [],
    )
    const classStudentAvgs: number[] = classStats ? classStats.studentAvgs : []

    const subjects: SubjectGradeReal[] = [...bySubject.entries()].map(([subj, vals]) => {
      const avg = round1(vals.reduce((s, v) => s + v, 0) / vals.length)
      const classAvg = classAvgBySubject.get(subj) ?? avg
      const prevVals = prevBySubject.get(subj)
      let trend: 'up' | 'down' | 'flat' = 'flat'
      if (prevVals && prevVals.length > 0) {
        const prevAvg = prevVals.reduce((s, v) => s + v, 0) / prevVals.length
        if (avg - prevAvg > 0.5) trend = 'up'
        else if (prevAvg - avg > 0.5) trend = 'down'
      }
      return { subject: subj, average: avg, classAvg, trend, controles: ctrlBySubject.get(subj) || [] }
    }).sort((a, b) => a.subject.localeCompare(b.subject, 'fr'))

    const generalAvg = round1(subjects.reduce((s, sub) => s + sub.average, 0) / subjects.length)

    let rank = '—'
    if (classStudentAvgs.length > 0) {
      const sorted = [...classStudentAvgs].sort((a, b) => b - a)
      const pos = sorted.findIndex(v => v <= generalAvg) + 1
      rank = `${pos || sorted.length} / ${sorted.length}`
    }

    // Barème : primaire (…AEP) noté /10, le reste /20. Déduit de la classe.
    const bareme: 10 | 20 = classStats?.bareme || (/aep/i.test(classe || '') ? 10 : 20)

    return {
      semestre: latestSemestre,
      generalAvg,
      rank,
      honor: computeHonor(generalAvg, bareme),
      subjects,
      bareme,
    }
  }, [notes, classStats, latestSemestre, prevSemestre, classe])

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
