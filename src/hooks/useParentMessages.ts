import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeMessages, type MessageDoc } from '../services/messagesService'
import i18n from '../i18n'
import { localizedSubject, localizedBody } from '../utils/arabicText'
import type { Announcement } from '../utils/dashboardTypes'

function timestampToISO(ts: unknown): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString()
  }
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
    category: m.category === 'event' ? 'event' : (m.category === 'attendance' || m.category === 'behavior') ? 'school' : 'admin',
    image:    (m.attachments || []).find(a => a.mime?.startsWith('image/'))?.url,
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
      'parent',
      list => { setRaw(list); setLoading(false); setError(null) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [profile?.uid])

  const messages = useMemo(() => raw.map(toAnnouncement), [raw])
  const unread = useMemo(() => raw.filter(m => !(m.readBy || []).includes(profile?.uid || '')).length, [raw, profile?.uid])

  return { loading, error, messages, raw, unread }
}
