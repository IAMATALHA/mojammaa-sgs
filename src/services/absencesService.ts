/**
 * absencesService — lectures Firestore de la collection `absences`.
 *
 * Format des docs (créé par TeacherAttendanceScreen) :
 *   {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut: 'present' | 'absent',
 *     professorId, createdAt
 *   }
 */

import {
  collection, query, where, getDocs, onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDoc, toDocs } from './firestore'

export interface AbsenceDoc {
  id?:           string
  eleveId:       string
  eleveNom?:     string
  elevePrenom?:  string
  classe:        string
  date:          string   // ISO 'YYYY-MM-DD'
  seance:        string   // 'S1'..'S6'
  statut:        'present' | 'absent'
  professorId?:  string
  justified?:    boolean
  raison?:       string
}

const COL = 'absences'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Calcule le taux de présence pour les classes d'un prof, sur la date
 * passée (ou aujourd'hui par défaut). Compte total = somme distincte
 * d'élèves uniques de ces classes ; absents = docs `statut='absent'`.
 *
 * Retourne un % arrondi 0..100. Si aucune classe ou aucun élève,
 * renvoie 100 (rien à signaler → présence parfaite par convention).
 */
export async function computeTeacherPresenceRate(
  classes: string[],
  date = todayISO(),
): Promise<number> {
  if (classes.length === 0) return 100

  // Total élèves dans ces classes (chunks de 10)
  let totalEleves = 0
  for (let i = 0; i < classes.length; i += 10) {
    const chunk = classes.slice(i, i + 10)
    const snap = await getDocs(
      query(collection(db, 'eleves'), where('classe', 'in', chunk)),
    )
    totalEleves += snap.size
  }
  if (totalEleves === 0) return 100

  // Absents aujourd'hui (chunks de 10)
  let totalAbsents = 0
  for (let i = 0; i < classes.length; i += 10) {
    const chunk = classes.slice(i, i + 10)
    const snap = await getDocs(query(
      collection(db, COL),
      where('classe', 'in', chunk),
      where('date',   '==', date),
      where('statut', '==', 'absent'),
    ))
    // Compte unique par eleveId (un élève peut être absent à plusieurs séances le même jour)
    const seen = new Set<string>()
    snap.forEach(d => {
      const data = toDoc<AbsenceDoc>(d)
      if (data.eleveId) seen.add(data.eleveId)
    })
    totalAbsents += seen.size
  }

  const rate = Math.max(0, totalEleves - totalAbsents) / totalEleves
  return Math.round(rate * 100)
}

/**
 * Souscrit aux absences d'une liste d'élèves (les enfants d'un parent).
 * Renvoie tous les docs (toutes dates) — le caller filtre/aggrège.
 */
export function subscribeAbsencesForEleves(
  eleveIds: string[],
  onChange: (list: AbsenceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (eleveIds.length === 0) {
    onChange([])
    return () => {}
  }
  // Firestore `in` limit = 10
  const safe = eleveIds.slice(0, 10)
  const q = query(
    collection(db, COL),
    where('eleveId', 'in', safe),
  )
  return onSnapshot(
    q,
    snap => onChange(toDocs<AbsenceDoc>(snap)),
    err => { onError?.(err) },
  )
}

/**
 * Calcule un taux de présence sur les 30 derniers jours pour un élève.
 * Retourne un % 0..100.
 */
export function computeChildPresenceRate(
  absences: AbsenceDoc[],
  eleveId:  string,
  daysWindow = 30,
): number {
  const since = new Date()
  since.setDate(since.getDate() - daysWindow)
  const sinceISO = since.toISOString().split('T')[0]

  const childAbsences = absences.filter(a =>
    a.eleveId === eleveId &&
    a.statut === 'absent' &&
    a.date >= sinceISO
  )

  // Approx : journées d'école = ~22 jours sur 30 jours (Lun-Ven minus holidays)
  const schoolDays = 22
  const absent = new Set(childAbsences.map(a => a.date)).size
  const rate = Math.max(0, schoolDays - absent) / schoolDays
  return Math.round(Math.max(0, Math.min(1, rate)) * 100)
}
