/**
 * useTeacherMessages — souscrit aux messages où le prof est destinataire
 * ou expéditeur. Convertit en Announcement pour AnnouncementCard.
 *
 * Couvre :
 *   - messages directs au prof (toIds array-contains profUid)
 *   - messages envoyés par le prof (fromId == profUid) pour qu'il voit
 *     l'historique de ses propres broadcasts
 *
 * Pour des raisons de simplicité, on fait deux subscriptions parallèles
 * et on merge côté client (Firestore ne supporte pas OR sur des champs
 * différents en plus de array-contains).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { MessageDoc } from '../services/messagesService'
import type { Announcement } from '../utils/mockData'

const CATEGORY_TO_ANNOUNCE: Record<string, Announcement['category']> = {
  attendance:   'school',
  homework:     'school',
  grade:        'school',
  event:        'event',
  announcement: 'admin',
  admin:        'admin',
}

function timestampToISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  if (ts instanceof Date) return ts.toISOString()
  return new Date().toISOString()
}

function toAnnouncement(m: MessageDoc & { id: string }): Announcement {
  return {
    id:       m.id,
    title:    m.subject,
    body:     m.body,
    author:   m.fromNom || 'École',
    date:     timestampToISO(m.createdAt),
    priority: m.priority === 'urgent' ? 'urgent' : 'normal',
    category: CATEGORY_TO_ANNOUNCE[m.category || ''] || 'admin',
  }
}

export interface TeacherMessagesData {
  loading:  boolean
  error:    string | null
  messages: Announcement[]
}

export function useTeacherMessages(): TeacherMessagesData {
  const { profile } = useAuth()
  const [inbox,  setInbox]  = useState<Record<string, MessageDoc & { id: string }>>({})
  const [outbox, setOutbox] = useState<Record<string, MessageDoc & { id: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setLoading(false); return }
    setLoading(true)

    const COL = 'messages'

    // Direct messages to teacher
    const qInbox = query(
      collection(db, COL),
      where('toIds', 'array-contains', profile.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsubA = onSnapshot(
      qInbox,
      snap => {
        const next: Record<string, MessageDoc & { id: string }> = {}
        snap.docs.forEach(d => {
          next[d.id] = { id: d.id, ...(d.data() as MessageDoc) }
        })
        setInbox(next)
        setLoading(false)
      },
      err => { setError(err.message); setLoading(false) },
    )

    // Messages sent by teacher
    const qOutbox = query(
      collection(db, COL),
      where('fromId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsubB = onSnapshot(
      qOutbox,
      snap => {
        const next: Record<string, MessageDoc & { id: string }> = {}
        snap.docs.forEach(d => {
          next[d.id] = { id: d.id, ...(d.data() as MessageDoc) }
        })
        setOutbox(next)
      },
      err => { /* non-bloquant pour l'outbox */ setError(err.message) },
    )

    return () => { unsubA(); unsubB() }
  }, [profile?.uid])

  const messages = useMemo(() => {
    const merged = { ...inbox, ...outbox }
    return Object.values(merged)
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0
        const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0
        return tb - ta
      })
      .map(toAnnouncement)
  }, [inbox, outbox])

  return { loading, error, messages }
}
