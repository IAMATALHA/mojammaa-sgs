/**
 * Shared dashboard types + static quick-action config.
 *
 * (Anciennement mockData.ts — les tableaux de données factices ont été
 * supprimés ; les écrans lisent du vrai Firestore. Ne restent que les
 * types partagés et la config statique des quick actions.)
 */

// ── Shared types ─────────────────────────────────────────────────────────
export type ScheduleStatus = 'upcoming' | 'now' | 'done'
export type Priority       = 'normal' | 'urgent'

export interface ScheduleEntry {
  id:        string
  subject:   string
  classe:    string
  room:      string
  startTime: string   // "08:30"
  endTime:   string   // "09:30"
  status:    ScheduleStatus
}

export interface Announcement {
  id:       string
  title:    string
  body:     string
  author:   string
  date:     string   // ISO date string
  priority: Priority
  category: 'school' | 'staff' | 'event' | 'admin'
  image?:   string   // URL de l'affiche (1ʳᵉ pièce jointe image du message)
}

export interface Child {
  id:           string
  firstName:    string
  lastName:     string
  classe:       string
  level:        string
  avatarColor:  string
  attendance:   number   // 0-100
  averageGrade: number   // 0-20 (FR) — keep 0-100 if you prefer
  pendingHomework: number
}

export interface HomeworkItem {
  id:        string
  subject:   string
  title:     string
  dueDate:   string  // ISO date
  childId:   string
  status:    'pending' | 'submitted' | 'graded'
}

export interface UpcomingEvent {
  id:    string
  title: string
  date:  string  // ISO date
  time?: string
  location?: string
  type:  'meeting' | 'holiday' | 'exam' | 'event'
}

export interface QuickAction {
  id:        string
  label:     string
  labelKey?: string
  icon:      string  // lucide-react-native icon name
  tint:      'primary' | 'accent' | 'success' | 'info' | 'warning'
  badge?:    number | string
}

export interface ClassPerformance {
  classe:  string
  average: number   // 0-20
  topMark: number
  trend:   'up' | 'down' | 'flat'
}

// ── Bulletin / notes ─────────────────────────────────────────────────────
export interface SubjectGrade {
  subject:    string
  teacher:    string
  average:    number   // 0-20
  classAvg:   number   // 0-20
  trend:      'up' | 'down' | 'flat'
  comment?:   string
}

export interface ChildReport {
  childId:     string
  term:        string     // "2ème trimestre"
  generalAvg:  number     // 0-20
  rank:        string     // "3 / 28"
  honor?:      'felicitations' | 'encouragements' | 'avertissement' | null
  subjects:    SubjectGrade[]
}

// ── Absences ─────────────────────────────────────────────────────────────
export interface AbsenceEntry {
  id:        string
  childId:   string
  date:      string   // ISO
  type:      'absence' | 'retard' | 'depart'
  duration:  string   // "Journée" / "Matin" / "1h"
  reason:    string
  justified: boolean
}

// ── Quick actions (config statique, pas du mock) ─────────────────────────
export const PARENT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'pqa1', label: 'Performance',      labelKey: 'actions.performance',  icon: 'bar-chart-3',     tint: 'primary' },
  { id: 'pqa2', label: 'Absences',         labelKey: 'actions.absences',     icon: 'calendar-x',      tint: 'warning' },
  { id: 'pqa3', label: 'Devoirs',          labelKey: 'actions.homework',     icon: 'book-open',       tint: 'info'    },
  { id: 'pqa4', label: 'Messages',         labelKey: 'actions.messages',     icon: 'message-circle',  tint: 'success' },
  { id: 'pqa5', label: 'Ressources',       labelKey: 'actions.resources',    icon: 'folder-open',     tint: 'accent'  },
  { id: 'pqa6', label: 'Emploi du temps',  labelKey: 'actions.schedule',     icon: 'calendar-clock',  tint: 'primary' },
]
