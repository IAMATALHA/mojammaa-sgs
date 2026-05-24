/**
 * Hook qui agrège les compteurs du dashboard admin depuis Firestore :
 *   - nombre d'élèves (collection eleves)
 *   - nombre de profs   (users where role='professeur' ou 'teacher')
 *   - nombre de classes (distinct sur eleves.classe)
 *   - taux de présence du jour
 *
 * Pas d'onSnapshot : un getDocs suffit. On expose
 * { loading, error, refresh } pour permettre un pull-to-refresh.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  collection, getDocs, query, where,
} from 'firebase/firestore'
import { db } from '../config/firebase'

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
      const [elevesSnap, usersSnap, absencesSnap] = await Promise.all([
        getDocs(collection(db, 'eleves')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
      ])
      const totalEleves   = elevesSnap.size
      let totalProfs      = 0
      const classeSet     = new Set<string>()
      
      elevesSnap.forEach(d => {
        const c = (d.data() as any).classe
        if (c) classeSet.add(String(c))
      })

      usersSnap.forEach(d => {
        const role = (d.data() as any).role
        if (role === 'professeur' || role === 'teacher') totalProfs += 1
      })

      let absentsToday = 0
      absencesSnap.forEach(d => {
        if ((d.data() as any).statut === 'absent') absentsToday += 1
      })

      const attendanceRate = totalEleves > 0
        ? Math.round(((totalEleves - absentsToday) / totalEleves) * 100)
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
