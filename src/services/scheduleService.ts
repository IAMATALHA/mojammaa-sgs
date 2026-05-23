/**
 * scheduleService — lectures Firestore de la collection `schedules`.
 *
 * Un document par enseignant, indexé sur son uid Auth. Contient un
 * tableau `weeklySlots` (Lun → Sam) qu'on filtre côté client pour
 * obtenir le jour courant et calculer le statut now / done / upcoming.
 */

import {
  doc, onSnapshot, getDoc, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export type WeekDay =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday'
  | 'thursday' | 'friday' | 'saturday'

export interface WeeklySlot {
  day:         WeekDay
  startTime:   string   // 'HH:MM' 24h
  endTime:     string   // 'HH:MM' 24h
  durationMin: number
  classe:      string
  room?:       string
  subject?:    string
}

export interface ScheduleDoc {
  uid:         string
  teacherUid:  string
  weeklySlots: WeeklySlot[]
}

const COL = 'schedules'

export async function getSchedule(uid: string): Promise<ScheduleDoc | null> {
  const snap = await getDoc(doc(db, COL, uid))
  return snap.exists() ? (snap.data() as ScheduleDoc) : null
}

export function subscribeSchedule(
  uid: string,
  onChange: (s: ScheduleDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COL, uid),
    snap => onChange(snap.exists() ? (snap.data() as ScheduleDoc) : null),
    err  => { onError?.(err) },
  )
}
