/**
 * useClassLiveCourse — pour une classe donnée, renvoie le cours « en cours »
 * ou « à venir » aujourd'hui, recalculé chaque minute (temps réel).
 *
 * Données : collection `emploiDuTemps` (lisible parent). Si la classe n'a pas
 * encore d'EDT importé, `course` reste null et `hasSchedule` est false.
 */

import { useEffect, useMemo, useState } from 'react'
import { subscribeClassSchedule, type EmploiSlot } from '../services/emploiDuTempsService'
import { pickLiveCourse, type LiveCourse } from '../utils/courseSchedule'

export interface ClassLiveCourse {
  loading:     boolean
  hasSchedule: boolean       // la classe a au moins un créneau cette semaine
  course:      LiveCourse | null
}

export function useClassLiveCourse(classeId: string): ClassLiveCourse {
  const [slots,   setSlots]   = useState<EmploiSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    if (!classeId) { setSlots([]); setLoading(false); return }
    setLoading(true)
    const unsub = subscribeClassSchedule(
      classeId,
      list => { setSlots(list); setLoading(false) },
      ()   => { setSlots([]); setLoading(false) },
    )
    return unsub
  }, [classeId])

  // Re-tick chaque minute pour faire avancer le « cours en cours ».
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const course = useMemo(
    () => pickLiveCourse(slots, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, tick],
  )

  return { loading, hasSchedule: slots.length > 0, course }
}
