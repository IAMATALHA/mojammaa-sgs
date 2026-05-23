/**
 * useParentAbsences — souscrit aux absences de tous les enfants du parent.
 * Convertit en AbsenceEntry pour ParentAbsencesScreen.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import { subscribeAbsencesForEleves, type AbsenceDoc } from '../services/absencesService'
import type { AbsenceEntry } from '../utils/mockData'

const SEANCE_TO_DURATION: Record<string, string> = {
  S1: '08:30-09:30',
  S2: '09:30-10:30',
  S3: '10:30-11:30',
  S4: '11:30-12:30',
  S5: '13:00-14:00',
  S6: '14:00-15:00',
}

function toEntry(a: AbsenceDoc): AbsenceEntry {
  return {
    id:        a.id || `${a.eleveId}_${a.date}_${a.seance}`,
    childId:   a.eleveId,
    date:      a.date,
    type:      'absence',
    duration:  SEANCE_TO_DURATION[a.seance] || a.seance,
    reason:    a.raison || '—',
    justified: !!a.justified,
  }
}

export interface ParentAbsencesData {
  loading:  boolean
  error:    string | null
  absences: AbsenceEntry[]
}

export function useParentAbsences(): ParentAbsencesData {
  const { profile } = useAuth()
  const [eleves,   setEleves]   = useState<EleveDoc[]>([])
  const [absences, setAbsences] = useState<AbsenceDoc[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.uid) { setLoading(false); return }
    const unsub = subscribeChildrenOfParent(profile.uid, setEleves)
    return unsub
  }, [profile?.uid])

  useEffect(() => {
    const ids = eleves.map(e => e.codeMassar)
    if (ids.length === 0) {
      setAbsences([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeAbsencesForEleves(
      ids,
      list => {
        setAbsences(list)
        setLoading(false)
        setError(null)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [eleves.map(e => e.codeMassar).join('|')])

  const entries = useMemo(
    () => absences
      .filter(a => a.statut === 'absent')
      .map(toEntry),
    [absences],
  )

  return { loading, error, absences: entries }
}
