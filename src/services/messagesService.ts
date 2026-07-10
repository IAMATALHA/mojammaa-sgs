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
  collection, query, where, addDoc, onSnapshot, updateDoc, doc,
  serverTimestamp, getDocs, arrayUnion,
  type Unsubscribe, type Query, type DocumentData, type Timestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDoc, toDocs } from './firestore'
import type { EleveDoc } from './elevesService'
import type { UserProfile } from '../types'
import type { Attachment } from './StorageService'
import { currentAcademicPeriod } from '../utils/academicPeriod'

export type MessageType = 'announcement' | 'direct' | 'attendance' | 'behavior'
export type MessageToType = 'all' | 'parents' | 'teachers' | 'class' | 'user'
export type MessageCategory = 'attendance' | 'homework' | 'grade' | 'event' | 'announcement' | 'admin' | 'behavior'

export interface MessageDoc {
  id?:        string
  type:       MessageType
  subject:    string
  body:       string
  subjectAr?: string   // version arabe (affichée si l'app est en arabe)
  bodyAr?:    string
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
  attachments?: Attachment[]   // affiches/PJ (annonces admin — batch images)
  readBy?:    string[]
  deletedBy?: string[]
  status?:    string
  createdAt?: Timestamp
  academicYear?: string
  semestre?:     string
  monthKey?:     string
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
  Object.assign(clean, currentAcademicPeriod())
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
  const period = currentAcademicPeriod()
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

  const handleErr = (label: string) => (err: any) => {
    // `label` identifie LAQUELLE des 3 requêtes échoue (diagnostic terrain).
    console.warn(`[messages] listener=${label} code=${err?.code || err?.message}`)
    onError?.(err)
  }

  const listen = (q: Query<DocumentData>, label: string) => {
    const bucketId = nextBucketId++
    buckets.set(bucketId, new Map())
    return onSnapshot(q, snap => {
      const next = new Map<string, MessageDoc>()
      snap.docs.forEach(d => next.set(d.id, toDoc<MessageDoc>(d)))
      buckets.set(bucketId, next)
      apply()
    }, handleErr(label))
  }

  // Filtre par ANNÉE scolaire uniquement — pas par monthKey : un filtre au
  // mois ferait disparaître tout l'historique (même non lu) chaque 1er du
  // mois. L'année borne déjà le volume ; la pagination viendra si besoin.
  // 1. Direct messages (new format: toIds array)
  unsubs.push(listen(
    query(
      collection(db, COL),
      where('toIds', 'array-contains', uid),
      where('academicYear', '==', period.academicYear),
    ),
    'direct(toIds)',
  ))

  // 2. Broadcasts by toType (new format)
  const toTypes = ['all']
  if (role === 'professeur') toTypes.push('teachers')
  else if (role === 'parent') toTypes.push('parents')
  else if (role === 'admin') toTypes.push('teachers', 'parents')
  unsubs.push(listen(
    query(
      collection(db, COL),
      where('toType', 'in', toTypes),
      where('academicYear', '==', period.academicYear),
    ),
    'broadcasts(toType)',
  ))

  // 3. Old format compatibility (toId string field)
  const oldToIds = [uid, 'all']
  if (role === 'professeur') oldToIds.push('teachers')
  else if (role === 'admin') oldToIds.push('admin', 'teachers')
  unsubs.push(listen(
    query(
      collection(db, COL),
      where('toId', 'in', oldToIds),
      where('academicYear', '==', period.academicYear),
    ),
    'legacy(toId)',
  ))

  return () => unsubs.forEach(u => u())
}

// Sent messages by a user
export function subscribeSentMessages(
  uid: string,
  onChange: (messages: MessageDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const period = currentAcademicPeriod()
  // NB : pas de `orderBy` ici — `where(fromId) + orderBy(createdAt)` exigerait un
  // index composite (fromId, createdAt) non déclaré → la requête échouait. On
  // trie côté client (comme subscribeMessages), donc aucun index requis.
  return onSnapshot(
    query(
      collection(db, COL),
      where('fromId', '==', uid),
      where('academicYear', '==', period.academicYear),
    ),
    snap => onChange(
      toDocs<MessageDoc>(snap)
        .filter(message => !(message.deletedBy || []).includes(uid))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)),
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
      const data = toDoc<EleveDoc>(d)
      if (data.parentUid) parentUids.add(data.parentUid)
    })
  }
  return [...parentUids]
}

// NOTE: Push notifications are sent SERVER-SIDE by the Cloud Function
// `onMessageCreated` (functions/index.js). Clients only write the message doc;
// the function reads recipients' push tokens with the Admin SDK (bypassing
// security rules) and calls the Expo Push API. The `pushSent` fields returned
// below stay 0 — push delivery is async and reported per-recipient server-side.

// ── Broadcast helpers ────────────────────────────────────────────────────

interface BroadcastParams {
  subject:    string
  body:       string
  subjectAr?: string
  bodyAr?:    string
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
  attachments?: Attachment[]
}

