/**
 * useTeacherData — agrège les données du prof connecté pour le dashboard.
 *
 * - Profil utilisateur (role + classes)
 * - Souscription temps réel à la collection `eleves` filtrée par classes
 * - Souscription temps réel à `schedules/<uid>` (l'EDT hebdomadaire)
 * - Calcul des KPIs + des créneaux du jour avec statut now/done/upcoming
 *
 * Présence et "à traiter" : placeholders pour l'instant (collections
 * `absences` / `devoirs` non encore peuplées).
 */

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { subscribeEleves, groupByClasse, type EleveDoc } from '../services/elevesService'
import {
  subscribeSchedule, type ScheduleDoc, type WeeklySlot, type WeekDay,
} from '../services/scheduleService'
import { computeTeacherPresenceRate } from '../services/absencesService'
import { toDoc } from '../services/firestore'
import { db } from '../config/firebase'
import type { UserProfile } from '../types'
import type { ScheduleEntry, ScheduleStatus } from '../utils/dashboardTypes'
import { currentAcademicPeriod, localISODate } from '../utils/academicPeriod'

export interface TeacherKpis {
  classes:    number
  students:   number
  attendance: number   // % — placeholder à 0 tant que pas de data
  pending:    number   // placeholder à 0
}

export interface TeacherData {
  loading:          boolean
  error:            string | null
  eleves:           EleveDoc[]
  byClasse:         Record<string, EleveDoc[]>
  classes:          string[]
  kpis:             TeacherKpis
  schedule:         ScheduleDoc | null
  todaySlots:       ScheduleEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

const DAY_NAMES: WeekDay[] = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
]

function todayDayName(now = new Date()): WeekDay {
  return DAY_NAMES[now.getDay()]
}

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number)
  return { h: h || 0, m: m || 0 }
}

function statusOf(slot: WeeklySlot, now: Date): ScheduleStatus {
  const start = new Date(now)
  const end   = new Date(now)
  const { h: sh, m: sm } = parseHM(slot.startTime)
  const { h: eh, m: em } = parseHM(slot.endTime)
  start.setHours(sh, sm, 0, 0)
  end.setHours(eh, em, 0, 0)
  if (now >= end)   return 'done'
  if (now >= start) return 'now'
  return 'upcoming'
}

function toScheduleEntry(
  slot: WeeklySlot, idx: number, status: ScheduleStatus, subject: string,
): ScheduleEntry & { seance?: string } {
  return {
    id:        `${slot.day}-${slot.startTime}-${idx}`,
    subject:   slot.subject || subject,
    classe:    slot.classe,
    room:      slot.room || '—',
    startTime: slot.startTime,
    endTime:   slot.endTime,
    status,
    seance:    slot.seance,
  }
}

function getClassesFromProfile(profile: UserProfile | null | undefined): string[] {
  if (!profile) return []
  if (Array.isArray(profile.classes) && profile.classes.length > 0) return profile.classes
  if (typeof profile.classe === 'string' && profile.classe) return [profile.classe]
  return []
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useTeacherData(): TeacherData {
  const period = currentAcademicPeriod()
  const { profile } = useAuth()
  const [eleves,           setEleves]          = useState<EleveDoc[]>([])
  const [schedule,         setSchedule]        = useState<ScheduleDoc | null>(null)
  const [presence,         setPresence]        = useState<number>(100)
  const [pendingCount,     setPendingCount]    = useState<number>(0)
  const [loading,          setLoading]         = useState(true)
  const [error,            setError]           = useState<string | null>(null)
  const [tick,             setTick]            = useState(0)

  const classes = useMemo(() => getClassesFromProfile(profile), [profile])

  // Subscribe to eleves
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

  // Subscribe to schedule
  useEffect(() => {
    if (!profile?.uid) {
      setSchedule(null)
      return
    }
    const unsub = subscribeSchedule(
      profile.uid,
      doc => setSchedule(doc),
      err => setError(err.message),
    )
    return unsub
  }, [profile?.uid])

  // Re-render every minute so the `now` / `done` status stays accurate
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Presence rate: only recompute on mount or when classes change (not every tick)
  useEffect(() => {
    if (classes.length === 0) {
      setPresence(100)
      return
    }
    computeTeacherPresenceRate(classes)
      .then(setPresence)
      .catch(() => setPresence(100))
  }, [classes.join('|')])

  // Count pending devoirs (dateLimite >= today)
  useEffect(() => {
    if (!profile?.uid) { setPendingCount(0); return }
    const today = localISODate()
    getDocs(query(
      collection(db, 'devoirs'),
      where('teacherId', '==', profile.uid),
      where('academicYear', '==', period.academicYear),
      where('monthKey', '==', period.monthKey),
    )).then(snap => {
      const count = snap.docs.filter(d => {
        const dl = toDoc<{ dateLimite?: string }>(d).dateLimite
        return typeof dl === 'string' && dl >= today
      }).length
      setPendingCount(count)
    }).catch(() => setPendingCount(0))
  }, [profile?.uid, period.academicYear, period.monthKey])

  const byClasse = useMemo(() => groupByClasse(eleves), [eleves])

  const subject = profile?.matiere || 'Mathématiques'

  const todaySlots: ScheduleEntry[] = useMemo(() => {
    if (!schedule?.weeklySlots) return []
    const now   = new Date()
    const today = todayDayName(now)
    return schedule.weeklySlots
      .filter(s => s.day === today)
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot, idx) => toScheduleEntry(slot, idx, statusOf(slot, now), subject))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, subject, tick])

  const kpis: TeacherKpis = useMemo(() => ({
    classes:    classes.length,
    students:   eleves.length,
    attendance: presence,
    pending:    pendingCount,
  }), [classes.length, eleves.length, presence, pendingCount])

  return {
    loading,
    error,
    eleves,
    byClasse,
    classes,
    kpis,
    schedule,
    todaySlots,
  }
}
