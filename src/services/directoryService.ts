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

export interface DirectoryParent {
  uid:      string
  nom:      string
  prenom:   string
  email:    string
  children: string[]   // « Prénom Nom · Classe », déjà trié
}

export interface ParentsDirectory {
  parents: DirectoryParent[]
  classes: string[]
}

/**
 * Annuaire des parents pré-agrégé (`directoryAdmin/parents`), maintenu par la
 * CF `flushParentsDirectoryDirty`. UNE lecture au lieu des collections `users`
 * et `eleves` entières.
 *
 * Réservé aux admins par les rules : renvoie `null` pour tout autre rôle,
 * comme lorsque le document n'a pas encore été calculé. L'appelant retombe
 * alors sur la lecture directe.
 */
export async function getParentsDirectory(): Promise<ParentsDirectory | null> {
  try {
    const snap = await getDoc(doc(db, 'directoryAdmin', 'parents'))
    if (!snap.exists()) return null
    const data = snap.data() as Record<string, unknown>
    if (!Array.isArray(data.parents)) return null
    return {
      parents: data.parents as DirectoryParent[],
      classes: Array.isArray(data.classes) ? data.classes as string[] : [],
    }
  } catch {
    return null
  }
}
