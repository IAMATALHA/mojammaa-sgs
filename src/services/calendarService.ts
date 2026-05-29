import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot, collection,
  query, where, getDocs, serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export type JourType = 'normal' | 'vacances' | 'evenement' | 'examen'

export interface JourScolaire {
  date: string
  type: JourType
  label: string
  annuleCours: boolean
  createdBy?: string
}

const COL = 'joursScolaires'

export async function getJourScolaire(date: string): Promise<JourScolaire | null> {
  const snap = await getDoc(doc(db, COL, date))
  return snap.exists() ? (snap.data() as JourScolaire) : null
}

export async function getTodayJour(): Promise<JourScolaire | null> {
  const today = new Date().toISOString().split('T')[0]
  return getJourScolaire(today)
}

export function subscribeTodayJour(
  onChange: (jour: JourScolaire | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const today = new Date().toISOString().split('T')[0]
  return onSnapshot(
    doc(db, COL, today),
    snap => onChange(snap.exists() ? (snap.data() as JourScolaire) : null),
    err => onError?.(err),
  )
}

export async function setJourScolaire(jour: JourScolaire, uid: string): Promise<void> {
  await setDoc(doc(db, COL, jour.date), {
    ...jour,
    createdBy: uid,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteJourScolaire(date: string): Promise<void> {
  await deleteDoc(doc(db, COL, date))
}

export async function getJoursScolaires(fromDate: string, toDate: string): Promise<JourScolaire[]> {
  const snap = await getDocs(collection(db, COL))
  return snap.docs
    .map(d => d.data() as JourScolaire)
    .filter(j => j.date >= fromDate && j.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}
