/**
 * useTeacherDayCompletion — pour les séances du JOUR du prof, calcule :
 *   - appel fait ?   → il existe des docs `absences` (classe, date, seance)
 *                      (l'appel écrit un doc par élève, présents inclus —
 *                      l'existence suffit)
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

export interface DayCompletion {
  /** clés `${classe}|${seance}` dont l'appel est enregistré aujourd'hui */
  attendanceDone: Set<string>
  /** classes pour lesquelles un devoir a été créé aujourd'hui */
  homeworkPosted: Set<string>
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function useTeacherDayCompletion(
  todaySlots: WeeklySlot[],
  teacherUid: string | undefined,
): DayCompletion {
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
        const snap = await getDocs(query(
          collection(db, 'absences'),
          where('classe', 'in', classes.slice(i, i + 10)),
          where('date', '==', date),
        ))
        snap.forEach(d => {
          const data = toDoc<AbsenceDoc>(d)
          if (data.classe && data.seance) attendance.add(`${data.classe}|${data.seance}`)
        })
      }
      setAttendanceDone(attendance)

      // Devoirs créés aujourd'hui par CE prof
      const devoirsSnap = await getDocs(query(
        collection(db, 'devoirs'),
        where('teacherId', '==', teacherUid),
      ))
      const posted = new Set<string>()
      devoirsSnap.forEach(d => {
        const data = toDoc<{ createdAt?: { toDate?: () => Date }; classeId?: string }>(d)
        const created = data.createdAt?.toDate?.()
        if (!created || !data.classeId) return
        if (created.toISOString().split('T')[0] === date) posted.add(data.classeId)
      })
      setHomeworkPosted(posted)
    } catch {
      // Best-effort : des chips absentes ne doivent pas casser l'EDT.
    }
  }, [teacherUid, classesKey])

  // Au focus : le prof revient de l'appel / de la création d'un devoir.
  useFocusEffect(useCallback(() => { load() }, [load]))

  return { attendanceDone, homeworkPosted }
}
