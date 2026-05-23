/**
 * messagesService — read + write de la collection `messages`.
 *
 * Schéma cible (utilisé pour les nouveaux messages) :
 *   {
 *     subject, body,
 *     fromId, fromNom, fromRole,
 *     toType: 'user' | 'class' | 'role:parent' | 'role:professeur' | 'all',
 *     toIds:  string[]    (UIDs si toType='user', classes si toType='class')
 *     priority: 'urgent' | 'normal',
 *     category?: 'attendance' | 'homework' | 'grade' | 'event' | 'announcement',
 *     eleveId?: string,    (deep linking)
 *     classe?:  string,
 *     readBy:   string[],
 *     createdAt: Timestamp,
 *   }
 *
 * Pour les broadcasts class/role/all, on fera de multiples souscriptions
 * parallèles dans le hook (Phase B). Ici on expose juste les briques.
 */

import {
  collection, query, where, orderBy, addDoc, onSnapshot,
  serverTimestamp, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export type MessageToType =
  | 'all'
  | 'role:parent'
  | 'role:professeur'
  | 'class'
  | 'user'

export type MessageCategory =
  | 'attendance'
  | 'homework'
  | 'grade'
  | 'event'
  | 'announcement'
  | 'admin'

export interface MessageDoc {
  id?:        string
  subject:    string
  body:       string
  fromId:     string
  fromNom?:   string
  fromRole?:  string
  toType:     MessageToType
  toIds:      string[]
  category?:  MessageCategory
  priority?:  'urgent' | 'normal'
  eleveId?:   string
  classe?:    string
  readBy?:    string[]
  createdAt?: any
}

const COL = 'messages'

/** Crée un message. Retourne l'ID du doc. */
export async function sendMessage(msg: Omit<MessageDoc, 'createdAt' | 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...msg,
    readBy:    msg.readBy ?? [],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Souscrit aux messages dont le user est directement destinataire
 * (toType='user' AND toIds array-contains uid). Plus tard on ajoutera
 * les broadcasts en queries parallèles.
 */
export function subscribeDirectMessages(
  uid: string,
  onChange: (messages: MessageDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('toIds', 'array-contains', uid),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as MessageDoc) }))),
    err  => { onError?.(err) },
  )
}
