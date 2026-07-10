import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import {
  subscribeAbsencesForEleves, computeChildPresenceRate,
  type AbsenceDoc,
} from '../services/absencesService'
import { subscribeNotesForEleve, type NoteDoc } from '../services/notesService'
import { toDoc } from '../services/firestore'
import { db } from '../config/firebase'
import type { Child } from '../utils/dashboardTypes'
import { currentAcademicPeriod } from '../utils/academicPeriod'

export interface ParentData {
  loading:  boolean
  error:    string | null
  eleves:   EleveDoc[]
  children: Child[]
}

const AVATAR_COLORS = ['#E63946', '#1D3557', '#F77F00', '#457B9D', '#FCBF49']

function hashOf(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function round1(v: number): number { return Math.round(v * 10) / 10 }

function noteBareme(note: NoteDoc, classe?: string): 10 | 20 {
  if (note.bareme === 10 || note.bareme === 20) return note.bareme
  if (note.cycle === 'primaire') return 10
  return /aep/i.test(note.classe || classe || '') ? 10 : 20
}

function noteOn20(note: NoteDoc, classe?: string): number | null {
  if (typeof note.note !== 'number') return null
  const bareme = noteBareme(note, classe)
  if (note.note < 0 || note.note > bareme) return null
  return note.note * (20 / bareme)
}

export function useParentData(): ParentData {
  const period = currentAcademicPeriod()
  const { profile } = useAuth()
  const [eleves, setEleves] = useState<EleveDoc[]>([])
  const [absences, setAbsences] = useState<AbsenceDoc[]>([])
  const [notesByEleve, setNotesByEleve] = useState<Map<string, NoteDoc[]>>(new Map())
  const [devoirCounts, setDevoirCounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setEleves([]); setLoading(false); return }
    setLoading(true)
    const unsub = subscribeChildrenOfParent(
      profile.uid,
      list => { setEleves(list); setLoading(false); setError(null) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [profile?.uid])

  useEffect(() => {
    const ids = eleves.map(e => e.codeMassar)
    if (ids.length === 0) { setAbsences([]); return }
    const unsub = subscribeAbsencesForEleves(ids, period, setAbsences)
    return unsub
  }, [eleves.map(e => e.codeMassar).join('|'), period.academicYear, period.monthKey])

  useEffect(() => {
    if (eleves.length === 0) { setNotesByEleve(new Map()); return }
    const unsubs: Unsubscribe[] = []
    const map = new Map<string, NoteDoc[]>()
    eleves.forEach(e => {
      unsubs.push(subscribeNotesForEleve(e.codeMassar, {
        academicYear: period.academicYear,
        semestre: period.semestre,
      }, list => {
        map.set(e.codeMassar, list)
        setNotesByEleve(new Map(map))
      }))
    })
    return () => unsubs.forEach(u => u())
  }, [eleves.map(e => e.codeMassar).join('|'), period.academicYear, period.semestre])

  useEffect(() => {
    const classes = [...new Set(eleves.map(e => e.classe).filter(Boolean))]
    if (classes.length === 0) { setDevoirCounts(new Map()); return }
    const today = new Date().toISOString().split('T')[0]
    const unsubs: Unsubscribe[] = []
    const counts = new Map<string, number>()

    for (let i = 0; i < classes.length; i += 10) {
      const chunk = classes.slice(i, i + 10)
      unsubs.push(onSnapshot(
        query(
          collection(db, 'devoirs'),
          where('classeId', 'in', chunk),
          where('academicYear', '==', period.academicYear),
          where('monthKey', '==', period.monthKey),
        ),
        snap => {
          chunk.forEach(c => counts.set(c, 0))
          snap.docs.forEach(d => {
            const data = toDoc<{ dateLimite?: string; classeId: string }>(d)
            const dl = data.dateLimite
            if (typeof dl === 'string' && dl >= today) {
              const cls = data.classeId
              counts.set(cls, (counts.get(cls) || 0) + 1)
            }
          })
          setDevoirCounts(new Map(counts))
        },
        () => {},
      ))
    }
    return () => unsubs.forEach(u => u())
  }, [eleves.map(e => e.classe).join('|'), period.academicYear, period.monthKey])

  const children = useMemo(
    () => eleves.map(e => {
      const childNotes = notesByEleve.get(e.codeMassar) || []
      const notesOn20 = childNotes
        .map(note => noteOn20(note, e.classe))
        .filter((note): note is number => note != null)
      const avgGrade = notesOn20.length > 0
        ? round1(notesOn20.reduce((s, n) => s + n, 0) / notesOn20.length)
        : 0
      return {
        id: e.codeMassar,
        firstName: e.prenomLatin || e.prenom || '',
        lastName: e.nomLatin || e.nom || '',
        classe: e.classe || '',
        level: e.niveau || 'Collège',
        avatarColor: AVATAR_COLORS[hashOf(e.codeMassar) % AVATAR_COLORS.length],
        attendance: computeChildPresenceRate(absences, e.codeMassar),
        averageGrade: avgGrade,
        pendingHomework: devoirCounts.get(e.classe) || 0,
      }
    }),
    [eleves, absences, notesByEleve, devoirCounts],
  )

  return { loading, error, eleves, children }
}
