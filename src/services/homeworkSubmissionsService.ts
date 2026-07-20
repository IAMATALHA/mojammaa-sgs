import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import type { Attachment } from './StorageService'
import { toDoc, toDocs } from './firestore'
import { commitInChunks } from '../utils/firestoreBatch'
import type { EleveDoc } from './elevesService'

export type HomeworkSubmissionStatus =
  | 'pending'
  | 'submitted'
  | 'submitted_late'
  | 'graded'
  | 'not_submitted'
  | 'not_done'
  | 'excused'

export interface HomeworkSubmission {
  id: string
  homeworkId: string
  eleveId: string
  classeId: string
  parentUid: string
  teacherId: string
  status: HomeworkSubmissionStatus
  attachments: Attachment[]
  parentComment?: string
  submittedAt?: unknown
  submittedByUid?: string
  reviewedAt?: unknown
  reviewedByUid?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface HomeworkIdentity {
  homeworkId: string
  eleveId: string
  classeId: string
  parentUid: string
  teacherId: string
}

export function homeworkSubmissionId(homeworkId: string, eleveId: string): string {
  return `${homeworkId}_${eleveId}`
}

function normalizeSubmission(data: HomeworkSubmission): HomeworkSubmission {
  return {
    ...data,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    status: data.status || 'pending',
  }
}

export function subscribeHomeworkSubmission(
  homeworkId: string,
  eleveId: string,
  onChange: (submission: HomeworkSubmission | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const ref = doc(db, 'homeworkSubmissions', homeworkSubmissionId(homeworkId, eleveId))
  return onSnapshot(
    ref,
    snap => onChange(snap.exists() ? normalizeSubmission(toDoc<HomeworkSubmission>(snap)) : null),
    err => onError?.(err),
  )
}

export function subscribeHomeworkSubmissions(
  homeworkId: string,
  onChange: (submissions: HomeworkSubmission[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'homeworkSubmissions'), where('homeworkId', '==', homeworkId))
  return onSnapshot(
    q,
    snap => onChange(toDocs<HomeworkSubmission>(snap).map(normalizeSubmission)),
    err => onError?.(err),
  )
}

export function subscribeParentHomeworkSubmissions(
  parentUid: string,
  eleveIds: string[],
  onChange: (submissions: HomeworkSubmission[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const ids = [...new Set(eleveIds.filter(Boolean))]
  if (ids.length === 0) {
    onChange([])
    return () => {}
  }
  const buckets = new Map<string, HomeworkSubmission[]>()
  const unsubs = ids.map(eleveId => onSnapshot(
    query(
      collection(db, 'homeworkSubmissions'),
      where('parentUid', '==', parentUid),
      where('eleveId', '==', eleveId),
    ),
    snap => {
      buckets.set(eleveId, toDocs<HomeworkSubmission>(snap).map(normalizeSubmission))
      onChange([...buckets.values()].flat())
    },
    err => onError?.(err),
  ))
  return () => unsubs.forEach(unsub => unsub())
}

export async function submitHomeworkProof(
  identity: HomeworkIdentity,
  attachments: Attachment[],
  parentComment: string,
  previousStatus?: HomeworkSubmissionStatus,
): Promise<void> {
  const status: HomeworkSubmissionStatus =
    previousStatus === 'not_submitted' || previousStatus === 'not_done' || previousStatus === 'submitted_late'
      ? 'submitted_late'
      : 'submitted'
  const now = serverTimestamp()
  await setDoc(
    doc(db, 'homeworkSubmissions', homeworkSubmissionId(identity.homeworkId, identity.eleveId)),
    {
      ...identity,
      status,
      attachments,
      parentComment: parentComment.trim(),
      submittedAt: now,
      submittedByUid: identity.parentUid,
      updatedAt: now,
      ...(!previousStatus ? { createdAt: now } : {}),
    },
    { merge: true },
  )
}

export async function reviewHomeworkSubmission(
  identity: HomeworkIdentity,
  status: Exclude<HomeworkSubmissionStatus, 'submitted' | 'submitted_late'>,
  existsAlready: boolean,
): Promise<void> {
  const now = serverTimestamp()
  await setDoc(
    doc(db, 'homeworkSubmissions', homeworkSubmissionId(identity.homeworkId, identity.eleveId)),
    {
      ...identity,
      status,
      reviewedAt: now,
      reviewedByUid: identity.teacherId,
      updatedAt: now,
      ...(!existsAlready ? { attachments: [], parentComment: '', createdAt: now } : {}),
    },
    { merge: true },
  )
}

export async function markAllHomeworkAsGraded(
  homework: { id: string; classeId: string; teacherId: string },
  eleves: EleveDoc[],
  existingEleveIds: Set<string>,
): Promise<void> {
  await commitInChunks(
    db,
    eleves.filter(eleve => !!(eleve.codeMassar || eleve.id)),
    (batch: WriteBatch, eleve) => {
      const eleveId = eleve.codeMassar || eleve.id || ''
      const ref = doc(db, 'homeworkSubmissions', homeworkSubmissionId(homework.id, eleveId))
      const now = serverTimestamp()
      const existsAlready = existingEleveIds.has(eleveId)
      batch.set(ref, {
        homeworkId: homework.id,
        eleveId,
        classeId: homework.classeId,
        parentUid: eleve.parentUid || '',
        teacherId: homework.teacherId,
        status: 'graded',
        reviewedAt: now,
        reviewedByUid: homework.teacherId,
        updatedAt: now,
        ...(!existsAlready ? {
          createdAt: now,
          attachments: [],
          parentComment: '',
        } : {}),
      }, { merge: true })
    },
    8,
  )
}

export function isHomeworkClosed(status?: HomeworkSubmissionStatus): boolean {
  return status === 'graded' || status === 'excused'
}

export function isHomeworkAwaitingReview(status?: HomeworkSubmissionStatus): boolean {
  return status === 'submitted' || status === 'submitted_late'
}
