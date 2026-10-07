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

export interface AdminCurrentLessons {
  classes: number
  recorded: number
  until: string
}

const minutes = (hm?: string | null) => {
  const [h, m] = (hm ?? '').split(':').map(Number)
  return hm && Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}

/** Lessons running now: classes in session, classes already called, and when the first of them ends. */
export function summarizeCurrentLessons(sessions: RollCallSession[]): AdminCurrentLessons | null {
  const classes = new Map<string, boolean>()
  let until = Infinity
  for (const session of sessions) {
    if (session.timing !== 'current') continue
    classes.set(session.classe, (classes.get(session.classe) ?? true) && session.done)
    const start = minutes(session.startTime)
    const explicit = minutes(session.endTime)
    const end = Number.isNaN(explicit) ? start + (session.durationMin && session.durationMin > 0 ? session.durationMin : 60) : explicit
    if (!Number.isNaN(end)) until = Math.min(until, end)
  }
  if (classes.size === 0) return null
  return {
    classes: classes.size,
    recorded: [...classes.values()].filter(Boolean).length,
    until: Number.isFinite(until) ? `${String(Math.floor(until / 60)).padStart(2, '0')}:${String(until % 60).padStart(2, '0')}` : '',
  }
}
