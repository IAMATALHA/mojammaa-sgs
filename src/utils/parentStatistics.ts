import type { AcademicPeriod } from './academicPeriod'

/** Only effective observations inside the displayed school period. */
export function behaviorInPeriod<T extends { eleveId: string; date: string; cancelledAt?: unknown }>(
  entries: T[], childId: string, period: AcademicPeriod, scope: 'semester' | 'academicYear',
): T[] {
  const startYear = Number(period.academicYear.slice(0, 4))
  const start = scope === 'semester' && period.semestre === 'S2' ? `${startYear + 1}-02-01` : `${startYear}-09-01`
  const end = scope === 'semester' && period.semestre === 'S1' ? `${startYear + 1}-02-01` : `${startYear + 1}-09-01`
  return entries.filter(entry => entry.eleveId === childId && !entry.cancelledAt && entry.date >= start && entry.date < end)
}

/** Zero is a real grade; missing or invalid grades must never become zero. */
export function formatParentAverage(report: { generalAvg: number; bareme: 10 | 20 } | null): string {
  if (!report || !Number.isFinite(report.generalAvg) || report.generalAvg < 0 || report.generalAvg > report.bareme) return '—'
  return `${report.generalAvg.toFixed(1)} / ${report.bareme}`
}
