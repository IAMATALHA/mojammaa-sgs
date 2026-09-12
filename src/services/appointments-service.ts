import { httpsCallable } from 'firebase/functions'
import { collection, doc } from 'firebase/firestore'
import { db, functions } from '../config/firebase'

export type AppointmentMode = 'parent' | 'admin' | 'teacher'
export type AppointmentStatus = 'requested' | 'proposed' | 'confirmed' | 'cancelled' | 'declined' | 'completed'
export interface Appointment {
  id: string; eleveId: string; childName: string; classe: string; topic: string
  status: AppointmentStatus; revision: number; note?: string; availability?: string
  date?: string; time?: string; duration?: number; startAt?: number; endAt?: number
  location?: string; staffName?: string; teacherId?: string; adminNote?: string
}
export const newAppointmentOperation = () => doc(collection(db, '_ids')).id
export async function listAppointments(mode: AppointmentMode, history = false, cursor?: string) {
  const result = await httpsCallable<unknown, { rows: Appointment[]; cursor: string | null }>(functions, 'listAppointments', { timeout: 12_000 })({ mode, history, ...(cursor ? { cursor } : {}) })
  return result.data
}
export async function appointmentCommand(input: Record<string, unknown>) {
  return (await httpsCallable<unknown, { id: string; replayed: boolean }>(functions, 'appointmentCommand', { timeout: 15_000 })(input)).data
}
export function appointmentError(error: unknown): string {
  const e = error as { code?: string; message?: string }
  const known = ['busy', 'stale', 'already-open', 'teacher-scope', 'guardian-changed', 'closed']
  return known.includes(e?.message || '') ? `appointments.errors.${e.message}`
    : e?.code === 'functions/invalid-argument' ? 'appointments.errors.invalid' : 'appointments.errors.failed'
}
