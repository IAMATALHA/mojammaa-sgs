/**
 * Hook qui agrège les compteurs du dashboard admin depuis Firestore :
 *   - nombre d'élèves (collection eleves)
 *   - nombre de profs   (users where role='professeur')
 *   - nombre de classes (distinct sur eleves.classe)
 *   - taux de présence du jour
 *
 * Pas d'onSnapshot : un getDocs / getCountFromServer suffit. On expose
 * { loading, error, refresh } pour permettre un pull-to-refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  collection, getCountFromServer, getDocs, query, where,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDoc } from '../services/firestore'
import type { EleveDoc } from '../services/elevesService'
import type { AbsenceDoc } from '../services/absencesService'

export interface DashboardStats {
  totalEleves:    number
  totalProfs:     number
  totalClasses:   number
  attendanceRate: number  // pourcentage 0..100
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function useDashboardStats() {
  const [stats,   setStats]   = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const today = todayISO()
      // Pour éviter un index composé Firestore (date + statut), on lit
      // toutes les absences du jour puis on filtre localement par statut.
      const [elevesSnap, profsCount, absencesSnap] = await Promise.all([
        getDocs(collection(db, 'eleves')),
        getCountFromServer(query(collection(db, 'users'),    where('role', '==', 'professeur'))),
        getDocs(            query(collection(db, 'absences'), where('date', '==', today))),
      ])
      const totalEleves = elevesSnap.size
      const totalProfs  = profsCount.data().count
      const classeSet   = new Set<string>()
      elevesSnap.forEach(d => {
        const c = toDoc<EleveDoc>(d).classe
        if (c) classeSet.add(String(c))
      })

      // Comptage local des absents — unique par eleveId (pas de double
      // compte si l'élève est absent à plusieurs séances).
      const absentEleves = new Set<string>()
      absencesSnap.forEach(d => {
        const data = toDoc<AbsenceDoc>(d)
        if (data.statut === 'absent' && data.eleveId) {
          absentEleves.add(String(data.eleveId))
        }
      })

      const attendanceRate = totalEleves > 0
        ? Math.round(((totalEleves - absentEleves.size) / totalEleves) * 100)
        : 100

      setStats({
        totalEleves,
        totalProfs,
        totalClasses: classeSet.size,
        attendanceRate,
      })
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les données.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { stats, loading, error, refresh: load }
}
