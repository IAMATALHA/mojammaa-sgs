import type { RollCallSession } from './rollCalls'

export interface AdminHomeSummary {
  expectedClasses: number
  completedClasses: number
  missingClasses: { classe: string; missingCalls: number }[]
  status: 'closed' | 'unplanned' | 'upcoming' | 'pending' | 'complete'
}

/** A class is complete only when every call due at this hour is recorded. */
export function summarizeAdminHome(sessions: RollCallSession[], closed: boolean): AdminHomeSummary {
  if (closed) return { expectedClasses: 0, completedClasses: 0, missingClasses: [], status: 'closed' }
  const classes = new Map<string, Set<string>>()
  for (const session of sessions) {
    if (session.timing === 'upcoming') continue
    const missing = classes.get(session.classe) ?? new Set<string>()
    if (!session.done) missing.add(session.seance)
    classes.set(session.classe, missing)
  }
  const missingClasses = [...classes].filter(([, missing]) => missing.size > 0)
    .map(([classe, missing]) => ({ classe, missingCalls: missing.size }))
    .sort((a, b) => a.classe.localeCompare(b.classe, undefined, { numeric: true }))
  return {
    expectedClasses: classes.size,
    completedClasses: classes.size - missingClasses.length,
    missingClasses,
    status: sessions.length === 0 ? 'unplanned' : classes.size === 0 ? 'upcoming'
      : missingClasses.length > 0 ? 'pending' : 'complete',
  }
}
