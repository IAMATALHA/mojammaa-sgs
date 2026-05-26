/**
 * messagesService — unified communication service.
 *
 * Message types:
 *   - 'announcement': official school communication (one-to-many, no reply expected)
 *   - 'direct':       private message (one-to-one or few, reply possible)
 *   - 'attendance':   auto-generated absence notification
 *
 * All messages use the same schema:
 *   {
 *     type:      'announcement' | 'direct' | 'attendance'
 *     subject, body,
 *     fromId, fromNom, fromRole,
 *     toType:    'all' | 'parents' | 'teachers' | 'class' | 'user'
 *     toIds:     string[]     (target UIDs for 'user', class names for 'class')
 *     toLabel:   string       (human-readable: "Parents de 1APIC-3", "M. Atalha")
 *     priority:  'urgent' | 'normal'
 *     category?: 'attendance' | 'homework' | 'grade' | 'event' | 'announcement' | 'admin'
 *     eleveId?:  string
 *     classe?:   string
 *     readBy:    string[]     (UIDs of users who read it)
 *     status:    'sent' | 'read' | 'archived'
 *     createdAt: Timestamp
 *   }
 */

import {
  collection, query, where, orderBy, addDoc, onSnapshot, updateDoc, doc,
  serverTimestamp, getDocs, documentId, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { sendPush } from './pushService'

export type MessageType = 'announcement' | 'direct' | 'attendance'
export type MessageToType = 'all' | 'parents' | 'teachers' | 'class' | 'user'
export type MessageCategory = 'attendance' | 'homework' | 'grade' | 'event' | 'announcement' | 'admin'

export interface MessageDoc {
  id?:        string
  type:       MessageType
  subject:    string
  body:       string
  fromId:     string
  fromNom?:   string
  fromRole?:  string
  toType:     MessageToType
  toIds:      string[]
  toLabel?:   string
  category?:  MessageCategory
  priority?:  'urgent' | 'normal'
  eleveId?:   string
  classe?:    string
  readBy?:    string[]
  status?:    string
  createdAt?: any
}

const COL = 'messages'

// ── Create ───────────────────────────────────────────────────────────────

export async function sendMessage(msg: Omit<MessageDoc, 'createdAt' | 'id'>): Promise<string> {
  const clean: Record<string, any> = {}
  Object.entries(msg).forEach(([k, v]) => {
    if (v !== undefined) clean[k] = v
  })
  clean.readBy = clean.readBy ?? []
  clean.status = 'sent'
  clean.createdAt = serverTimestamp()
  const ref = await addDoc(collection(db, COL), clean)
  return ref.id
}

// ── Mark as read ─────────────────────────────────────────────────────────

export async function markAsRead(messageId: string, uid: string): Promise<void> {
  const ref = doc(db, COL, messageId)
  const snap = await getDocs(query(collection(db, COL), where(documentId(), '==', messageId)))
  if (snap.empty) return
  const data = snap.docs[0].data() as any
  const readBy: string[] = data.readBy || []
  if (!readBy.includes(uid)) {
    await updateDoc(ref, { readBy: [...readBy, uid] })
  }
}

// ── Subscribe ────────────────────────────────────────────────────────────

export function subscribeMessages(
  uid: string,
  role: string,
  onChange: (messages: MessageDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const merged = new Map<string, MessageDoc>()
  const unsubs: Unsubscribe[] = []

  const apply = () => {
    const arr = [...merged.values()].sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
    onChange(arr)
  }

  const handleSnap = (snap: any) => {
    snap.docs.forEach((d: any) => merged.set(d.id, { id: d.id, ...(d.data() as MessageDoc) }))
    apply()
  }

  const handleErr = (err: any) => {
    console.warn('[messages]', err?.code || err?.message)
  }

  // 1. Direct messages (new format: toIds array)
  unsubs.push(onSnapshot(
    query(collection(db, COL), where('toIds', 'array-contains', uid)),
    handleSnap, handleErr,
  ))

  // 2. Broadcasts by toType (new format)
  const toTypes = ['all']
  if (role === 'professeur') toTypes.push('teachers')
  else if (role === 'parent') toTypes.push('parents')
  else if (role === 'admin') toTypes.push('teachers', 'parents')
  unsubs.push(onSnapshot(
    query(collection(db, COL), where('toType', 'in', toTypes)),
    handleSnap, handleErr,
  ))

  // 3. Old format compatibility (toId string field)
  const oldToIds = [uid, 'all']
  if (role === 'professeur') oldToIds.push('teachers')
  else if (role === 'admin') oldToIds.push('admin', 'teachers')
  unsubs.push(onSnapshot(
    query(collection(db, COL), where('toId', 'in', oldToIds)),
    handleSnap, handleErr,
  ))

  return () => unsubs.forEach(u => u())
}

// Sent messages by a user
export function subscribeSentMessages(
  uid: string,
  onChange: (messages: MessageDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), where('fromId', '==', uid), orderBy('createdAt', 'desc')),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as MessageDoc) }))),
    err => onError?.(err),
  )
}

// ── Broadcast helpers ────────────────────────────────────────────────────

interface BroadcastParams {
  subject:    string
  body:       string
  fromId:     string
  fromNom:    string
  fromRole:   string
  toType:     MessageToType
  toIds:      string[]
  toLabel:    string
  priority:   'urgent' | 'normal'
  category:   MessageCategory
  type:       MessageType
  classe?:    string
}

