import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot, collection,
  query, where, getDocs, serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { docData, toDocs } from './firestore'
import { localISODate } from '../utils/academicPeriod'

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
  return docData<JourScolaire>(snap)
}

export async function getTodayJour(): Promise<JourScolaire | null> {
  const today = localISODate()
  return getJourScolaire(today)
}

export function subscribeTodayJour(
  onChange: (jour: JourScolaire | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const today = localISODate()
  return onSnapshot(
    doc(db, COL, today),
    snap => onChange(docData<JourScolaire>(snap)),
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
  // Borné côté serveur (23/06/2026) : avant, on téléchargeait TOUTE la
  // collection puis on filtrait côté client. Filtre par plage sur un seul
  // champ (`date`) → pas d'index composite requis.
  const snap = await getDocs(query(
    collection(db, COL),
    where('date', '>=', fromDate),
    where('date', '<=', toDate),
  ))
  return toDocs<JourScolaire>(snap)
    .sort((a, b) => a.date.localeCompare(b.date))
}
