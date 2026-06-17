/**
 * courseSchedule — helpers purs pour déterminer le cours « en cours » /
 * « à venir » d'une classe à partir des créneaux `emploiDuTemps`.
 *
 * Le jour est stocké en anglais minuscule ('monday'…'sunday'), aligné sur la
 * source `schedules` (cf. scripts/syncEmploiDuTemps.js).
 */

export type WeekDay =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday'
  | 'thursday' | 'friday' | 'saturday'

// JS Date.getDay() : 0 = dimanche … 6 = samedi
const JS_DAY_TO_NAME: WeekDay[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

export function dayName(date: Date): WeekDay {
  return JS_DAY_TO_NAME[date.getDay()]
}

/** 'HH:MM' → minutes depuis minuit. Renvoie NaN si invalide. */
export function parseHM(hm?: string | null): number {
  if (!hm) return NaN
  const [h, m] = hm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN
  return h * 60 + m
}

export interface CourseSlot {
  classeId:      string
  day:           string
  startTime:     string
  endTime?:      string | null
  durationMin?:  number | null
  matiere?:      string | null
  salle?:        string | null
  professeurNom?: string | null
}

export type LiveStatus = 'now' | 'soon'

export interface LiveCourse {
  status: LiveStatus
  slot:   CourseSlot
}

/**
 * Parmi les créneaux d'une classe, renvoie :
 *   - le créneau en cours (start ≤ maintenant < end)  → status 'now'
 *   - sinon le prochain créneau du jour (start > maintenant) → status 'soon'
 *   - sinon null (journée finie / pas de cours aujourd'hui).
 */
export function pickLiveCourse(slots: CourseSlot[], now: Date = new Date()): LiveCourse | null {
  const today = dayName(now)
  const cur = now.getHours() * 60 + now.getMinutes()

  const todaySlots = slots
    .filter(s => s.day === today)
    .map(s => ({ s, start: parseHM(s.startTime), end: parseHM(s.endTime) }))
    .filter(x => !Number.isNaN(x.start))
    .sort((a, b) => a.start - b.start)

  // En cours : start ≤ cur < end (si pas d'end, on tolère start ≤ cur < start+60)
  for (const x of todaySlots) {
    const end = Number.isNaN(x.end) ? x.start + 60 : x.end
    if (cur >= x.start && cur < end) return { status: 'now', slot: x.s }
  }

  // À venir : premier créneau dont le start est dans le futur.
  for (const x of todaySlots) {
    if (x.start > cur) return { status: 'soon', slot: x.s }
  }

  return null
}