export async function broadcast(p: BroadcastParams): Promise<{ messageId: string; pushSent: number }> {
  const messageId = await sendMessage({
    type:     p.type,
    subject:  p.subject,
    body:     p.body,
    fromId:   p.fromId,
    fromNom:  p.fromNom,
    fromRole: p.fromRole,
    toType:   p.toType,
    toIds:    p.toIds,
    toLabel:  p.toLabel,
    priority: p.priority,
    category: p.category,
    classe:   p.classe,
  })

  // Send push to all targets with tokens
  let pushSent = 0
  if (p.toIds.length > 0 && p.toIds.length <= 100) {
    try {
      const tokenSnap = await getDocs(
        query(collection(db, 'users'), where(documentId(), 'in', p.toIds.slice(0, 10))),
      )
      const pushes: any[] = []
      tokenSnap.forEach(d => {
        const token = (d.data() as any).expoPushToken
        if (token) {
          pushes.push({
            to: token,
            title: p.priority === 'urgent' ? '🚨 ' + p.subject : p.subject,
            body: p.body,
            data: { type: p.category, messageId },
          })
        }
      })
      if (pushes.length > 0) {
        await sendPush(pushes)
        pushSent = pushes.length
      }
    } catch {}
  }

  return { messageId, pushSent }
}

// Fan-out broadcast to parents of specific classes
export async function broadcastToClasses(p: {
  classes:   string[]
  subject:   string
  body:      string
  urgent?:   boolean
  category?: MessageCategory
  teacher:   { uid: string; nom: string; prenom: string }
}): Promise<{ parentsTargeted: number; messagesWritten: number; pushSent: number; classes: string[] }> {
  const { classes, subject, body, urgent, category, teacher } = p
  const result = { parentsTargeted: 0, messagesWritten: 0, pushSent: 0, classes }

  if (classes.length === 0) return result

  const parentUidsSet = new Set<string>()
  for (let i = 0; i < classes.length; i += 10) {
    const chunk = classes.slice(i, i + 10)
    const snap = await getDocs(query(collection(db, 'eleves'), where('classe', 'in', chunk)))
    snap.forEach(d => {
      const data = d.data() as any
      if (data?.parentUid) parentUidsSet.add(data.parentUid)
    })
  }
  const parentUids = [...parentUidsSet]
  result.parentsTargeted = parentUids.length
  if (parentUids.length === 0) return result

  const parentToToken = new Map<string, string>()
  for (let i = 0; i < parentUids.length; i += 10) {
    const chunk = parentUids.slice(i, i + 10)
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
    snap.forEach(d => {
      const token = (d.data() as any).expoPushToken
      if (token) parentToToken.set(d.id, token)
    })
  }

  const fromNom = `${teacher.prenom} ${teacher.nom}`.trim()
  for (let i = 0; i < parentUids.length; i += 400) {
    const chunk = parentUids.slice(i, i + 400)
    const batch = writeBatch(db)
    chunk.forEach(parentUid => {
      const ref = doc(collection(db, COL))
      batch.set(ref, {
        type:      'announcement',
        subject, body,
        fromId:    teacher.uid,
        fromNom,
        fromRole:  'professeur',
        toType:    'user',
        toIds:     [parentUid],
        toLabel:   classes.join(', '),
        category:  category || 'announcement',
        priority:  urgent ? 'urgent' : 'normal',
        readBy:    [],
        status:    'sent',
        createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
    result.messagesWritten += chunk.length
  }

  const pushes = [...parentToToken.entries()].map(([, token]) => ({
    to: token,
    title: urgent ? '🚨 ' + subject : subject,
    body,
    data: { type: category || 'announcement', classes },
  }))
  if (pushes.length > 0) {
    await sendPush(pushes)
    result.pushSent = pushes.length
  }

  return result
}

// Get all users for recipient picker
export async function getRecipientsList(): Promise<{
  parents: { uid: string; nom: string; prenom: string; email: string; children: string[] }[]
  teachers: { uid: string; nom: string; prenom: string; email: string; classes: string[] }[]
  classes: string[]
}> {
  const [usersSnap, elevesSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'eleves')),
  ])

  const childrenByParent = new Map<string, string[]>()
  const classSet = new Set<string>()
  elevesSnap.forEach(d => {
    const data = d.data() as any
    if (data.classe) classSet.add(data.classe)
    if (data.parentUid) {
      const arr = childrenByParent.get(data.parentUid) || []
      arr.push(`${data.prenom || ''} ${data.nom || ''} · ${data.classe || ''}`.trim())
      childrenByParent.set(data.parentUid, arr)
    }
  })

  const parents: any[] = []
  const teachers: any[] = []

  usersSnap.forEach(d => {
    const data = d.data() as any
    if (data.role === 'parent') {
      parents.push({
        uid: d.id,
        nom: data.nom || '',
        prenom: data.prenom || '',
        email: data.email || '',
        children: childrenByParent.get(d.id) || [],
      })
    } else if (data.role === 'professeur') {
      teachers.push({
        uid: d.id,
        nom: data.nom || '',
        prenom: data.prenom || '',
        email: data.email || '',
        classes: data.classes || (data.classe ? [data.classe] : []),
      })
    }
  })

  parents.sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
  teachers.sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))

  return { parents, teachers, classes: [...classSet].sort() }
}
