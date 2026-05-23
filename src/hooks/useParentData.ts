/**
 * useParentData — agrège les données du parent connecté pour le dashboard.
 *
 * - Souscription temps réel aux `eleves` où `parentUid == uid du parent`
 * - Conversion EleveDoc → Child (forme attendue par ChildCard / mockData)
 *
 * Bulletins / homework / absences resteront en mock tant que les
 * collections Firestore correspondantes n'existent pas.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import {
  subscribeAbsencesForEleves, computeChildPresenceRate,
  type AbsenceDoc,
} from '../services/absencesService'
import type { Child } from '../utils/mockData'

export interface ParentData {
  loading:  boolean
  error:    string | null
  eleves:   EleveDoc[]   // raw Firestore docs (utile pour devoir/bulletin filtres)
  children: Child[]      // forme adaptée au composant ChildCard
}

// Couleurs d'avatars — palette restreinte cohérente avec le thème actuel
const AVATAR_COLORS = [
  '#E63946',  // coral
  '#1D3557',  // navy
  '#F77F00',  // orange
  '#457B9D',  // info blue
  '#FCBF49',  // yellow
]

function hashOf(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function eleveToChild(e: EleveDoc, absences: AbsenceDoc[]): Child {
  return {
    id:              e.codeMassar,
    firstName:       e.prenomLatin || e.prenom || '',
    lastName:        e.nomLatin    || e.nom    || '',
    classe:          e.classe      || '',
    level:           e.niveau      || 'Collège',
    avatarColor:     AVATAR_COLORS[hashOf(e.codeMassar) % AVATAR_COLORS.length],
    attendance:      computeChildPresenceRate(absences, e.codeMassar),
    averageGrade:    0,   // TODO : brancher quand bulletins existeront
    pendingHomework: 0,   // TODO : brancher quand collection devoirs existera
  }
}

export function useParentData(): ParentData {
  const { profile } = useAuth()
  const [eleves,   setEleves]   = useState<EleveDoc[]>([])
  const [absences, setAbsences] = useState<AbsenceDoc[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Subscribe to children
  useEffect(() => {
    if (!profile?.uid) {
      setEleves([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeChildrenOfParent(
      profile.uid,
      list => {
        setEleves(list)
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

  // Subscribe to absences for those children
  useEffect(() => {
    const ids = eleves.map(e => e.codeMassar)
    if (ids.length === 0) {
      setAbsences([])
      return
    }
    const unsub = subscribeAbsencesForEleves(ids, setAbsences)
    return unsub
  }, [eleves.map(e => e.codeMassar).join('|')])

  const children = useMemo(
    () => eleves.map(e => eleveToChild(e, absences)),
    [eleves, absences],
  )

  return { loading, error, eleves, children }
}
