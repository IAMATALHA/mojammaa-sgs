/**
 * directoryService — annuaire du personnel (directory/staff), maintenu
 * côté serveur par la CF onUserWritten. C'est la SEULE source de noms de
 * profs/admins accessible à un parent (les rules interdisent users/).
 */
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

export interface StaffTeacher {
  uid:     string
  nom:     string
  prenom:  string
  matiere: string
  classes: string[]
}

export interface StaffAdmin {
  uid:    string
  nom:    string
  prenom: string
}

export interface StaffDirectory {
  teachers: StaffTeacher[]
  admins:   StaffAdmin[]
}

export async function getStaffDirectory(): Promise<StaffDirectory | null> {
  const snap = await getDoc(doc(db, 'directory', 'staff'))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  return {
    teachers: Array.isArray(data.teachers) ? data.teachers as StaffTeacher[] : [],
    admins:   Array.isArray(data.admins)   ? data.admins as StaffAdmin[]     : [],
  }
}
