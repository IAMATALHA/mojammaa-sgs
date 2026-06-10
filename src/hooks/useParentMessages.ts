import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeMessages, type MessageDoc } from '../services/messagesService'
import i18n from '../i18n'
import { localizedSubject, localizedBody } from '../utils/arabicText'
import type { Announcement } from '../utils/dashboardTypes'

function timestampToISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

function toAnnouncement(m: MessageDoc): Announcement {
  return {
    id:       m.id || '',
    title:    localizedSubject(m, i18n.language),
    body:     localizedBody(m, i18n.language),
    author:   m.fromNom || 'École',
    date:     timestampToISO(m.createdAt),
    priority: m.priority === 'urgent' ? 'urgent' : 'normal',
    category: m.category === 'event' ? 'event' : m.category === 'attendance' ? 'school' : 'admin',
  }
}

export interface ParentMessagesData {
  loading:  boolean
  error:    string | null
  messages: Announcement[]
  raw:      MessageDoc[]
  unread:   number
}

export function useParentMessages(): ParentMessagesData {
  const { profile } = useAuth()
  const [raw, setRaw] = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeMessages(
      profile.uid,
      profile.role || 'parent',
      list => { setRaw(list); setLoading(false); setError(null) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [profile?.uid, profile?.role])

  const messages = useMemo(() => raw.map(toAnnouncement), [raw])
  const unread = useMemo(() => raw.filter(m => !(m.readBy || []).includes(profile?.uid || '')).length, [raw, profile?.uid])

  return { loading, error, messages, raw, unread }
}
