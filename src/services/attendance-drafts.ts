import AsyncStorage from '@react-native-async-storage/async-storage'
import { httpsCallable } from 'firebase/functions'
import { AppState } from 'react-native'
import { auth, functions } from '../config/firebase'
import { createAttendanceDraftStore, type AttendanceDraftRow } from './attendance-drafts-core'
import type { WeeklySlot } from './scheduleService'

export const attendanceDrafts = createAttendanceDraftStore(AsyncStorage, async draft => {
  const result = await httpsCallable<unknown, { versions: Record<string, string> }>(functions, 'submitAttendance', { timeout: 12_000 })({
    operationId: draft.operationId, date: draft.date, lessonKey: draft.lessonKey,
    rows: draft.rows.map(({ id, status, baseVersion }) => ({ id, status, baseVersion })),
  })
  return result.data
}, () => auth.currentUser?.uid)

export async function loadAttendance(lessonKey: string, date: string) {
  const result = await httpsCallable<unknown, { slot: WeeklySlot; seance: string; students: AttendanceDraftRow[] }>(functions, 'loadAttendance', { timeout: 10_000 })({ lessonKey, date })
  return result.data
}

export function startAttendanceSync(uid: string) {
  const sync = () => { if (AppState.currentState === 'active') void attendanceDrafts.flush(uid).catch(() => {}) }
  sync()
  const timer = setInterval(sync, 20_000)
  const listener = AppState.addEventListener('change', state => { if (state === 'active') sync() })
  return () => { clearInterval(timer); listener.remove() }
}
