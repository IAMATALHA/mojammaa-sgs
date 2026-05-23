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
  id:       string
  label:    string
  icon:     string  // lucide-react-native icon name
  tint:     'primary' | 'accent' | 'success' | 'info' | 'warning'
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

export const TEACHER_SCHEDULE: ScheduleEntry[] = [
  { id: 's1', subject: 'Mathématiques',  classe: '6ème A', room: 'Salle 12', startTime: '08:30', endTime: '09:30', status: 'done' },
  { id: 's2', subject: 'Algèbre',        classe: '5ème B', room: 'Salle 12', startTime: '09:40', endTime: '10:40', status: 'now' },
  { id: 's3', subject: 'Géométrie',      classe: '4ème C', room: 'Salle 14', startTime: '11:00', endTime: '12:00', status: 'upcoming' },
  { id: 's4', subject: 'Atelier maths',  classe: '6ème A', room: 'Salle 03', startTime: '14:00', endTime: '15:00', status: 'upcoming' },
]

export const TEACHER_ANNOUNCEMENTS: Announcement[] = [
  { id: 'a1', title: 'Réunion pédagogique', body: 'Salle des profs — 16h00. Bilan trimestre + planification.', author: 'Direction', date: today(),     priority: 'urgent', category: 'staff'  },
  { id: 'a2', title: 'Cantine — nouveau menu', body: 'Le menu hebdomadaire est disponible dans l\'app.',          author: 'Admin',     date: inDays(-1),  priority: 'normal', category: 'school' },
  { id: 'a3', title: 'Sortie scolaire 6ème A', body: 'Validation des autorisations parents avant vendredi.',      author: 'CPE',       date: inDays(-2),  priority: 'normal', category: 'event'  },
]

export const TEACHER_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa1', label: 'Faire l\'appel',   icon: 'check-circle',  tint: 'primary' },
  { id: 'qa2', label: 'Saisir une note',  icon: 'pencil-line',   tint: 'accent'  },
  { id: 'qa3', label: 'Nouveau devoir',   icon: 'book-open',     tint: 'info'    },
  { id: 'qa4', label: 'Envoyer message',  icon: 'send',          tint: 'success' },
]

export const CLASS_PERFORMANCE: ClassPerformance[] = [
  { classe: '6ème A', average: 14.2, topMark: 18.5, trend: 'up'   },
  { classe: '5ème B', average: 12.6, topMark: 17.0, trend: 'flat' },
  { classe: '4ème C', average: 13.4, topMark: 19.0, trend: 'up'   },
]

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

export const PARENT_RECENT_HOMEWORK: HomeworkItem[] = [
  { id: 'h1', subject: 'Mathématiques',  title: 'Exercices ch. 4',     dueDate: inDays(1),  childId: 'c1', status: 'pending'   },
  { id: 'h2', subject: 'Sciences',       title: 'Projet écosystème',   dueDate: inDays(3),  childId: 'c1', status: 'pending'   },
  { id: 'h3', subject: 'Arabe',          title: 'Lecture & résumé',    dueDate: inDays(-1), childId: 'c2', status: 'submitted' },
  { id: 'h4', subject: 'Histoire',       title: 'Frise chronologique', dueDate: inDays(2),  childId: 'c2', status: 'pending'   },
]

export const PARENT_ANNOUNCEMENTS: Announcement[] = [
  { id: 'pa1', title: 'Réunion parents-profs',   body: 'Jeudi 18h — salle polyvalente. Inscription requise.',     author: 'Direction', date: today(),    priority: 'urgent', category: 'event'  },
  { id: 'pa2', title: 'Bulletins disponibles',   body: 'Le bulletin du 2ème trimestre est consultable dans l\'app.', author: 'Admin',   date: inDays(-1), priority: 'normal', category: 'school' },
  { id: 'pa3', title: 'Vacances de printemps',   body: 'Du 8 au 22 avril inclus. Bon repos !',                     author: 'Direction', date: inDays(-3), priority: 'normal', category: 'admin'  },
]

export const PARENT_UPCOMING_EVENTS: UpcomingEvent[] = [
  { id: 'e1', title: 'Réunion parents',       date: inDays(2),  time: '18:00', location: 'Salle polyvalente', type: 'meeting' },
  { id: 'e2', title: 'Examen blanc',          date: inDays(5),  time: '08:30', location: '6ème A',            type: 'exam'    },
  { id: 'e3', title: 'Sortie Musée',          date: inDays(8),  time: '09:00', location: 'Centre ville',      type: 'event'   },
  { id: 'e4', title: 'Vacances de printemps', date: inDays(14),                                                type: 'holiday' },
]

export const PARENT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'pqa1', label: 'Voir bulletin',   icon: 'graduation-cap', tint: 'primary' },
  { id: 'pqa2', label: 'Absences',        icon: 'calendar-x',     tint: 'warning' },
  { id: 'pqa3', label: 'Devoirs',         icon: 'book-open',      tint: 'info'    },
  { id: 'pqa4', label: 'Contacter prof',  icon: 'message-circle', tint: 'success' },
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

export const PARENT_REPORTS: ChildReport[] = [
  {
    childId:    'c1',
    term:       '2ème trimestre',
    generalAvg: 15.4,
    rank:       '5 / 28',
    honor:      'encouragements',
    subjects: [
      { subject: 'Mathématiques', teacher: 'M. Tazi',     average: 16.5, classAvg: 13.2, trend: 'up',   comment: 'Excellent travail, continue ainsi.' },
      { subject: 'Français',      teacher: 'Mme Bennani', average: 14.0, classAvg: 12.8, trend: 'flat' },
      { subject: 'Arabe',         teacher: 'M. Idrissi',  average: 17.0, classAvg: 14.4, trend: 'up',   comment: 'Très bon niveau à l\'oral.' },
      { subject: 'Anglais',       teacher: 'Ms. Carter',  average: 15.2, classAvg: 13.5, trend: 'up' },
      { subject: 'Sciences',      teacher: 'M. Alami',    average: 14.5, classAvg: 13.0, trend: 'down', comment: 'Quelques notions à revoir.' },
      { subject: 'Histoire-Géo',  teacher: 'Mme Sefrioui',average: 15.0, classAvg: 13.4, trend: 'flat' },
      { subject: 'EPS',           teacher: 'M. Lahlou',   average: 16.0, classAvg: 14.5, trend: 'up' },
    ],
  },
  {
    childId:    'c2',
    term:       '2ème trimestre',
    generalAvg: 16.8,
    rank:       '2 / 30',
    honor:      'felicitations',
    subjects: [
      { subject: 'Mathématiques', teacher: 'Mme Rachidi', average: 17.5, classAvg: 13.8, trend: 'up',   comment: 'Élève brillante.' },
      { subject: 'Français',      teacher: 'M. Bensaïd',  average: 16.2, classAvg: 13.0, trend: 'up' },
      { subject: 'Arabe',         teacher: 'Mme Fassi',   average: 18.0, classAvg: 15.0, trend: 'up',   comment: 'Niveau remarquable.' },
      { subject: 'Anglais',       teacher: 'Mr. Brown',   average: 16.8, classAvg: 14.0, trend: 'flat' },
      { subject: 'Sciences',      teacher: 'Mme Naciri',  average: 16.5, classAvg: 13.6, trend: 'up' },
      { subject: 'Histoire-Géo',  teacher: 'M. Tahiri',   average: 16.0, classAvg: 13.2, trend: 'flat' },
      { subject: 'EPS',           teacher: 'Mme Saidi',   average: 17.0, classAvg: 14.8, trend: 'up' },
    ],
  },
]

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
