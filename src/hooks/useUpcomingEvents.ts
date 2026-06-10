/**
 * useUpcomingEvents — récupère les événements à venir et les convertit
 * au format UpcomingEvent attendu par le composant EventCard.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  subscribeUpcomingEvents, type EventDoc,
} from '../services/eventsService'
import type { UpcomingEvent } from '../utils/dashboardTypes'

// Mapping types FR Firestore → types UpcomingEvent
const TYPE_MAP: Record<string, UpcomingEvent['type']> = {
  reunion:    'meeting',
  examen:     'exam',
  sortie:     'event',
  evenement:  'event',
  vacances:   'holiday',
}

function toUpcomingEvent(d: EventDoc): UpcomingEvent {
  return {
    id:    d.id,
    title: d.titre,
    date:  d.dateDebut,
    type:  TYPE_MAP[d.type] || 'event',
  }
}

export interface UpcomingEventsData {
  loading:  boolean
  error:    string | null
  events:   UpcomingEvent[]
}

export function useUpcomingEvents(limit = 6): UpcomingEventsData {
  const [raw,     setRaw]     = useState<EventDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeUpcomingEvents(
      list => {
        setRaw(list)
        setLoading(false)
        setError(null)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
      limit,
    )
    return unsub
  }, [limit])

  const events = useMemo(() => raw.map(toUpcomingEvent), [raw])

  return { loading, error, events }
}
