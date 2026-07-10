/**
 * Périodes scolaires partagées par les écritures et les requêtes Firestore.
 *
 * Convention Mojammaa : année scolaire du 1er septembre au 31 août,
 * S1 de septembre à janvier inclus, S2 de février à août inclus.
 * Les chaînes de dates sont construites en heure locale pour éviter qu'une
 * écriture autour de minuit UTC ne soit rangée dans le mauvais mois au Maroc.
 */

export type Semestre = 'S1' | 'S2'

export interface AcademicPeriod {
  academicYear: string
  semestre: Semestre
  monthKey: string
}

function localDateFromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const result = new Date(year, month - 1, day)
  return Number.isNaN(result.getTime()) ? null : result
}

export function localISODate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function academicPeriodForDate(value: Date | string = new Date()): AcademicPeriod {
  const date = typeof value === 'string' ? localDateFromIso(value) || new Date() : value
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const schoolYearStart = month >= 9 ? year : year - 1

  return {
    academicYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
  }
}

export function currentAcademicPeriod(): AcademicPeriod {
  return academicPeriodForDate(new Date())
}

