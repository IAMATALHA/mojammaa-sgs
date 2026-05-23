/**
 * useParentMessages — souscrit aux messages destinés au parent connecté.
 *
 * Convertit les MessageDoc Firestore vers la forme `Announcement` utilisée
 * par les composants AnnouncementCard / ParentMessagesScreen.
 *
 * Phase A : ne lit que les messages directement adressés (`toIds`
 * array-contains uid). Les broadcasts class/role/all viendront en Phase B.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  subscribeDirectMessages, type MessageDoc,
} from '../services/messagesService'
import type { Announcement } from '../utils/mockData'

function categoryToAnnouncementCategory(c?: string): Announcement['category'] {
  switch (c) {
    case 'attendance':   return 'school'
    case 'homework':     return 'school'
    case 'grade':        return 'school'
    case 'event':        return 'event'
    case 'announcement': return 'admin'
    case 'admin':        return 'admin'
    default:             return 'school'
  }
}

function timestampToISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  if (ts instanceof Date) return ts.toISOString()
  return new Date().toISOString()
}

function toAnnouncement(m: MessageDoc): Announcement {
  return {
    id:       m.id || `${m.fromId}_${m.createdAt?.seconds ?? Date.now()}`,
    title:    m.subject,
    body:     m.body,
    author:   m.fromNom || 'École',
    date:     timestampToISO(m.createdAt),
    priority: m.priority === 'urgent' ? 'urgent' : 'normal',
    category: categoryToAnnouncementCategory(m.category),
  }
}

export interface ParentMessagesData {
  loading:    boolean
  error:      string | null
  messages:   Announcement[]
  raw:        MessageDoc[]
}

export function useParentMessages(): ParentMessagesData {
  const { profile } = useAuth()
  const [raw,     setRaw]     = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeDirectMessages(
      profile.uid,
      list => {
        setRaw(list)
        setLoading(false)
        setError(null)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [profile?.uid])

  const messages = useMemo(() => raw.map(toAnnouncement), [raw])

  return { loading, error, messages, raw }
}
