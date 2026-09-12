import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'
/** Comportements : écriture unique ; alertes produites par le serveur. */

import {
  collection, doc, onSnapshot, query, runTransaction,
  Timestamp, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDocs } from './firestore'
import { subscribeChunked } from './chunkedQuery'
import type { BehaviorKind } from '../utils/behaviorTaxonomy'

export interface ComportementDoc {
  id?:          string
  eleveId:      string
  eleveNom:     string
  elevePrenom:  string
  classe:       string
  date:         string   // ISO 'YYYY-MM-DD'
  seance?:      string   // 'S1'..'S6' si saisi depuis l'appel
  kind:         BehaviorKind
  reason:       string   // clé behavior.reasons.*
  comment?:     string
  teacherId:    string
  teacherNom:   string
  cancelledAt?: Timestamp
  cancelledBy?: string
  cancelReason?: string
  createdAt?:   Timestamp
}

const COL = 'comportements'

export interface RecordComportementInput {
  id: string
  eleve:    { id: string; nom: string; prenom: string }
  classe:   string
  date:     string
  seance?:  string
  kind:     BehaviorKind
  reason:   string
  comment?: string
  teacher:  { uid: string; nom: string; prenom: string }
}

export async function recordComportement(input: RecordComportementInput): Promise<void> {
  const { eleve, classe, date, seance, kind, reason, comment, teacher } = input
  const teacherNom = `${teacher.prenom} ${teacher.nom}`.trim()

  const ref = doc(db, COL, input.id)
  await runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) return
    transaction.set(ref, {
      eleveId:     eleve.id,
      eleveNom:    eleve.nom,
      elevePrenom: eleve.prenom,
      classe,
      date,
      ...(seance ? { seance } : {}),
      kind,
      reason,
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
      teacherId:   teacher.uid,
      teacherNom,
      createdAt:   Timestamp.now(),
    })
  })
}

/**
 * Souscrit aux comportements d'une liste d'élèves (les enfants d'un parent).
 * Le nombre d'élèves n'est pas borné — cf. `chunkedQuery`.
 */
export function subscribeComportementsForEleves(
  eleveIds: string[],
  onChange: (list: ComportementDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeChunked<ComportementDoc>(
    eleveIds,
    chunk => query(collection(db, COL), where('eleveId', 'in', chunk)),
    onChange,
    onError,
  )
}

/** Souscrit au journal de comportement d'une classe (vue prof). */
export function subscribeComportementsForClasse(
  classe: string,
  onChange: (list: ComportementDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('classe', '==', classe))
  return onSnapshot(
    q,
    snap => onChange(toDocs<ComportementDoc>(snap)),
    err => { onError?.(err) },
  )
}

export async function cancelComportement(id: string, reason: string): Promise<void> {
  await httpsCallable(functions, 'cancelComportement', { timeout: 12_000 })({ id, reason })
}
