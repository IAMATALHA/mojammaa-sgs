/**
 * Mérites et avertissements de toute l'école (vue administration). Fonctions
 * pures, testées seules (tests/services/adminAccess.test.mjs).
 *
 * Une entrée annulée (cancelComportement) reste visible dans le journal mais
 * sort de tous les totaux, comme sur le site.
 */
import type { ComportementDoc } from '../services/comportementsService'

export type BehaviorScope = 'month' | 'year' | 'all'

export interface BehaviorCounts {
  merites: number
  avertissements: number
}

export interface ClassBehavior extends BehaviorCounts {
  classe: string
  students: number
  lastDate: string
}

export interface StudentBehavior extends BehaviorCounts {
  eleveId: string
  nom: string
  prenom: string
  classe: string
  lastDate: string
}

export interface BehaviorOverview {
  totals: BehaviorCounts & { students: number; cancelled: number }
  byClass: ClassBehavior[]
  byStudent: StudentBehavior[]
  /** Journal, du plus récent au plus ancien, annulations comprises. */
  recent: ComportementDoc[]
}

/** Début de la période : mois civil ou année scolaire (1er septembre). */
export function scopeStart(scope: BehaviorScope, today: string): string {
  if (scope === 'all') return ''
  if (scope === 'month') return `${today.slice(0, 7)}-01`
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  return `${month >= 9 ? year : year - 1}-09-01`
}

const studentKey = (entry: ComportementDoc) => entry.eleveId || `${entry.elevePrenom}|${entry.eleveNom}|${entry.classe}`

function byRecency(a: ComportementDoc, b: ComportementDoc): number {
  return b.date.localeCompare(a.date)
    || ((b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0)
      - ((a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0)
}

export function summarizeBehavior(entries: ComportementDoc[], scope: BehaviorScope, today: string, classe?: string): BehaviorOverview {
  const start = scopeStart(scope, today)
  const inScope = entries.filter(entry => entry.date <= today && entry.date >= start && (!classe || entry.classe === classe))
  const counted = inScope.filter(entry => !entry.cancelledAt)

  const classes = new Map<string, ClassBehavior & { keys: Set<string> }>()
  const students = new Map<string, StudentBehavior>()
  for (const entry of counted) {
    const kindKey = entry.kind === 'avertissement' ? 'avertissements' : 'merites'
    const room = classes.get(entry.classe) ?? { classe: entry.classe, merites: 0, avertissements: 0, students: 0, lastDate: '', keys: new Set<string>() }
    room[kindKey] += 1
    room.keys.add(studentKey(entry))
    if (entry.date > room.lastDate) room.lastDate = entry.date
    classes.set(entry.classe, room)

    const key = studentKey(entry)
    const student = students.get(key) ?? {
      eleveId: entry.eleveId, nom: entry.eleveNom, prenom: entry.elevePrenom, classe: entry.classe,
      merites: 0, avertissements: 0, lastDate: '',
    }
    student[kindKey] += 1
    if (entry.date > student.lastDate) student.lastDate = entry.date
    students.set(key, student)
  }

  const byClass = [...classes.values()]
    .map(({ keys, ...room }) => ({ ...room, students: keys.size }))
    .sort((a, b) => a.classe.localeCompare(b.classe, undefined, { numeric: true }))
  // Élèves à suivre d'abord : le plus d'avertissements ; à égalité, le plus de mérites.
  const byStudent = [...students.values()]
    .sort((a, b) => b.avertissements - a.avertissements || b.merites - a.merites
      || a.classe.localeCompare(b.classe, undefined, { numeric: true }) || a.nom.localeCompare(b.nom))

  return {
    totals: {
      merites: counted.filter(entry => entry.kind !== 'avertissement').length,
      avertissements: counted.filter(entry => entry.kind === 'avertissement').length,
      students: students.size,
      cancelled: inScope.length - counted.length,
    },
    byClass,
    byStudent,
    recent: [...inScope].sort(byRecency),
  }
}
