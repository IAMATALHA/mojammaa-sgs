import { useEffect, useState } from 'react'
import { subscribePrayerClassSession } from '../services/prayer-class-service'
import type { PrayerClassSession } from '../types/prayer'
import type { ServiceDate } from '../types/pickup'

function timestampMillis(session: PrayerClassSession): number {
  return typeof session.updatedAt?.toMillis === 'function' ? session.updatedAt.toMillis() : 0
}

/**
 * Retrouve une éventuelle classe encore en déplacement parmi les classes du
 * professeur. Une requête bornée par classe respecte les Firestore Rules.
 */
export function useTeacherPrayerActivity(
  classes: string[],
  serviceDate: ServiceDate,
  actorUid?: string,
): { activeSession: PrayerClassSession | null; sessions: PrayerClassSession[] } {
  const [activity, setActivity] = useState<{
    activeSession: PrayerClassSession | null
    sessions: PrayerClassSession[]
  }>({ activeSession: null, sessions: [] })
  const classKey = classes.join('|')

  useEffect(() => {
    const uniqueClasses = [...new Set(classes.map(value => value.trim()).filter(Boolean))]
    if (uniqueClasses.length === 0) {
      setActivity({ activeSession: null, sessions: [] })
      return
    }

    let mounted = true
    const byClass = new Map<string, PrayerClassSession>()
    const emit = () => {
      if (!mounted) return
      const sessions = [...byClass.values()]
      const active = sessions
        .filter(session => session.status !== 'returned'
          && (!actorUid || session.startedByUid === actorUid))
        .sort((a, b) => timestampMillis(b) - timestampMillis(a))[0] ?? null
      setActivity({ activeSession: active, sessions })
    }

    const unsubscribes = uniqueClasses.map(classe => subscribePrayerClassSession(
      serviceDate,
      classe,
      session => {
        if (session) byClass.set(classe, session)
        else byClass.delete(classe)
        emit()
      },
      () => {
        byClass.delete(classe)
        emit()
      },
    ))

    return () => {
      mounted = false
      unsubscribes.forEach(unsubscribe => unsubscribe())
    }
    // `classKey` rend le tableau stable sans relancer sur une nouvelle
    // référence contenant exactement les mêmes classes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorUid, classKey, serviceDate])

  return activity
}
