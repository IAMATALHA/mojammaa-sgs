import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeMessages, subscribeSentMessages, type MessageDoc } from '../services/messagesService'
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

export interface TeacherMessagesData {
  loading:  boolean
  error:    string | null
  messages: Announcement[]
  unread:   number
}

export function useTeacherMessages(): TeacherMessagesData {
  const { profile } = useAuth()
  const [inbox, setInbox] = useState<Map<string, MessageDoc>>(new Map())
  const [sent, setSent] = useState<Map<string, MessageDoc>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setLoading(false); return }
    setLoading(true)

    const u1 = subscribeMessages(
      profile.uid,
      profile.role || 'professeur',
      list => {
        const m = new Map<string, MessageDoc>()
        list.forEach(msg => m.set(msg.id!, msg))
        setInbox(m)
        setLoading(false)
        setError(null)
      },
      err => { setError(err.message); setLoading(false) },
    )

    const u2 = subscribeSentMessages(
      profile.uid,
      list => {
        const m = new Map<string, MessageDoc>()
        list.forEach(msg => m.set(msg.id!, msg))
        setSent(m)
      },
    )

    return () => { u1(); u2() }
  }, [profile?.uid, profile?.role])

  const messages = useMemo(() => {
    const merged = new Map([...inbox, ...sent])
    return [...merged.values()]
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .map(toAnnouncement)
  }, [inbox, sent])

  const unread = useMemo(() => {
    return [...inbox.values()].filter(m => !(m.readBy || []).includes(profile?.uid || '')).length
  }, [inbox, profile?.uid])

  return { loading, error, messages, unread }
}
