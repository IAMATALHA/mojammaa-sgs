/**
 * useTeacherData — agrège les données du prof connecté pour le dashboard.
 *
 * Lit le profil utilisateur (role + classes), souscrit en temps réel à
 * la collection `eleves` filtrée sur ces classes, et calcule les KPIs.
 *
 * Présence et "à traiter" : placeholders pour l'instant (collections
 * `absences` / `devoirs` non encore peuplées). On les branchera quand
 * les données existeront.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeEleves, groupByClasse, type EleveDoc } from '../services/elevesService'

export interface TeacherKpis {
  classes:    number
  students:   number
  attendance: number   // % — placeholder à 0 tant que pas de data
  pending:    number   // placeholder à 0
}

export interface TeacherData {
  loading:   boolean
  error:     string | null
  eleves:    EleveDoc[]
  byClasse:  Record<string, EleveDoc[]>
  classes:   string[]
  kpis:      TeacherKpis
}

function getClassesFromProfile(profile: any): string[] {
  if (!profile) return []
  if (Array.isArray(profile.classes) && profile.classes.length > 0) return profile.classes
  if (typeof profile.classe === 'string' && profile.classe) return [profile.classe]
  return []
}

export function useTeacherData(): TeacherData {
  const { profile } = useAuth()
  const [eleves,  setEleves]  = useState<EleveDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const classes = useMemo(() => getClassesFromProfile(profile), [profile])

  useEffect(() => {
    if (classes.length === 0) {
      setEleves([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeEleves(
      classes,
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
  }, [classes.join('|')])

  const byClasse = useMemo(() => groupByClasse(eleves), [eleves])

  const kpis: TeacherKpis = useMemo(() => ({
    classes:    classes.length,
    students:   eleves.length,
    attendance: 0,   // TODO : brancher sur la collection absences
    pending:    0,   // TODO : brancher sur la collection devoirs
  }), [classes.length, eleves.length])

  return { loading, error, eleves, byClasse, classes, kpis }
}
