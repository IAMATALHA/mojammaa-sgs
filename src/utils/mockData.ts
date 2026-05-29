/**
 * Mock data for the new dashboards.
 *
 * Lives outside the React tree on purpose so screens stay readable
 * and we can later swap any of these arrays for a real Firestore
 * query without touching the UI.
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

// ── Today's date helper ──────────────────────────────────────────────────
const today = () => new Date().toISOString()
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

// ── Teacher dashboard ────────────────────────────────────────────────────
export const TEACHER_KPIS = {
  classes:    3,
  students:   78,
  attendance: 92,    // percentage
  pending:    12,    // pending tasks/reviews
}



// ── Parent dashboard ─────────────────────────────────────────────────────
export const PARENT_CHILDREN: Child[] = [
  {
    id: 'c1',
    firstName: 'Omar',
    lastName:  'Hassan',
    classe:    '6ème A',
    level:     'Collège',
    avatarColor: '#E53935',
    attendance: 93,
    averageGrade: 15.4,
    pendingHomework: 2,
  },
  {
    id: 'c2',
    firstName: 'Laila',
    lastName:  'Hassan',
    classe:    '3ème B',
    level:     'Collège',
    avatarColor: '#FFC107',
    attendance: 97,
    averageGrade: 16.8,
    pendingHomework: 1,
  },
]

// Mock data constants removed — parent screens now use real Firestore data

export const PARENT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'pqa1', label: 'Voir bulletin',   labelKey: 'actions.viewBulletin',    icon: 'graduation-cap', tint: 'primary' },
  { id: 'pqa2', label: 'Absences',        labelKey: 'actions.absences',        icon: 'calendar-x',     tint: 'warning' },
  { id: 'pqa3', label: 'Devoirs',         labelKey: 'actions.homework',        icon: 'book-open',      tint: 'info'    },
  { id: 'pqa4', label: 'Contacter prof',  labelKey: 'actions.contactTeacher',  icon: 'message-circle', tint: 'success' },
]

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

// PARENT_REPORTS removed — ParentNotesScreen now uses real Firestore notes

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

export const PARENT_ABSENCES: AbsenceEntry[] = [
  { id: 'ab1', childId: 'c1', date: inDays(-2),  type: 'absence', duration: 'Matin',   reason: 'Maladie',         justified: true  },
  { id: 'ab2', childId: 'c1', date: inDays(-10), type: 'retard',  duration: '15 min',  reason: 'Trafic',          justified: true  },
  { id: 'ab3', childId: 'c1', date: inDays(-25), type: 'absence', duration: 'Journée', reason: 'Rendez-vous médical', justified: true },
  { id: 'ab4', childId: 'c2', date: inDays(-7),  type: 'retard',  duration: '10 min',  reason: '—',               justified: false },
  { id: 'ab5', childId: 'c2', date: inDays(-15), type: 'depart',  duration: '14h00',   reason: 'RDV famille',     justified: true  },
]
