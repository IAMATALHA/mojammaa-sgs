/**
 * eventsService — lectures Firestore de la collection `evenements`.
 *
 * Schéma actuel des docs Firestore :
 *   {
 *     titre:     string
 *     type:      'vacances' | 'reunion' | 'examen' | 'sortie' | 'evenement'
 *     dateDebut: string ISO 'YYYY-MM-DD'
 *     dateFin?:  string ISO 'YYYY-MM-DD'
 *     createdAt: Timestamp
 *   }
 */

import {
  collection, query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export interface EventDoc {
  id:        string
  titre:     string
  type:      string
  dateDebut: string   // ISO
  dateFin?:  string
  createdAt?: any
}

const COL = 'evenements'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Souscrit aux événements à venir (dateDebut >= aujourd'hui).
 */
export function subscribeUpcomingEvents(
  onChange: (events: EventDoc[]) => void,
  onError?: (err: Error) => void,
  limit = 10,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('dateDebut', '>=', todayISO()),
    orderBy('dateDebut', 'asc'),
  )
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs
        .slice(0, limit)
        .map(d => ({ id: d.id, ...(d.data() as Omit<EventDoc, 'id'>) }))
      onChange(list)
    },
    err => { onError?.(err) },
  )
}
