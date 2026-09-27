import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { subscribeAbsencesForEleves, type AbsenceDoc } from '../services/absencesService'
import { subscribeParentHomeworkSubmissions, type HomeworkSubmission } from '../services/homeworkSubmissionsService'
import { currentAcademicPeriod } from '../utils/academicPeriod'
import { summarizeParentHomeActivity, type HomeHomework } from '../utils/parent-home-summary'

// Responses belong to a parent, child and period. Never reuse another child's
// metrics while subscriptions catch up, including after sign-out or unlinking.
export function useParentHomeActivity(uid: string, childId: string, classe: string, today: string) {
  const period = currentAcademicPeriod()
  const key = JSON.stringify([uid, childId, classe, period.academicYear, period.monthKey])
  const [attempt, setAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<{
    key: string; absences?: AbsenceDoc[]; homework?: HomeHomework[]; submissions?: HomeworkSubmission[]
    attendanceError?: boolean; homeworkError?: boolean
  } | null>(null)

  useEffect(() => {
    if (!uid || !childId) return
    let active = true
    setSnapshot({ key })
    const update = (patch: Partial<NonNullable<typeof snapshot>>) => {
      if (active) setSnapshot(previous => ({ ...(previous?.key === key ? previous : { key }), ...patch }))
    }
    const unsubs = [subscribeAbsencesForEleves([childId], period,
      absences => update({ absences, attendanceError: false }),
      () => update({ attendanceError: true }),
    )]
    if (classe) {
      unsubs.push(onSnapshot(query(collection(db, 'devoirs'), where('classeId', '==', classe)),
        result => update({ homework: result.docs.filter(doc => !doc.get('cancelledAt')).map(doc => {
          const data = doc.data()
          return {
            id: doc.id, dateLimite: typeof data.dateLimite === 'string' ? data.dateLimite : '',
            revision: JSON.stringify([data.titre, data.description, data.updatedAt, data.attachments]),
          }
        }) }),
        () => update({ homeworkError: true }),
      ))
      unsubs.push(subscribeParentHomeworkSubmissions(uid, [childId],
        submissions => update({ submissions }), () => update({ homeworkError: true }),
      ))
    } else update({ homeworkError: true })
    return () => { active = false; unsubs.forEach(unsubscribe => unsubscribe()) }
  }, [key, attempt])

  const data = snapshot?.key === key ? snapshot : null
  const homeworkReady = !!data?.homework && !!data?.submissions && !data.homeworkError
  const attendanceReady = !!data?.absences && !data.attendanceError
  const summary = summarizeParentHomeActivity({
    childId, today, monthKey: period.monthKey,
    homework: homeworkReady ? data.homework! : [],
    submissions: homeworkReady ? data.submissions! : [],
    absences: attendanceReady ? data.absences! : [],
  })
  return {
    ...summary, homeworkReady, attendanceReady,
    homeworkError: !!data?.homeworkError, attendanceError: !!data?.attendanceError,
    retry: () => setAttempt(value => value + 1),
  }
}
