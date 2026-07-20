/**
 * Suivi opérationnel des déplacements d'une classe vers la prière.
 *
 * Aucun élève n'est identifié : seul l'état global de la classe est conservé.
 */
import type { Timestamp } from 'firebase/firestore'
import type { ServiceDate } from './pickup'

export type PrayerClassStatus = 'going' | 'praying' | 'returned'

/** Document réellement persisté dans `prayerClassSessions`. */
export interface PrayerClassSession {
  id:            string
  serviceDate:   ServiceDate
  classe:        string
  status:        PrayerClassStatus
  startedAt:     Timestamp
  startedByUid:  string
  prayingAt?:    Timestamp
  prayingByUid?: string
  returnedAt?:   Timestamp
  returnedByUid?: string
  updatedAt:     Timestamp
}

export interface StartPrayerClassSessionInput {
  classe: string
}
