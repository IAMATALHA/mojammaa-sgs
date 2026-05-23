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
  serverTimestamp, getDocs, documentId, writeBatch, doc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { sendPush } from './pushService'

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

// ──────────────────────────────────────────────────────────────────────
// Broadcasts : fan-out vers tous les parents des classes ciblées
// ──────────────────────────────────────────────────────────────────────

interface BroadcastParams {
  classes:   string[]
  subject:   string
  body:      string
  urgent?:   boolean
  category?: MessageCategory
  teacher:   { uid: string; nom: string; prenom: string }
}

interface BroadcastResult {
  parentsTargeted:    number
  messagesWritten:    number
  pushSent:           number
  classes:            string[]
}

/**
 * Envoie un broadcast aux parents des élèves dans les classes données.
 *
 * Stratégie : fan-out — un doc messages par parent (toIds=[parentUid]) +
 * un push par parent. Plus de docs mais lecture côté parent très simple
 * (le hook useParentMessages capture déjà avec array-contains).
 */
export async function broadcastToClasses(p: BroadcastParams): Promise<BroadcastResult> {
  const { classes, subject, body, urgent, category, teacher } = p
  const result: BroadcastResult = {
    parentsTargeted: 0,
    messagesWritten: 0,
    pushSent: 0,
    classes,
  }

  if (classes.length === 0) return result

  // 1. Lit tous les élèves des classes ciblées (chunks de 10 pour `in`)
  const eleveByClass: Record<string, string[]> = {}
  const parentUidsSet = new Set<string>()
  for (let i = 0; i < classes.length; i += 10) {
    const chunk = classes.slice(i, i + 10)
    const snap = await getDocs(
      query(collection(db, 'eleves'), where('classe', 'in', chunk)),
    )
    snap.forEach(d => {
      const data = d.data() as any
      if (data?.parentUid) {
        parentUidsSet.add(data.parentUid)
        eleveByClass[data.classe] = eleveByClass[data.classe] || []
        eleveByClass[data.classe].push(d.id)
      }
    })
  }
  const parentUids = [...parentUidsSet]
  result.parentsTargeted = parentUids.length
  if (parentUids.length === 0) return result

  // 2. Lit les parents pour leur expoPushToken (chunks de 10)
  const parentToToken = new Map<string, string>()
  for (let i = 0; i < parentUids.length; i += 10) {
    const chunk = parentUids.slice(i, i + 10)
    const snap = await getDocs(
      query(collection(db, 'users'), where(documentId(), 'in', chunk)),
    )
    snap.forEach(d => {
      const data = d.data() as any
      if (data?.expoPushToken) parentToToken.set(d.id, data.expoPushToken)
    })
  }

  // 3. Écrit un doc messages par parent (chunks de 400 pour writeBatch)
  const fromNom = `${teacher.prenom} ${teacher.nom}`.trim()
  for (let i = 0; i < parentUids.length; i += 400) {
    const chunk = parentUids.slice(i, i + 400)
    const batch = writeBatch(db)
    chunk.forEach(parentUid => {
      const ref = doc(collection(db, 'messages'))
      batch.set(ref, {
        subject,
        body,
        fromId:    teacher.uid,
        fromNom,
        fromRole:  'professeur',
        toType:    'user',
        toIds:     [parentUid],
        category:  category || 'announcement',
        priority:  urgent ? 'urgent' : 'normal',
        classes:   classes,
        readBy:    [],
        createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
    result.messagesWritten += chunk.length
  }

  // 4. Envoie les pushs (Expo accepte 100 max par appel, sendPush chunke)
  const pushes = [...parentToToken.entries()].map(([, token]) => ({
    to:    token,
    title: urgent ? '🚨 ' + subject : subject,
    body,
    data:  { type: category || 'announcement', classes },
  }))
  if (pushes.length > 0) {
    await sendPush(pushes)
    result.pushSent = pushes.length
  }

  return result
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
