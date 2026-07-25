/**
 * ressourcesService — collection `ressources` (supports de cours partagés).
 *
 * Format des docs (créé par TeacherRessourcesScreen) :
 *   {
 *     titre, description?, matiere, classeId,
 *     attachments: Attachment[],          // PDF / images (Storage ressources/{uid}/)
 *     teacherId, teacherNom,
 *     viewedBy: string[],                 // append-only (même règle que messages.readBy)
 *     createdAt
 *   }
 *
 * Contenu pédagogique non nominatif → lisible par tout connecté (même
 * périmètre que `devoirs`). Le compteur de vues = viewedBy.length.
 */

import {
  addDoc, arrayUnion, collection, deleteDoc, doc, query,
  Timestamp, updateDoc, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { subscribeChunked } from './chunkedQuery'
import type { Attachment } from './StorageService'
import { currentAcademicPeriod } from '../utils/academicPeriod'

export interface RessourceDoc {
  id?:          string
  titre:        string
  description?: string
  matiere?:     string
  classeId:     string
  attachments:  Attachment[]
  teacherId:    string
  teacherNom:   string
  viewedBy?:    string[]
  createdAt?:   Timestamp
  academicYear?: string
  semestre?:     string
  monthKey?:     string
}

const COL = 'ressources'

export async function createRessource(
  input: Omit<RessourceDoc, 'id' | 'createdAt' | 'viewedBy'>,
): Promise<string> {
  const clean: Record<string, any> = {}
  Object.entries(input).forEach(([k, v]) => { if (v !== undefined) clean[k] = v })
  clean.viewedBy = []
  clean.createdAt = Timestamp.now()
  Object.assign(clean, currentAcademicPeriod())
  const ref = await addDoc(collection(db, COL), clean)
  return ref.id
}

/**
 * Souscrit aux ressources d'une ou plusieurs classes.
 * Le nombre de classes n'est pas borné (un prof peut en avoir plus de 10).
 */
export function subscribeRessourcesForClasses(
  classes: string[],
  onChange: (list: RessourceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  // Année scolaire uniquement — un support de cours doit rester visible toute
  // l'année, pas seulement le mois de sa publication.
  const period = currentAcademicPeriod()
  return subscribeChunked<RessourceDoc>(
    classes,
    chunk => query(
      collection(db, COL),
      where('classeId', 'in', chunk),
      where('academicYear', '==', period.academicYear),
    ),
    rows => onChange(
      // Tri après fusion des chunks : chaque listener ne voit que ses classes.
      [...rows].sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      ),
    ),
    onError,
  )
}

/** Marque la ressource comme vue par cet utilisateur (idempotent — arrayUnion). */
export async function markRessourceViewed(id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { viewedBy: arrayUnion(uid) })
}

export async function deleteRessource(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
