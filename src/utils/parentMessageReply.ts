import type { MessageDoc } from '../services/messagesService'

/** Staff replies go to the shared inbox; direct parent → staff is forbidden. */
export function parentMessageReplyTarget(
  message: Pick<MessageDoc, 'type' | 'fromRole' | 'fromId' | 'fromNom'> | null,
  administrationLabel: string,
): Pick<MessageDoc, 'toType' | 'toIds' | 'toLabel'> | null {
  if (!message?.fromId || message.type !== 'direct') return null
  if (message.fromRole === 'staff') {
    return { toType: 'administration', toIds: [], toLabel: administrationLabel }
  }
  if (message.fromRole === 'admin') {
    return { toType: 'user', toIds: [message.fromId], toLabel: message.fromNom || '' }
  }
  return null
}
