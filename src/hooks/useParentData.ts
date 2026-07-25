import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, type Unsubscribe } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import {
  subscribeAbsencesForEleves, computeChildPresenceRate,
  type AbsenceDoc,
} from '../services/absencesService'
import { subscribeNotesForEleve, type NoteDoc } from '../services/notesService'
import { subscribeChunked } from '../services/chunkedQuery'
import { db } from '../config/firebase'
import type { Child } from '../utils/dashboardTypes'
import { currentAcademicPeriod, localISODate } from '../utils/academicPeriod'
import { displayBareme, noteOn20, toDisplayScale } from '../utils/gradeScale'
import { palette } from '../theme/designTokens'
import {
  homeworkSubmissionId,
  subscribeParentHomeworkSubmissions,
  type HomeworkSubmissionStatus,
} from '../services/homeworkSubmissionsService'

export interface ParentData {
  loading:  boolean
  error:    string | null
  eleves:   EleveDoc[]
  children: Child[]
}

const AVATAR_COLORS = [
  palette.brandRed,
  palette.brandGoldDark,
  palette.brandOrangeDark,
  palette.success,
  palette.brandInk,
]

function hashOf(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export function useParentData(): ParentData {
  const period = currentAcademicPeriod()
  const { profile } = useAuth()
  const [eleves, setEleves] = useState<EleveDoc[]>([])
  const [absences, setAbsences] = useState<AbsenceDoc[]>([])
  const [notesByEleve, setNotesByEleve] = useState<Map<string, NoteDoc[]>>(new Map())
  const [devoirsByClasse, setDevoirsByClasse] = useState<Map<string, string[]>>(new Map())
  const [submissionStatus, setSubmissionStatus] = useState<Map<string, HomeworkSubmissionStatus>>(new Map())
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
    // Fenêtre au MOIS : la carte enfant n'affiche qu'un taux récent, et les
    // présences écrites à chaque séance rendraient l'année entière hors de prix.
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
    if (classes.length === 0) { setDevoirsByClasse(new Map()); return }
    const today = localISODate()
    const devoirIds = new Map<string, string[]>()

    return subscribeChunked<{ dateLimite?: string; classeId: string }>(
      classes,
      chunk => query(
        collection(db, 'devoirs'),
        where('classeId', 'in', chunk),
        where('academicYear', '==', period.academicYear),
      ),
      rows => {
        classes.forEach(c => devoirIds.set(c, []))
        rows.forEach(data => {
          const dl = data.dateLimite
          if (typeof dl === 'string' && dl >= today) {
            devoirIds.set(data.classeId, [...(devoirIds.get(data.classeId) || []), data.id])
          }
        })
        setDevoirsByClasse(new Map(devoirIds))
      },
      () => {},
    )
  }, [eleves.map(e => e.classe).join('|'), period.academicYear])

  useEffect(() => {
    if (!profile?.uid) { setSubmissionStatus(new Map()); return }
    return subscribeParentHomeworkSubmissions(
      profile.uid,
      eleves.map(eleve => eleve.codeMassar || eleve.id || ''),
      rows => setSubmissionStatus(new Map(rows.map(row => [row.id, row.status]))),
      () => {},
    )
  }, [profile?.uid, eleves.map(eleve => eleve.codeMassar || eleve.id || '').join('|')])

  const children = useMemo(
    () => eleves.map(e => {
      const childNotes = notesByEleve.get(e.codeMassar) || []
      const notesOn20 = childNotes
        .map(note => noteOn20(note.note, note, e.classe))
        .filter((note): note is number => note != null)
      // La carte affiche la moyenne dans le barème de l'élève (primaire /10),
      // comme son bulletin : c'est le même enfant sur deux écrans, il ne peut
      // pas y lire deux chiffres différents. L'agrégation reste sur 20 — une
      // matière peut mélanger des saisies /10 et /20.
      const bareme = displayBareme({
        cycle: childNotes.find(note => note.cycle)?.cycle,
        classe: e.classe,
        niveau: e.niveau,
      })
      const avgGrade = notesOn20.length > 0
        ? toDisplayScale(notesOn20.reduce((s, n) => s + n, 0) / notesOn20.length, bareme) ?? 0
        : 0
      return {
        bareme,
        id: e.codeMassar,
        firstName: e.prenomLatin || e.prenom || '',
        lastName: e.nomLatin || e.nom || '',
        classe: e.classe || '',
        level: e.niveau || 'Collège',
        avatarColor: AVATAR_COLORS[hashOf(e.codeMassar) % AVATAR_COLORS.length],
        attendance: computeChildPresenceRate(absences, e.codeMassar),
        averageGrade: avgGrade,
        pendingHomework: (devoirsByClasse.get(e.classe) || []).filter(homeworkId => {
          const status = submissionStatus.get(homeworkSubmissionId(homeworkId, e.codeMassar))
          return status !== 'submitted'
            && status !== 'submitted_late'
            && status !== 'graded'
            && status !== 'excused'
        }).length,
      }
    }),
    [eleves, absences, notesByEleve, devoirsByClasse, submissionStatus],
  )

  return { loading, error, eleves, children }
}
