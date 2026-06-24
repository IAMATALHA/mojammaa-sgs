/**
 * emploiDuTempsService — lectures de la collection `emploiDuTemps` (EDT indexé
 * par classe, lisible par tous les connectés ; règle `allow read: isSignedIn()`).
 *
 * Les docs sont reconstruits depuis `schedules/*` par scripts/syncEmploiDuTemps.js.
 * Un doc = un créneau hebdomadaire d'une classe.
 */

import {
  collection, onSnapshot, query, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDocs } from './firestore'
import type { CourseSlot } from '../utils/courseSchedule'

export interface EmploiSlot extends CourseSlot {
  id:          string
  teacherUid?: string
}

const COL = 'emploiDuTemps'

/** Souscrit aux créneaux d'une classe. classeId vide → renvoie []. */
export function subscribeClassSchedule(
  classeId: string,
  onChange: (slots: EmploiSlot[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!classeId) {
    onChange([])
    return () => {}
  }
  const q = query(collection(db, COL), where('classeId', '==', classeId))
  return onSnapshot(
    q,
    snap => onChange(toDocs<EmploiSlot>(snap)),
    err => { onError?.(err) },
  )
}
