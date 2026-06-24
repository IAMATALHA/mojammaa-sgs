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
  addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query,
  Timestamp, updateDoc, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDocs } from './firestore'
import type { Attachment } from './StorageService'

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
}

const COL = 'ressources'

export async function createRessource(
  input: Omit<RessourceDoc, 'id' | 'createdAt' | 'viewedBy'>,
): Promise<string> {
  const clean: Record<string, any> = {}
  Object.entries(input).forEach(([k, v]) => { if (v !== undefined) clean[k] = v })
  clean.viewedBy = []
  clean.createdAt = Timestamp.now()
  const ref = await addDoc(collection(db, COL), clean)
  return ref.id
}

/** Souscrit aux ressources d'une ou plusieurs classes (max 10 — limite `in`). */
export function subscribeRessourcesForClasses(
  classes: string[],
  onChange: (list: RessourceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (classes.length === 0) {
    onChange([])
    return () => {}
  }
  const q = query(collection(db, COL), where('classeId', 'in', classes.slice(0, 10)))
  return onSnapshot(
    q,
    snap => onChange(
      toDocs<RessourceDoc>(snap)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
    ),
    err => { onError?.(err) },
  )
}

/** Marque la ressource comme vue par cet utilisateur (idempotent — arrayUnion). */
export async function markRessourceViewed(id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { viewedBy: arrayUnion(uid) })
}

export async function deleteRessource(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
