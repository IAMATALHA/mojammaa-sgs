import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeSchedule, type WeeklySlot } from '../services/scheduleService'
import { findCurrentScheduleSlot } from '../utils/scheduleSession'

interface CurrentTeacherScheduleSlot {
  currentSlot: WeeklySlot | null
  loading: boolean
  hasSchedule: boolean
}

/** Créneau réellement en cours dans l'emploi du temps du professeur connecté. */
export function useCurrentTeacherScheduleSlot(): CurrentTeacherScheduleSlot {
  const { user } = useAuth()
  const [slots, setSlots] = useState<WeeklySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user?.uid) {
      setSlots([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    return subscribeSchedule(
      user.uid,
      schedule => {
        setSlots(schedule?.weeklySlots ?? [])
        setLoading(false)
      },
      () => {
        setSlots([])
        setLoading(false)
      },
    )
  }, [user?.uid])

  useEffect(() => {
    const id = setInterval(() => setTick(value => value + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const currentSlot = useMemo(
    () => findCurrentScheduleSlot(slots, new Date()),
    [slots, tick],
  )

  return { currentSlot, loading, hasSchedule: slots.length > 0 }
}
