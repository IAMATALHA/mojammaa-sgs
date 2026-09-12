const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function performanceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const number = Number(value.trim().replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

/** Only recorded calls form the denominator; missing calls are not presences. */
export function recordedAttendance(rows: { eleveId: string; date: string; seance: string; statut: string }[]) {
  const calls = new Map<string, string>()
  for (const row of rows) {
    if (!row.eleveId || !row.date || !row.seance) continue
    if (!['present', 'absent', 'retard'].includes(row.statut)) continue
    const key = JSON.stringify([row.eleveId, row.date, row.seance])
    // A duplicate presence must not erase an absence for the same session.
    if (calls.get(key) !== 'absent') calls.set(key, row.statut)
  }
  const absences = [...calls.values()].filter(status => status === 'absent').length
  return {
    count: calls.size,
    presence: calls.size ? 100 * (calls.size - absences) / calls.size : null,
  }
}

/** Missing dimensions have no weight, and insufficient grades have no score. */
export function performanceScore(avg20: number | null, coverage: number, presence: number | null, delta: number | null) {
  const gradeScore = avg20 == null ? null : clamp(avg20 * 5)
  const absenceScore = presence == null ? null : clamp(presence)
  const trendScore = delta == null ? null : clamp(58 + delta * 8)
  const values = { notes: gradeScore, coverage, presence: absenceScore, trend: trendScore }
  const baseWeights = { notes: 42, coverage: 26, presence: 22, trend: 10 }
  const keys = Object.keys(values) as (keyof typeof values)[]
  const totalWeight = keys.reduce((sum, key) => sum + (values[key] == null ? 0 : baseWeights[key]), 0)
  const weights = Object.fromEntries(keys.map(key => [key,
    values[key] == null ? 0 : baseWeights[key] * 100 / totalWeight,
  ])) as typeof baseWeights
  const healthScore = gradeScore == null || coverage < 70 ? null : Math.round(
    keys.reduce((sum, key) => sum + (values[key] ?? 0) * weights[key] / 100, 0),
  )
  return { healthScore, gradeScore, absenceScore, trendScore, weights }
}

export function rankPerformance<T extends { name: string; healthScore: number | null }>(items: T[]) {
  return items.filter(item => item.healthScore != null)
    .sort((a, b) => b.healthScore! - a.healthScore! || a.name.localeCompare(b.name, 'fr'))
}
