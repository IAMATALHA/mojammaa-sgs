/**
 * absenceRequestsService — déclarations d'absence PAR LES PARENTS.
 *
 * Flux : le parent déclare (« Omar sera absent demain, RDV médical ») →
 * le prof voit la déclaration sur son écran d'appel pour cette date →
 * à l'enregistrement de l'appel, l'absence correspondante est marquée
 * justifiée avec le motif, et la déclaration passe à 'approved'.
 *
 * Rules : parent crée pour SON enfant (status 'pending' imposé), lit les
 * siennes ; prof de la classe / admin lisent et décident.
 */
import {
  collection, query, where, addDoc, getDocs, onSnapshot, updateDoc, doc,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export type AbsenceRequestStatus = 'pending' | 'approved' | 'declined'

export interface AbsenceRequestDoc {
  id?:          string
  eleveId:      string
  eleveNom?:    string
  elevePrenom?: string
  classe:       string
  parentUid:    string
  parentNom?:   string
  date:         string   // ISO 'YYYY-MM-DD'
  reason:       string
  status:       AbsenceRequestStatus
  createdAt?:   any
  decidedBy?:   string
  decidedAt?:   any
}

const COL = 'absenceRequests'

export async function createAbsenceRequest(
  req: Omit<AbsenceRequestDoc, 'id' | 'status' | 'createdAt' | 'decidedBy' | 'decidedAt'>,
): Promise<string> {
  const clean: Record<string, any> = {}
  Object.entries(req).forEach(([k, v]) => { if (v !== undefined) clean[k] = v })
  clean.status = 'pending'
  clean.createdAt = serverTimestamp()
  const ref = await addDoc(collection(db, COL), clean)
  return ref.id
}

export function subscribeAbsenceRequestsForParent(
  parentUid: string,
  onChange: (list: AbsenceRequestDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), where('parentUid', '==', parentUid)),
    snap => onChange(
      snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<AbsenceRequestDoc, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    ),
    err => onError?.(err),
  )
}

/** Déclarations d'une classe pour une date (écran d'appel du prof). */
export async function getAbsenceRequestsForClassDate(
  classe: string,
  date: string,
): Promise<AbsenceRequestDoc[]> {
  const snap = await getDocs(query(
    collection(db, COL),
    where('classe', '==', classe),
    where('date', '==', date),
  ))
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AbsenceRequestDoc, 'id'>) }))
}

export async function decideAbsenceRequest(
  requestId: string,
  status: 'approved' | 'declined',
  deciderUid: string,
): Promise<void> {
  await updateDoc(doc(db, COL, requestId), {
    status,
    decidedBy: deciderUid,
    decidedAt: serverTimestamp(),
  })
}
