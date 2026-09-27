import { collection, doc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../config/firebase'
import type { Attachment } from './StorageService'

export const homeworkCommandId = () => doc(collection(db, 'homeworkCommands')).id
export interface HomeworkChanges {
  titre: string
  description: string
  type: string
  dateLimite: string
  attachments: Attachment[]
}
export async function manageHomework(input: {
  id: string; commandId: string; version: number; action: 'edit' | 'remove'
  changes?: HomeworkChanges; notify?: boolean
}) {
  const result = await httpsCallable<typeof input, { status: 'updated' | 'deleted' | 'cancelled' }>(functions, 'manageHomework')(input)
  return result.data
}
