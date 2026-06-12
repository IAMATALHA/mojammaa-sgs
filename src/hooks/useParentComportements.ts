/**
 * useParentComportements — souscrit aux mérites/avertissements de tous les
 * enfants du parent (même mécanique que useParentAbsences : ids = codeMassar).
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import { subscribeComportementsForEleves, type ComportementDoc } from '../services/comportementsService'

export interface ParentComportementsData {
  loading: boolean
  error:   string | null
  entries: ComportementDoc[]   // triées du plus récent au plus ancien
}

export function useParentComportements(): ParentComportementsData {
  const { profile } = useAuth()
  const [eleves,  setEleves]  = useState<EleveDoc[]>([])
  const [entries, setEntries] = useState<ComportementDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setLoading(false); return }
    const unsub = subscribeChildrenOfParent(profile.uid, setEleves)
    return unsub
  }, [profile?.uid])

  useEffect(() => {
    const ids = eleves.map(e => e.codeMassar)
    if (ids.length === 0) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeComportementsForEleves(
      ids,
      list => { setEntries(list); setLoading(false); setError(null) },
      err  => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [eleves.map(e => e.codeMassar).join('|')])

  const sorted = useMemo(
    () => [...entries].sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ),
    [entries],
  )

  return { loading, error, entries: sorted }
}