export async function broadcast(p: BroadcastParams): Promise<{ messageId: string; pushSent: number }> {
  const classTarget = p.toType === 'class'
  const resolvedToIds = classTarget ? await getParentUidsForClasses(p.toIds) : p.toIds
  const resolvedToType: MessageToType = classTarget ? 'user' : p.toType

  const messageId = await sendMessage({
    type:     p.type,
    subject:  p.subject,
    body:     p.body,
    subjectAr: p.subjectAr,
    bodyAr:    p.bodyAr,
    fromId:   p.fromId,
    fromNom:  p.fromNom,
    fromRole: p.fromRole,
    toType:   resolvedToType,
    toIds:    resolvedToIds,
    toLabel:  p.toLabel,
    priority: p.priority,
    category: p.category,
    classe:   p.classe ?? (classTarget ? p.toIds.join(', ') : undefined),
    attachments: p.attachments,
  })

  return { messageId, pushSent: 0 }
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
  return result
}

// Send to an explicit set of parent UIDs (e.g. selected students of a class).
// `fromRole` defaults to 'professeur' so existing teacher callers are unchanged;
// the admin compose passes 'admin'.
export async function broadcastToParents(p: {
  parentUids: string[]
  label:      string            // human label e.g. "3 élève(s) · 1APIC-3"
  classe?:    string
  subject:    string
  body:       string
  subjectAr?: string
  bodyAr?:    string
  urgent?:    boolean
  category?:  MessageCategory
  teacher:    { uid: string; nom: string; prenom: string }
  fromRole?:  string
  attachments?: Attachment[]
}): Promise<{ parentsTargeted: number; messagesWritten: number; pushSent: number }> {
  const result = { parentsTargeted: p.parentUids.length, messagesWritten: 0, pushSent: 0 }
  if (p.parentUids.length === 0) return result

  const fromNom = `${p.teacher.prenom} ${p.teacher.nom}`.trim()
  await sendMessage({
    type:     'announcement',
    subject:  p.subject,
    body:     p.body,
    subjectAr: p.subjectAr,
    bodyAr:    p.bodyAr,
    fromId:   p.teacher.uid,
    fromNom,
    fromRole: p.fromRole || 'professeur',
    toType:   'user',
    toIds:    p.parentUids,
    toLabel:  p.label,
    category: p.category || 'announcement',
    priority: p.urgent ? 'urgent' : 'normal',
    classe:   p.classe,
    attachments: p.attachments,
    readBy:   [],
    status:   'sent',
  })
  result.messagesWritten = 1
  return result
}

// Personalised fan-out: one message per student → their own parent, so the
// body can include the child's name and each parent only sees their own doc.
export async function broadcastPersonalized(p: {
  recipients: { parentUid: string; body: string; bodyAr?: string; label: string; eleveId?: string }[]
  subject:    string
  subjectAr?: string
  classe?:    string
  urgent?:    boolean
  category?:  MessageCategory
  teacher:    { uid: string; nom: string; prenom: string }
  fromRole?:  string
  attachments?: Attachment[]
}): Promise<{ messagesWritten: number; pushSent: number; parentsTargeted: number }> {
  const result = { messagesWritten: 0, pushSent: 0, parentsTargeted: 0 }
  if (p.recipients.length === 0) return result

  const fromNom = `${p.teacher.prenom} ${p.teacher.nom}`.trim()

  // One message doc per (student → parent). Push is sent server-side per doc.
  for (const r of p.recipients) {
    await sendMessage({
      type:     'announcement',
      subject:  p.subject,
      body:     r.body,
      subjectAr: p.subjectAr,
      bodyAr:    r.bodyAr,
      fromId:   p.teacher.uid,
      fromNom,
      fromRole: p.fromRole || 'professeur',
      toType:   'user',
      toIds:    [r.parentUid],
      toLabel:  r.label,
      category: p.category || 'announcement',
      priority: p.urgent ? 'urgent' : 'normal',
      classe:   p.classe,
      eleveId:  r.eleveId,
      attachments: p.attachments,
      readBy:   [],
      status:   'sent',
    })
  }
  result.messagesWritten = p.recipients.length
  result.parentsTargeted = new Set(p.recipients.map(r => r.parentUid)).size
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
    const data = toDoc<EleveDoc>(d)
    if (data.classe) classSet.add(data.classe)
    if (data.parentUid) {
      const arr = childrenByParent.get(data.parentUid) || []
      arr.push(`${data.prenom || ''} ${data.nom || ''} · ${data.classe || ''}`.trim())
      childrenByParent.set(data.parentUid, arr)
    }
  })

  type ParentRow  = { uid: string; nom: string; prenom: string; email: string; children: string[] }
  type TeacherRow = { uid: string; nom: string; prenom: string; email: string; classes: string[] }
  const parents: ParentRow[] = []
  const teachers: TeacherRow[] = []

  usersSnap.forEach(d => {
    const data = toDoc<UserProfile>(d)
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

  parents.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
  teachers.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))

  return { parents, teachers, classes: [...classSet].sort() }
}
