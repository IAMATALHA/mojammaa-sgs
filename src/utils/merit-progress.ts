import type { ComportementDoc } from '../services/comportementsService'

export function behaviorPeriod(entries: ComportementDoc[], period: 'month' | 'year' | 'all', today: string) {
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7))
  const start = period === 'month' ? `${today.slice(0, 7)}-01` : `${month >= 9 ? year : year - 1}-09-01`
  return entries.filter(entry => entry.date <= today && (period === 'all' || entry.date >= start))
}
/** One recorded merit = one point. Warnings are shown separately. */
export function meritProgress(entries: ComportementDoc[], today: string) {
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 5 + i, 1))
    const key = date.toISOString().slice(0, 7)
    return { key, points: 0 }
  })
  const active = entries.filter(entry => !entry.cancelledAt && entry.date <= today)
  const reasons: Record<string, number> = {}
  for (const entry of active) {
    if (entry.kind !== 'merite') continue
    const bucket = months.find(row => row.key === entry.date.slice(0, 7))
    if (bucket) bucket.points++
    if (entry.date.startsWith(today.slice(0, 7))) reasons[entry.reason] = (reasons[entry.reason] || 0) + 1
  }
  return { months, current: months[5].points, previous: months[4].points,
    yearPoints: behaviorPeriod(active, 'year', today).filter(entry => entry.kind === 'merite').length,
    warnings: active.filter(entry => entry.kind === 'avertissement' && entry.date.startsWith(today.slice(0, 7))).length,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}
