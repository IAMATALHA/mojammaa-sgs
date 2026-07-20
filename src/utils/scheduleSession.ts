import { dayName, parseHM } from './courseSchedule'

/**
 * Sous-ensemble commun aux créneaux du professeur affichés par l'app.
 * Les périodes S1… restent celles de l'établissement, jamais l'ordre
 * personnel des cours d'un enseignant.
 */
export interface ScheduleSessionSlot {
  day: string
  startTime: string
  endTime?: string | null
  durationMin?: number | null
  classe: string
  subject?: string | null
  room?: string | null
  seance?: string | null
}

const GLOBAL_SESSION_BY_START: Readonly<Record<string, string>> = {
  '08:30': 'S1',
  '09:30': 'S2',
  '09:40': 'S2', // rythme du vendredi
  '10:30': 'S3',
  '10:50': 'S3', // rythme du vendredi
  '11:30': 'S4',
  '13:00': 'S5',
  '14:00': 'S6',
}

/**
 * Résout la période globale d'un créneau. Une valeur explicite de l'EDT est
 * toujours prioritaire ; un horaire inconnu reste non configuré (null).
 */
export function resolveScheduleSessionCode(
  slot: Pick<ScheduleSessionSlot, 'seance' | 'startTime'>,
): string | null {
  const explicit = slot.seance?.trim()
  if (explicit) return /^s\d+$/i.test(explicit) ? explicit.toUpperCase() : explicit

  const start = slot.startTime.trim()
  return GLOBAL_SESSION_BY_START[start] ?? null
}

/** Clé déterministe d'un créneau exact de l'EDT professeur. */
export function scheduleLessonKey(slot: ScheduleSessionSlot): string {
  return [
    'v1',
    slot.day,
    slot.startTime,
    slot.endTime ?? '',
    slot.durationMin ?? '',
    slot.classe,
    slot.subject ?? '',
    slot.room ?? '',
  ].map(value => encodeURIComponent(String(value).trim())).join('|')
}

/**
 * Retrouve un créneau seulement si la clé désigne un résultat unique.
 * Une clé obsolète ou ambiguë ne doit jamais ouvrir un appel par défaut.
 */
export function findScheduleSlotByLessonKey<T extends ScheduleSessionSlot>(
  slots: readonly T[],
  lessonKey: string,
): T | null {
  if (!lessonKey) return null
  const matches = slots.filter(slot => scheduleLessonKey(slot) === lessonKey)
  return matches.length === 1 ? matches[0] : null
}

export function isScheduleSlotToday(
  slot: Pick<ScheduleSessionSlot, 'day'>,
  now = new Date(),
): boolean {
  return slot.day === dayName(now)
}

function endMinute(slot: ScheduleSessionSlot, start: number): number {
  const explicitEnd = parseHM(slot.endTime)
  if (!Number.isNaN(explicitEnd) && explicitEnd > start) return explicitEnd

  const duration = typeof slot.durationMin === 'number' && slot.durationMin > 0
    ? slot.durationMin
    : 60
  return start + duration
}

/**
 * Renvoie le créneau exact actuellement assuré par le professeur.
 * Si plusieurs créneaux se chevauchent, le résultat est volontairement null :
 * l'app ne choisit jamais arbitrairement une classe sensible.
 */
export function findCurrentScheduleSlot<T extends ScheduleSessionSlot>(
  slots: readonly T[],
  now = new Date(),
): T | null {
  const today = dayName(now)
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const matches = slots.filter(slot => {
    if (slot.day !== today) return false
    const start = parseHM(slot.startTime)
    if (Number.isNaN(start)) return false
    return currentMinute >= start && currentMinute < endMinute(slot, start)
  })

  return matches.length === 1 ? matches[0] : null
}
