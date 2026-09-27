import { collection, doc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../config/firebase'
import type { Attachment } from './StorageService'

export const homeworkCommandId = () => doc(collection(db, 'homeworkCommands')).id
/** The server refused a stale version: the homework changed (or was cancelled) meanwhile. */
export const isHomeworkConflict = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'functions/failed-precondition'
export interface HomeworkChanges {
  titre: string
  description: string
  type: string
  dateLimite: string
  attachments: Attachment[]
}
export type HomeworkCommand =
  | { action: 'create'; id: string; commandId: string; classeId: string; changes: HomeworkChanges }
  | { action: 'edit'; id: string; commandId: string; version: number; changes: HomeworkChanges; notify?: boolean }
  | { action: 'remove'; id: string; commandId: string; version: number }
export async function manageHomework(input: HomeworkCommand) {
  const result = await httpsCallable<HomeworkCommand, {
    status: 'created' | 'updated' | 'deleted' | 'cancelled'; id?: string
  }>(functions, 'manageHomework')(input)
  return result.data
}
