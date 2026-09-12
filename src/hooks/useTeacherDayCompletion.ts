/**
 * useTeacherDayCompletion — pour les séances du JOUR du prof, calcule :
 *   - appel fait ?   → chaque élève actif de la classe possède un statut
 *                      valide dans `absences` pour cette date et séance.
 *   - devoir posté ? → un doc `devoirs` du prof pour cette classe créé
 *                      aujourd'hui
 *
 * Pas de temps réel : recalculé au focus de l'écran (retour d'un appel
 * par ex.) — un listener par séance serait du gaspillage Firestore.
 */

import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDoc } from '../services/firestore'
import type { WeeklySlot } from '../services/scheduleService'
import type { AbsenceDoc } from '../services/absencesService'
import { currentAndNextAcademicYears, localISODate } from '../utils/academicPeriod'

export interface DayCompletion {
  /** clés `${classe}|${seance}` dont l'appel est enregistré aujourd'hui */
  attendanceDone: Set<string>
  /** classes pour lesquelles un devoir a été créé aujourd'hui */
  homeworkPosted: Set<string>
}

function todayISO(): string {
  return localISODate()
}

export function useTeacherDayCompletion(
  todaySlots: WeeklySlot[],
  teacherUid: string | undefined,
): DayCompletion {
  const homeworkYears = currentAndNextAcademicYears()
  const homeworkYearsKey = homeworkYears.join('|')
  const [attendanceDone, setAttendanceDone] = useState<Set<string>>(new Set())
  const [homeworkPosted, setHomeworkPosted] = useState<Set<string>>(new Set())

  const classes = [...new Set(todaySlots.map(s => s.classe).filter(Boolean))]
  const classesKey = classes.sort().join('|')

  const load = useCallback(async () => {
    if (!teacherUid || classes.length === 0) {
      setAttendanceDone(new Set())
      setHomeworkPosted(new Set())
      return
    }
    const date = todayISO()
    try {
      // Appels du jour (chunks de 10 pour la limite `in`)
      const attendance = new Set<string>()
      for (let i = 0; i < classes.length; i += 10) {
        const chunk = classes.slice(i, i + 10)
        const [snap, roster] = await Promise.all([getDocs(query(
          collection(db, 'absences'),
          where('classe', 'in', chunk),
          where('date', '==', date),
        )), getDocs(query(collection(db, 'eleves'), where('classe', 'in', chunk)))])
        const marked = new Map<string, Set<string>>()
        snap.forEach(d => {
          const data = toDoc<AbsenceDoc>(d)
          if (!data.classe || !data.seance || !['present', 'absent', 'retard'].includes(data.statut)) return
          const key = `${data.classe}|${data.seance}`
          const ids = marked.get(key) || new Set<string>()
          ids.add(data.eleveId); marked.set(key, ids)
        })
        marked.forEach((ids, key) => {
          const classe = key.split('|')[0]
          const expected = roster.docs.filter(d => d.get('active') !== false && d.get('classe') === classe)
          if (expected.length && expected.every(d => ids.has(d.id))) attendance.add(key)
        })
      }
      setAttendanceDone(attendance)

      // Devoirs créés aujourd'hui par CE prof
      const devoirsSnap = await getDocs(query(
        collection(db, 'devoirs'),
        where('teacherId', '==', teacherUid),
        where('academicYear', 'in', homeworkYears),
      ))
      const posted = new Set<string>()
      devoirsSnap.forEach(d => {
        const data = toDoc<{ createdAt?: { toDate?: () => Date }; classeId?: string }>(d)
        const created = data.createdAt?.toDate?.()
        if (!created || !data.classeId) return
        if (localISODate(created) === date) posted.add(data.classeId)
      })
      setHomeworkPosted(posted)
    } catch {
      // Best-effort : des chips absentes ne doivent pas casser l'EDT.
    }
  }, [teacherUid, classesKey, homeworkYearsKey])

  // Au focus : le prof revient de l'appel / de la création d'un devoir.
  useFocusEffect(useCallback(() => { load() }, [load]))

  return { attendanceDone, homeworkPosted }
}
