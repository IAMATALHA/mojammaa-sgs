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
  serverTimestamp, getDocs, documentId, arrayUnion,
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
  deletedBy?: string[]
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

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteMessage(messageId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COL, messageId), { deletedBy: arrayUnion(uid) })
}

// ── Mark as read ─────────────────────────────────────────────────────────

export async function markAsRead(messageId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, COL, messageId), { readBy: arrayUnion(uid) })
}

// ── Subscribe ────────────────────────────────────────────────────────────

export function subscribeMessages(
  uid: string,
  role: string,
  onChange: (messages: MessageDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const buckets = new Map<number, Map<string, MessageDoc>>()
  const unsubs: Unsubscribe[] = []
  let nextBucketId = 0

  const apply = () => {
    const merged = new Map<string, MessageDoc>()
    buckets.forEach(bucket => {
      bucket.forEach((message, id) => merged.set(id, message))
    })
    const arr = [...merged.values()]
      .filter(message => !(message.deletedBy || []).includes(uid))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    onChange(arr)
  }

  const handleErr = (err: any) => {
    console.warn('[messages]', err?.code || err?.message)
    onError?.(err)
  }

  const listen = (q: any) => {
    const bucketId = nextBucketId++
    buckets.set(bucketId, new Map())
    return onSnapshot(q, (snap: any) => {
      const next = new Map<string, MessageDoc>()
      snap.docs.forEach((d: any) => next.set(d.id, { id: d.id, ...(d.data() as MessageDoc) }))
      buckets.set(bucketId, next)
      apply()
    }, handleErr)
  }

  // 1. Direct messages (new format: toIds array)
  unsubs.push(listen(
    query(collection(db, COL), where('toIds', 'array-contains', uid)),
  ))

  // 2. Broadcasts by toType (new format)
  const toTypes = ['all']
  if (role === 'professeur') toTypes.push('teachers')
  else if (role === 'parent') toTypes.push('parents')
  else if (role === 'admin') toTypes.push('teachers', 'parents')
  unsubs.push(listen(
    query(collection(db, COL), where('toType', 'in', toTypes)),
  ))

  // 3. Old format compatibility (toId string field)
  const oldToIds = [uid, 'all']
  if (role === 'professeur') oldToIds.push('teachers')
  else if (role === 'admin') oldToIds.push('admin', 'teachers')
  unsubs.push(listen(
    query(collection(db, COL), where('toId', 'in', oldToIds)),
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
    snap => onChange(
      snap.docs
        .map(d => ({ id: d.id, ...(d.data() as MessageDoc) }))
        .filter(message => !(message.deletedBy || []).includes(uid)),
    ),
    err => onError?.(err),
  )
}

async function getParentUidsForClasses(classes: string[]): Promise<string[]> {
  const parentUids = new Set<string>()
  for (let i = 0; i < classes.length; i += 10) {
    const chunk = classes.slice(i, i + 10)
    const snap = await getDocs(query(collection(db, 'eleves'), where('classe', 'in', chunk)))
    snap.forEach(d => {
      const data = d.data() as any
      if (data?.parentUid) parentUids.add(data.parentUid)
    })
  }
  return [...parentUids]
}

async function getPushTokensForUsers(uids: string[]): Promise<string[]> {
  const tokens: string[] = []
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10)
    if (chunk.length === 0) continue
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
    snap.forEach(d => {
      const token = (d.data() as any).expoPushToken
      if (token) tokens.push(token)
    })
  }
  return tokens
}

async function sendMessagePushes(p: {
  uids: string[]
  subject: string
  body: string
  priority?: 'urgent' | 'normal'
  category?: MessageCategory
  messageId: string
}): Promise<number> {
  const tokens = await getPushTokensForUsers(p.uids)
  if (tokens.length === 0) return 0
  await sendPush(tokens.map(token => ({
    to: token,
    title: p.priority === 'urgent' ? '🚨 ' + p.subject : p.subject,
    body: p.body,
    data: { type: p.category, messageId: p.messageId },
  })))
  return tokens.length
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
  const classTarget = p.toType === 'class'
  const resolvedToIds = classTarget ? await getParentUidsForClasses(p.toIds) : p.toIds
  const resolvedToType: MessageToType = classTarget ? 'user' : p.toType

  const messageId = await sendMessage({
    type:     p.type,
    subject:  p.subject,
    body:     p.body,
    fromId:   p.fromId,
    fromNom:  p.fromNom,
    fromRole: p.fromRole,
    toType:   resolvedToType,
    toIds:    resolvedToIds,
    toLabel:  p.toLabel,
    priority: p.priority,
    category: p.category,
    classe:   p.classe ?? (classTarget ? p.toIds.join(', ') : undefined),
  })

  let pushSent = 0
  const pushTargetIds = resolvedToType === 'user' ? resolvedToIds : p.toIds
  if (pushTargetIds.length > 0) {
    try {
      pushSent = await sendMessagePushes({
        uids: pushTargetIds,
        subject: p.subject,
        body: p.body,
        priority: p.priority,
        category: p.category,
        messageId,
      })
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

  const parentUids = await getParentUidsForClasses(classes)
  result.parentsTargeted = parentUids.length
  if (parentUids.length === 0) return result

  const fromNom = `${teacher.prenom} ${teacher.nom}`.trim()
  const messageId = await sendMessage({
    type:      'announcement',
    subject,
    body,
    fromId:    teacher.uid,
    fromNom,
    fromRole:  'professeur',
    toType:    'user',
    toIds:     parentUids,
    toLabel:   classes.join(', '),
    category:  category || 'announcement',
    priority:  urgent ? 'urgent' : 'normal',
    classe:    classes.join(', '),
    readBy:    [],
    status:    'sent',
  })
  result.messagesWritten = 1

  try {
    result.pushSent = await sendMessagePushes({
      uids: parentUids,
      subject,
      body,
      priority: urgent ? 'urgent' : 'normal',
      category: category || 'announcement',
      messageId,
    })
  } catch {}

  return result
}

// Send to an explicit set of parent UIDs (e.g. selected students of a class).
export async function broadcastToParents(p: {
  parentUids: string[]
  label:      string            // human label e.g. "3 élève(s) · 1APIC-3"
  classe?:    string
  subject:    string
  body:       string
  urgent?:    boolean
  category?:  MessageCategory
  teacher:    { uid: string; nom: string; prenom: string }
}): Promise<{ parentsTargeted: number; messagesWritten: number; pushSent: number }> {
  const result = { parentsTargeted: p.parentUids.length, messagesWritten: 0, pushSent: 0 }
  if (p.parentUids.length === 0) return result

  const fromNom = `${p.teacher.prenom} ${p.teacher.nom}`.trim()
  const messageId = await sendMessage({
    type:     'announcement',
    subject:  p.subject,
    body:     p.body,
    fromId:   p.teacher.uid,
    fromNom,
    fromRole: 'professeur',
    toType:   'user',
    toIds:    p.parentUids,
    toLabel:  p.label,
    category: p.category || 'announcement',
    priority: p.urgent ? 'urgent' : 'normal',
    classe:   p.classe,
    readBy:   [],
    status:   'sent',
  })
  result.messagesWritten = 1

  try {
    result.pushSent = await sendMessagePushes({
      uids:     p.parentUids,
      subject:  p.subject,
      body:     p.body,
      priority: p.urgent ? 'urgent' : 'normal',
      category: p.category || 'announcement',
      messageId,
    })
  } catch {}

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
