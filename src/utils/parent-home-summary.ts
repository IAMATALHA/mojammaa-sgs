import { parentAlertToken } from './parent-alert-history'

export interface HomeHomework { id: string; dateLimite: string; revision?: string }

/** Only upcoming homework needs action here; reviewed/submitted work is done.
 * Historical missed work remains in the homework screen, not in a permanent alert.
 */
export function summarizeParentHomeActivity({ childId, today, monthKey, homework, submissions, absences }: {
  childId: string; today: string; monthKey: string; homework: HomeHomework[]
  submissions: { homeworkId: string; eleveId: string; status: string }[]
  absences: { id?: string; seance?: string; eleveId: string; date: string; statut: string; justified?: boolean }[]
}) {
  const completed = new Set(submissions.filter(s => s.eleveId === childId &&
    ['submitted', 'submitted_late', 'graded', 'excused'].includes(s.status)).map(s => s.homeworkId))
  const upcoming = homework.filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.dateLimite) && h.dateLimite >= today)
  const pending = upcoming.filter(h => !completed.has(h.id))
  const monthAbsences = absences.filter(a => a.eleveId === childId && a.date.startsWith(monthKey + '-') &&
    a.date <= today && a.statut === 'absent')
  return {
    pendingHomework: pending.length,
    dueToday: pending.filter(h => h.dateLimite === today).length,
    completedHomework: upcoming.length - pending.length,
    totalHomework: upcoming.length,
    absenceDays: new Set(monthAbsences.map(a => a.date)).size,
    unjustifiedDays: new Set(monthAbsences.filter(a => !a.justified).map(a => a.date)).size,
    // Compare records, not counts: a new absence/devoir can replace another
    // without changing the number displayed. Becoming due today is new urgency.
    homeworkAlerts: pending.map(h => parentAlertToken(['homework', h.id, h.dateLimite, h.revision, h.dateLimite === today])),
    absenceAlerts: monthAbsences.filter(a => !a.justified).map(a => parentAlertToken(['absence', a.id, a.date, a.seance])),
  }
}
