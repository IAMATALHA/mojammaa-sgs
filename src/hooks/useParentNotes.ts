import { useEffect, useMemo, useState } from 'react'
import { subscribeNotesForEleve, getClassStats, type NoteDoc, type ClassStatsDoc } from '../services/notesService'

export interface SubjectGradeReal {
  subject: string
  average: number
  classAvg: number
  trend: 'up' | 'down' | 'flat'
}

export interface ChildReportReal {
  semestre: string
  generalAvg: number
  rank: string
  honor: 'felicitations' | 'encouragements' | 'avertissement' | null
  subjects: SubjectGradeReal[]
}

function round1(v: number): number { return Math.round(v * 10) / 10 }

function computeHonor(avg: number): ChildReportReal['honor'] {
  if (avg >= 16) return 'felicitations'
  if (avg >= 14) return 'encouragements'
  if (avg < 10) return 'avertissement'
  return null
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

    const currentNotes = notes.filter(n => n.semestre === latestSemestre)
    const prevNotes = prevSemestre ? notes.filter(n => n.semestre === prevSemestre) : []
    if (currentNotes.length === 0) return null

    const bySubject = new Map<string, number[]>()
    currentNotes.forEach(n => {
      const list = bySubject.get(n.matiere) || []
      list.push(n.note)
      bySubject.set(n.matiere, list)
    })

    const prevBySubject = new Map<string, number[]>()
    prevNotes.forEach(n => {
      const list = prevBySubject.get(n.matiere) || []
      list.push(n.note)
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
      return { subject: subj, average: avg, classAvg, trend }
    }).sort((a, b) => a.subject.localeCompare(b.subject, 'fr'))

    const generalAvg = round1(subjects.reduce((s, sub) => s + sub.average, 0) / subjects.length)

    let rank = '—'
    if (classStudentAvgs.length > 0) {
      const sorted = [...classStudentAvgs].sort((a, b) => b - a)
      const pos = sorted.findIndex(v => v <= generalAvg) + 1
      rank = `${pos || sorted.length} / ${sorted.length}`
    }

    return {
      semestre: latestSemestre,
      generalAvg,
      rank,
      honor: computeHonor(generalAvg),
      subjects,
    }
  }, [notes, classStats, latestSemestre, prevSemestre])

  return { loading, error, notes, semestres, report }
}
