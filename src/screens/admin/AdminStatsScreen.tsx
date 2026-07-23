import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl, Modal,
} from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle, Award, BarChart3, BookOpen, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Filter, TrendingUp, Users, X, type LucideIcon,
} from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { palette, chartColors } from '../../theme/designTokens'
import { functions } from '../../config/firebase'
import type { AdminDashboardNav } from '../../navigation/types'
import type {
  AppliedScope, StatsCycle, StatsFilterKey, StatsPeriod, StatsScope,
} from '../../types/stats'

type CollectionName = 'eleves' | 'users' | 'notes' | 'absences' | 'devoirs'
type StatsView = 'niveaux' | 'subjects'
type StatsAction = 'absences' | 'devoirs' | 'niveaux' | 'subjects'
/** Les quatre KPI du hero, chacun avec un écran de détail au même périmètre. */
type ReportTile = 'students' | 'attendance' | 'average' | 'followup'
type NotesTarget = { matiere?: string; classe?: string }
type StatsFilters = StatsScope

interface FilterOption {
  value: string
  label: string
}

interface StatsFilterOptions {
  niveaux: string[]
  classes: string[]
  matieres: FilterOption[]
}

interface EleveRow {
  id: string
  classe: string
  niveau: string
}

interface UserRow {
  id: string
  role: string
}

interface NoteRow {
  id: string
  eleveId: string
  classe: string
  subject: string
  matiere: string
  note: number | null
  cycle: string
  bareme: number | null
  importedBy: string
}

/** settings/coefficients — miroir de CoefConfig dans mojammaa-admin/src/pages/Statistiques.tsx. */
interface CoefConfig {
  matieres: Record<string, number>
  parNiveau: Record<string, Record<string, number>>
}

interface AbsenceRow {
  id: string
  eleveId: string
  classe: string
  date: string
  statut: string
  professorId: string
}

interface DevoirRow {
  id: string
  classeId: string
  teacherId: string
  dateLimite: string
}

interface TrendPoint {
  label: string
  value: number
}

interface GradeBand {
  label: string
  value: number
  color: string
}

interface ClassStats {
  name: string
  niveau: string
  niveauGroup?: string
  studentCount: number
  presenceRate: number | null
  attendanceCount?: number
  avgNote: number | null
  successRate: number | null
  absencesToday: number
  incidentsMonth: number
  activeHomework: number
  subjectsCovered: number
  notesCount: number
  gradedStudents: number
  passingStudents: number
  healthScore: number
  trend: TrendPoint[]
}

interface SubjectStats {
  name: string
  notesCount: number
  classesCount: number
  avgNote: number | null
  successRate: number | null
  below10Count: number
  strongestClass: string
  weakestClass: string
  heatScore: number
}

interface NiveauStats {
  name: string
  classCount: number
  studentCount: number
  avgNote: number | null
  successRate: number | null
  presenceRate: number | null
  incidentsMonth: number
}

interface DashboardData {
  totalEleves: number
  totalClasses: number
  totalTeachers: number
  totalParents: number
  absentsToday: number
  retardsToday: number
  presenceRate: number | null
  attendanceCount?: number
  avgNote: number | null
  successRate: number | null
  studentsToFollow?: number
  notesCount: number
  activeHomework: number
  absenceTrend: TrendPoint[]
  gradeDistribution: GradeBand[]
  classStats: ClassStats[]
  subjectStats: SubjectStats[]
  niveauStats: NiveauStats[]
}

interface SnapshotCache {
  eleves: EleveRow[]
  users: UserRow[]
  notes: NoteRow[]
  absences: AbsenceRow[]
  devoirs: DevoirRow[]
  coefficients: CoefConfig
}

const COLLECTIONS: CollectionName[] = ['eleves', 'users', 'notes', 'absences', 'devoirs']
const RING_SM = 74
const INITIAL_FILTERS: StatsFilters = {
  period: 'mois',
  cycle: '',
  niveau: '',
  classe: '',
  matiere: '',
}
const EMPTY_FILTER_OPTIONS: StatsFilterOptions = { niveaux: [], classes: [], matieres: [] }

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function monthStartISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function lastDays(count: number): { iso: string; label: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date()
    d.setDate(d.getDate() - (count - 1 - index))
    return {
      iso: d.toISOString().split('T')[0],
      label: String(d.getDate()).padStart(2, '0'),
    }
  })
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function isAbsent(row: AbsenceRow): boolean {
  return row.statut === 'absent'
}

function isLate(row: AbsenceRow): boolean {
  return row.statut === 'retard' || row.statut === 'late'
}

function isActiveHomework(row: DevoirRow, today: string): boolean {
  return !row.dateLimite || row.dateLimite >= today
}

function formatNote(value: number | null): string {
  return value == null ? '—' : `${value}/20`
}

function usesTenPointScale(scope: Pick<StatsScope, 'cycle' | 'niveau' | 'classe'>): boolean {
  return scope.cycle === 'primaire' || /aep/i.test(scope.niveau) || /aep/i.test(scope.classe)
}

function baremeFromNote(row: Pick<NoteRow, 'bareme' | 'cycle' | 'classe'>): 10 | 20 {
  if (row.bareme === 10 || row.bareme === 20) return row.bareme
  if (row.cycle.toLowerCase() === 'primaire') return 10
  return /aep/i.test(row.classe) ? 10 : 20
}

function normalizeNoteOn20(row: NoteRow): NoteRow | null {
  if (row.note == null) return null
  const bareme = baremeFromNote(row)
  if (row.note < 0 || row.note > bareme) return null
  return { ...row, note: row.note * (20 / bareme), bareme: 20 }
}

/**
 * Coefficients marocains (settings/coefficients) — miroir exact de coefOf()
 * dans mojammaa-admin/src/pages/Statistiques.tsx et de makeCoefOf() dans
 * functions/schoolStats.js : parNiveau[niveau][matiere] > matieres[matiere] > 1.
 */
function makeCoefOf(coefficients: CoefConfig) {
  return (matiere: string, niveau?: string): number => {
    const n = niveau ? coefficients.parNiveau[niveau]?.[matiere] : undefined
    if (n !== undefined && n > 0) return n
    const g = coefficients.matieres[matiere]
    return g > 0 ? g : 1
  }
}

/** Moyenne pondérée Σ(note×coef)/Σ(coef) — replie sur la moyenne simple si aucun coef. */
function weightedAvg(pairs: { v: number; c: number }[]): number {
  const totalCoef = pairs.reduce((sum, p) => sum + p.c, 0)
  if (totalCoef <= 0) return pairs.reduce((sum, p) => sum + p.v, 0) / pairs.length
  return pairs.reduce((sum, p) => sum + p.v * p.c, 0) / totalCoef
}

function bubbleSize(count: number, minCount: number, maxCount: number): number {
  if (maxCount <= minCount) return 44
  const normalized = (count - minCount) / (maxCount - minCount)
  return Math.round(30 + clamp(normalized, 0, 1) * 34)
}

function gradeBands(notes: NoteRow[]): GradeBand[] {
  return [
    { label: '<8', value: notes.filter(row => row.note! < 8).length, color: palette.danger },
    { label: '8-10', value: notes.filter(row => row.note! >= 8 && row.note! < 10).length, color: palette.orange },
    { label: '10-14', value: notes.filter(row => row.note! >= 10 && row.note! < 14).length, color: palette.brandInk },
    { label: '14+', value: notes.filter(row => row.note! >= 14).length, color: palette.success },
  ]
}

function scoreColor(score: number, theme: Theme): string {
  if (score >= 76) return theme.info
  if (score >= 58) return theme.warning
  return theme.danger
}

function noteHeatColor(note: number | null, theme: Theme): string {
  if (note == null) return theme.surfaceAlt
  if (note >= 14) return theme.infoSurface
  if (note >= 10) return theme.primarySurface
  if (note >= 8) return theme.warningSurface
  return theme.dangerSurface
}

function noteTextColor(note: number | null, theme: Theme): string {
  if (note == null) return theme.textMuted
  if (note >= 14) return theme.info
  if (note >= 10) return theme.primary
  if (note >= 8) return theme.warning
  return theme.danger
}

function buildDashboardData(cache: SnapshotCache): DashboardData {
  const today = todayISO()
  const monthStart = monthStartISO()
  const validNotes = cache.notes
    .map(normalizeNoteOn20)
    .filter((row): row is NoteRow => row != null && row.note != null && row.note >= 0 && row.note <= 20)
  const eleveNiveauById = new Map(cache.eleves.map(e => [e.id, e.niveau]))
  const coefOf = makeCoefOf(cache.coefficients)
  const classStudents = new Map<string, EleveRow[]>()
  const notesByEleve = new Map<string, { v: number; c: number }[]>()
  const notesByClass = new Map<string, NoteRow[]>()
  const notesBySubject = new Map<string, NoteRow[]>()
  const todayAbsentEleves = new Set<string>()
  const todayLateEleves = new Set<string>()
  const absentTodayByClass = new Map<string, Set<string>>()
  const incidentsMonthByClass = new Map<string, number>()
  const activeHomeworkByClass = new Map<string, number>()

  cache.eleves.forEach(eleve => {
    if (!eleve.classe) return
    const rows = classStudents.get(eleve.classe) || []
    rows.push(eleve)
    classStudents.set(eleve.classe, rows)
  })

  validNotes.forEach(note => {
    if (note.eleveId) {
      const rows = notesByEleve.get(note.eleveId) || []
      rows.push({ v: note.note!, c: coefOf(note.matiere, eleveNiveauById.get(note.eleveId)) })
      notesByEleve.set(note.eleveId, rows)
    }
    if (note.classe) {
      const rows = notesByClass.get(note.classe) || []
      rows.push(note)
      notesByClass.set(note.classe, rows)
    }
    if (note.subject) {
      const rows = notesBySubject.get(note.subject) || []
      rows.push(note)
      notesBySubject.set(note.subject, rows)
    }
  })

  const trendDays = lastDays(5)
  const trendByClass = new Map<string, Map<string, Set<string>>>()

  cache.absences.forEach(absence => {
    if (!isAbsent(absence) && !isLate(absence)) return

    if (absence.date === today) {
      const id = absence.eleveId || absence.id
      if (isAbsent(absence)) {
        todayAbsentEleves.add(id)
        if (absence.classe) {
          const set = absentTodayByClass.get(absence.classe) || new Set<string>()
          set.add(id)
          absentTodayByClass.set(absence.classe, set)
        }
      }
      if (isLate(absence)) todayLateEleves.add(id)
    }

    if (absence.date >= monthStart && absence.classe) {
      incidentsMonthByClass.set(absence.classe, (incidentsMonthByClass.get(absence.classe) || 0) + 1)
    }

    if (absence.classe) {
      const day = trendDays.find(d => d.iso === absence.date)
      if (day) {
        const classMap = trendByClass.get(absence.classe) || new Map<string, Set<string>>()
        const set = classMap.get(day.iso) || new Set<string>()
        set.add(`${absence.eleveId || absence.id}-${absence.statut}`)
        classMap.set(day.iso, set)
        trendByClass.set(absence.classe, classMap)
      }
    }
  })

  cache.devoirs.forEach(devoir => {
    if (!devoir.classeId || !isActiveHomework(devoir, today)) return
    activeHomeworkByClass.set(devoir.classeId, (activeHomeworkByClass.get(devoir.classeId) || 0) + 1)
  })

  // Moyenne pondérée par élève (Σ note×coef / Σ coef sur toutes ses matières),
  // puis moyennée entre élèves — coefficients marocains (settings/coefficients).
  const studentAverages = [...notesByEleve.values()].map(pairs => weightedAvg(pairs))
  const avgNote = studentAverages.length > 0
    ? round1(studentAverages.reduce((sum, value) => sum + value, 0) / studentAverages.length)
    : null
  const successRate = studentAverages.length > 0
    ? Math.round((studentAverages.filter(value => value >= 10).length / studentAverages.length) * 100)
    : null

  const classStats: ClassStats[] = [...classStudents.entries()].map(([name, students]) => {
    const classNotes = notesByClass.get(name) || []
    const classNoteValues = classNotes.map(row => row.note!).filter(value => value >= 0 && value <= 20)
    const classNotesByEleve = new Map<string, { v: number; c: number }[]>()
    const subjects = new Set<string>()

    classNotes.forEach(note => {
      if (note.subject) subjects.add(note.subject)
      if (!note.eleveId || note.note == null) return
      const rows = classNotesByEleve.get(note.eleveId) || []
      rows.push({ v: note.note, c: coefOf(note.matiere, eleveNiveauById.get(note.eleveId)) })
      classNotesByEleve.set(note.eleveId, rows)
    })

    // Moyenne pondérée par élève, puis moyennée sur la classe (miroir école-entière ci-dessus).
    const averages = [...classNotesByEleve.values()].map(pairs => weightedAvg(pairs))
    const absencesToday = absentTodayByClass.get(name)?.size || 0
    const presenceRate = students.length > 0 ? Math.round(((students.length - absencesToday) / students.length) * 100) : 100
    const classAvg = averages.length > 0 ? round1(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null
    const passingStudents = averages.filter(value => value >= 10).length
    const classSuccess = averages.length > 0
      ? Math.round((passingStudents / averages.length) * 100)
      : null
    const noteScore = classAvg == null ? 55 : (classAvg / 20) * 100
    const successScore = classSuccess ?? 55
    const coverageScore = subjects.size > 0 ? Math.min(100, subjects.size * 18) : 45
    const incidentsPenalty = Math.min(24, (incidentsMonthByClass.get(name) || 0) * 2)

    const classTrend = trendByClass.get(name)

    return {
      name,
      niveau: students.find(e => e.niveau)?.niveau || '',
      studentCount: students.length,
      presenceRate: clamp(presenceRate),
      avgNote: classAvg,
      successRate: classSuccess,
      absencesToday,
      incidentsMonth: incidentsMonthByClass.get(name) || 0,
      activeHomework: activeHomeworkByClass.get(name) || 0,
      subjectsCovered: subjects.size,
      notesCount: classNoteValues.length,
      gradedStudents: averages.length,
      passingStudents,
      healthScore: clamp(Math.round((presenceRate * 0.38) + (noteScore * 0.34) + (successScore * 0.18) + (coverageScore * 0.10) - incidentsPenalty)),
      trend: trendDays.map(day => ({ label: day.label, value: classTrend?.get(day.iso)?.size || 0 })),
    }
  }).sort((a, b) => a.healthScore - b.healthScore || a.name.localeCompare(b.name, 'fr'))

  const subjectStats: SubjectStats[] = [...notesBySubject.entries()].map(([name, notes]) => {
    const values = notes.map(row => row.note!).filter(value => value >= 0 && value <= 20)
    const byEleve = new Map<string, number[]>()
    const byClass = new Map<string, number[]>()

    notes.forEach(note => {
      if (note.eleveId && note.note != null) {
        const rows = byEleve.get(note.eleveId) || []
        rows.push(note.note)
        byEleve.set(note.eleveId, rows)
      }
      if (note.classe && note.note != null) {
        const rows = byClass.get(note.classe) || []
        rows.push(note.note)
        byClass.set(note.classe, rows)
      }
    })

    const averages = [...byEleve.values()].map(rows => rows.reduce((sum, value) => sum + value, 0) / rows.length)
    const classAverages = [...byClass.entries()]
      .map(([className, rows]) => ({
        className,
        avg: rows.reduce((sum, value) => sum + value, 0) / rows.length,
      }))
      .sort((a, b) => a.avg - b.avg)
    const subjectAvg = values.length > 0 ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null
    const subjectSuccess = averages.length > 0
      ? Math.round((averages.filter(value => value >= 10).length / averages.length) * 100)
      : null
    const noteScore = subjectAvg == null ? 55 : (subjectAvg / 20) * 100
    const successScore = subjectSuccess ?? 55
    const coverageScore = Math.min(100, byClass.size * 14)

    return {
      name,
      notesCount: values.length,
      classesCount: byClass.size,
      avgNote: subjectAvg,
      successRate: subjectSuccess,
      below10Count: averages.filter(value => value < 10).length,
      strongestClass: classAverages[classAverages.length - 1]?.className || '—',
      weakestClass: classAverages[0]?.className || '—',
      heatScore: clamp(Math.round((noteScore * 0.50) + (successScore * 0.35) + (coverageScore * 0.15))),
    }
  }).sort((a, b) => a.heatScore - b.heatScore || a.name.localeCompare(b.name, 'fr'))

  const trendSets = new Map<string, Set<string>>()
  const days = lastDays(7)
  days.forEach(day => trendSets.set(day.iso, new Set<string>()))
  cache.absences.forEach(absence => {
    if (!trendSets.has(absence.date) || (!isAbsent(absence) && !isLate(absence))) return
    trendSets.get(absence.date)!.add(`${absence.eleveId || absence.id}-${absence.statut}`)
  })

  const profs = cache.users.filter(user => user.role === 'professeur')

  const niveauMap = new Map<string, ClassStats[]>()
  classStats.forEach(cs => {
    const niv = cs.niveau || cs.name.replace(/[-\d]/g, '').trim() || 'Autre'
    cs.niveauGroup = niv
    const list = niveauMap.get(niv) || []
    list.push(cs)
    niveauMap.set(niv, list)
  })
  const niveauStats: NiveauStats[] = [...niveauMap.entries()].map(([name, classes]) => {
    const totalStudents = classes.reduce((s, c) => s + c.studentCount, 0)
    const totalGradedStudents = classes.reduce((s, c) => s + c.gradedStudents, 0)
    const totalPassingStudents = classes.reduce((s, c) => s + c.passingStudents, 0)
    const totalAbsencesToday = classes.reduce((s, c) => s + c.absencesToday, 0)
    const totalIncidents = classes.reduce((s, c) => s + c.incidentsMonth, 0)
    const avgPresence = totalStudents > 0 ? Math.round(((totalStudents - totalAbsencesToday) / totalStudents) * 100) : 100
    return {
      name,
      classCount: classes.length,
      studentCount: totalStudents,
      // Pondéré par élèves notés (pas par nb de notes) : avgNote est déjà une moyenne par élève.
      avgNote: totalGradedStudents > 0 ? round1(classes.reduce((s, c) => s + ((c.avgNote ?? 0) * c.gradedStudents), 0) / totalGradedStudents) : null,
      successRate: totalGradedStudents > 0 ? Math.round((totalPassingStudents / totalGradedStudents) * 100) : null,
      presenceRate: avgPresence,
      incidentsMonth: totalIncidents,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return {
    totalEleves: cache.eleves.length,
    totalClasses: classStudents.size,
    totalTeachers: profs.length,
    totalParents: cache.users.filter(user => user.role === 'parent').length,
    absentsToday: todayAbsentEleves.size,
    retardsToday: todayLateEleves.size,
    presenceRate: cache.eleves.length > 0 ? Math.round(((cache.eleves.length - todayAbsentEleves.size) / cache.eleves.length) * 100) : 100,
    avgNote,
    successRate,
    notesCount: validNotes.length,
    activeHomework: cache.devoirs.filter(devoir => isActiveHomework(devoir, today)).length,
    absenceTrend: days.map(day => ({ label: day.label, value: trendSets.get(day.iso)?.size || 0 })),
    gradeDistribution: gradeBands(validNotes),
    classStats,
    subjectStats,
    niveauStats,
  }
}

export default function AdminStatsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<AdminDashboardNav>()
  const [data, setData] = useState<DashboardData | null>(null)
  const [view, setView] = useState<StatsView>('niveaux')
  const [selectedNiveau, setSelectedNiveau] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filters, setFilters] = useState<StatsFilters>(INITIAL_FILTERS)
  const [filterOptions, setFilterOptions] = useState<StatsFilterOptions>(EMPTY_FILTER_OPTIONS)
  const statsRequestId = useRef(0)
  // A4 — périmètre RÉELLEMENT appliqué par le serveur. Les pastilles et les
  // drill-downs lisent ceci, jamais `filters` : le serveur clampe (période
  // inconnue → « mois »), et une pastille dessinée depuis le state local
  // afficherait un périmètre que le calcul n'a pas utilisé.
  const [applied, setApplied] = useState<AppliedScope | null>(null)
  // Les pastilles de périmètre/période sont des raccourcis vers les sélecteurs
  // qui vivent dans `StatsFilters` : on remonte la demande plutôt que de
  // dupliquer les pickers.
  const [pickerRequest, setPickerRequest] = useState<StatsFilterKey | 'period' | null>(null)

  const handleStatsAction = useCallback((action: StatsAction) => {
    if (action === 'absences') {
      nav.navigate('AdminAbsences')
      return
    }
    if (action === 'devoirs') {
      nav.navigate('AdminDevoirs')
      return
    }
    setView(action)
    setSelectedNiveau(null)
  }, [nav])

  const openNotes = useCallback((target?: NotesTarget) => {
    // Le périmètre appliqué accompagne TOUS les drill-downs de notes. Sans lui,
    // AdminMatiereDetail retombe sur le semestre courant : un admin consultant
    // « S1 » verrait les notes de S2 et donc une autre moyenne que la tuile.
    nav.navigate('AdminMatiereDetail', { ...target, scope: applied ?? undefined })
  }, [applied, nav])

  // Chaque tuile emporte le périmètre RENVOYÉ PAR LE SERVEUR. C'est ce qui
  // garantit l'invariant : l'écran de détail recalcule sur le même scope, donc
  // son total ne peut pas différer du chiffre qui vient d'être tapé.
  const openTile = useCallback((tile: ReportTile) => {
    if (!applied) return
    if (tile === 'students') {
      nav.navigate('AdminScopeStudents', { scope: applied, segment: 'all' })
      return
    }
    if (tile === 'attendance') {
      nav.navigate('AdminAttendanceStats', { scope: applied })
      return
    }
    if (tile === 'average') {
      nav.navigate('AdminMatiereDetail', {
        matiere: applied.matiere || undefined,
        classe: applied.classe || undefined,
        scope: applied,
      })
      return
    }
    nav.navigate('AdminScopeStudents', { scope: applied, segment: 'followup' })
  }, [applied, nav])

  // Les bandes de la distribution partagent le partitionnement de `successRate`
  // (borne ≥10) : ouvrir une bande, c'est ouvrir exactement les élèves comptés
  // dedans, sans second calcul.
  const openBand = useCallback((band: string) => {
    if (!applied) return
    nav.navigate('AdminScopeStudents', { scope: applied, segment: 'band', band })
  }, [applied, nav])

  // Taux de réussite d'une classe → les élèves qui le composent. Le périmètre
  // est resserré sur cette classe pour que le total corresponde au taux tapé.
  // Devoirs d'une CLASSE : le périmètre est resserré sur elle, la période est
  // celle du hero. Sans ça l'écran listerait les devoirs de toute l'école.
  const openHomework = useCallback((classe?: string) => {
    if (!applied) return
    void Haptics.selectionAsync()
    nav.navigate('AdminScopeHomework', {
      scope: classe ? { ...applied, classe } : applied,
    })
  }, [applied, nav])

  const openThreshold = useCallback((classe: string) => {
    if (!applied) return
    nav.navigate('AdminScopeStudents', {
      scope: { ...applied, classe },
      segment: 'threshold',
      side: 'passing',
    })
  }, [applied, nav])

  const openAttendance = useCallback((classe: string) => {
    if (!applied) return
    nav.navigate('AdminAttendanceStats', { scope: { ...applied, classe } })
  }, [applied, nav])

  // Les collections nominatives restent côté serveur. La callable admin-only
  // renvoie uniquement les agrégats correspondant aux cinq filtres globaux.
  const loadStats = useCallback(async (nextFilters: StatsFilters, pullToRefresh = false) => {
    const requestId = ++statsRequestId.current
    if (pullToRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await httpsCallable<StatsFilters, {
        data: DashboardData
        options: StatsFilterOptions
        applied: AppliedScope
      }>(functions, 'getFilteredSchoolStats')(nextFilters)
      if (requestId !== statsRequestId.current) return
      setData(response.data.data)
      setFilterOptions(response.data.options || EMPTY_FILTER_OPTIONS)
      setApplied(response.data.applied || null)
      setError(null)
    } catch (err: any) {
      if (requestId !== statsRequestId.current) return
      setError(err?.message || t('common.error'))
    } finally {
      if (requestId === statsRequestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [t])

  const onRefresh = useCallback(async () => {
    await loadStats(filters, true)
  }, [filters, loadStats])

  useEffect(() => {
    void loadStats(filters)
  }, [filters, loadStats])

  const changeFilter = useCallback((key: StatsFilterKey, value: string) => {
    setSelectedNiveau(null)
    setFilters(current => {
      if (key === 'cycle') {
        return { ...current, cycle: value as StatsCycle, niveau: '', classe: '', matiere: '' }
      }
      if (key === 'niveau') return { ...current, niveau: value, classe: '', matiere: '' }
      if (key === 'classe') return { ...current, classe: value, matiere: '' }
      return { ...current, matiere: value }
    })
  }, [])

  const changePeriod = useCallback((period: StatsPeriod) => {
    setSelectedNiveau(null)
    setFilters(current => ({ ...current, period }))
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedNiveau(null)
    setFilters(current => ({ ...INITIAL_FILTERS, period: current.period }))
  }, [])

  return (
    <ScreenLayout title={t('admin.statsTitle')}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}
        {loading && !data ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : data ? (
          <>
            <GeneralReport
              data={data}
              scope={applied ?? {
                ...filters,
                academicYear: '',
                notesPeriod: 'annee',
                from: '',
                to: '',
              }}
              theme={theme}
              t={t}
              onOpenScope={() => setPickerRequest('cycle')}
              onOpenPeriod={() => setPickerRequest('period')}
              onTile={openTile}
            />
            <StatsFilters
              value={filters}
              options={filterOptions}
              loading={loading}
              onPeriodChange={changePeriod}
              onFilterChange={changeFilter}
              onClear={clearFilters}
              pickerRequest={pickerRequest}
              onPickerRequestHandled={() => setPickerRequest(null)}
              theme={theme}
              t={t}
            />
            <ViewTabs value={view} onChange={(v) => { setView(v); setSelectedNiveau(null) }} theme={theme} t={t} />
            {view === 'subjects' ? <SubjectsView data={data} onOpenNotes={openNotes} onOpenBand={openBand} theme={theme} t={t} /> : null}
            {view === 'niveaux' ? (
              selectedNiveau != null ? (
                <NiveauClassesView
                  data={data}
                  niveau={selectedNiveau}
                  onBack={() => setSelectedNiveau(null)}
                  onAction={handleStatsAction}
                  onOpenNotes={openNotes}
                  onOpenThreshold={openThreshold}
                  onOpenHomework={openHomework}
                  onOpenAttendance={openAttendance}
                  theme={theme}
                  t={t}
                />
              ) : (
                <NiveauxView data={data} onSelectNiveau={setSelectedNiveau} onOpenBand={openBand} theme={theme} t={t} />
              )
            ) : null}
          </>
        ) : (
          <EmptyText theme={theme} text={t('common.noData')} />
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function GeneralReport({ data, scope, theme, t, onOpenScope, onOpenPeriod, onTile }: {
  data: DashboardData
  scope: AppliedScope
  theme: Theme
  t: TFunction
  onOpenScope: () => void
  onOpenPeriod: () => void
  onTile: (tile: ReportTile) => void
}) {
  // A2 — la matière ne figure PLUS dans la pastille globale. Le serveur ne
  // l'applique qu'aux notes : sur les trois autres tuiles elle promettait un
  // filtrage qui n'avait pas lieu. Elle est désormais portée par la seule
  // métrique qui la respecte, la moyenne.
  const scopeLabel = [scope.cycle ? t(`admin.statsCycle_${scope.cycle}`) : '', scope.niveau, scope.classe]
    .filter(Boolean)
    .join(' · ') || t('admin.statsWholeSchool')
  const periodLabel = t(`admin.statsPeriod_${scope.period}`)
  const average = data.avgNote == null
    ? '—'
    : usesTenPointScale(scope)
      ? `${round1(data.avgNote / 2)}/10`
      : `${round1(data.avgNote)}/20`
  const attendance = data.attendanceCount && data.presenceRate != null ? `${data.presenceRate}%` : '—'
  const toFollow = data.studentsToFollow || 0

  // Les notes n'ayant pas de date d'évaluation, la moyenne porte son propre
  // libellé de période : « S2 en cours » plutôt que « Cette semaine », qui
  // laisserait croire à une moyenne hebdomadaire qui n'existe pas.
  const notesScopeLabel = scope.notesPeriod === 'annee'
    ? t('admin.statsPeriod_annee')
    : t('admin.statsNotesSemesterOngoing', { semester: scope.notesPeriod })
  const averageNote = [scope.matiere, notesScopeLabel].filter(Boolean).join(' · ')

  return (
    <View style={[styles.report, { backgroundColor: theme.primarySurface, borderColor: theme.border }]}>
      <View style={styles.reportIntro}>
        <Text style={[styles.reportEyebrow, { color: theme.primary }]}>{t('admin.statsReportEyebrow')}</Text>
        <Text selectable style={[styles.reportTitle, { color: theme.text }]}>{t('admin.statsReportTitle')}</Text>
        <Text selectable style={[styles.reportLead, { color: theme.textSoft }]}>{t('admin.statsReportLead')}</Text>
        <View style={styles.reportScopeRow}>
          <ScopePill label={scopeLabel} onPress={onOpenScope} theme={theme} t={t} />
          <ScopePill label={periodLabel} onPress={onOpenPeriod} theme={theme} t={t} />
        </View>
      </View>
      <View style={styles.reportGrid}>
        <ReportMetric
          icon={<Users size={17} color={theme.primary} />}
          value={String(data.totalEleves)}
          label={t('admin.statsStudents')}
          tone={theme.card}
          theme={theme}
          onPress={() => onTile('students')}
          hint={t('admin.statsOpenStudents')}
        />
        <ReportMetric
          icon={<CheckCircle2 size={17} color={theme.info} />}
          value={attendance}
          label={t('admin.statsAttendance')}
          tone={theme.card}
          theme={theme}
          onPress={() => onTile('attendance')}
          hint={t('admin.statsOpenAttendance')}
        />
        <ReportMetric
          icon={<BarChart3 size={17} color={theme.primary} />}
          value={average}
          label={t('admin.statsAverage')}
          note={averageNote}
          tone={theme.card}
          theme={theme}
          onPress={() => onTile('average')}
          hint={t('admin.statsOpenNotes')}
        />
        <ReportMetric
          icon={<AlertTriangle size={17} color={toFollow > 0 ? theme.danger : theme.info} />}
          value={String(toFollow)}
          label={t('admin.statsToFollow')}
          tone={theme.card}
          theme={theme}
          onPress={() => onTile('followup')}
          hint={t('admin.statsOpenFollowUp')}
        />
      </View>
    </View>
  )
}

function ScopePill({ label, onPress, theme, t }: {
  label: string; onPress: () => void; theme: Theme; t: TFunction
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('admin.statsChangeScope', { scope: label })}
      style={({ pressed }) => [
        styles.reportScopePill,
        { backgroundColor: theme.card },
        pressed && styles.pressedTile,
      ]}
    >
      <Text numberOfLines={1} style={[styles.reportScopeText, { color: theme.textSoft }]}>{label}</Text>
      <ChevronDown size={12} color={theme.textMuted} />
    </Pressable>
  )
}

/**
 * Tuile de KPI. Entièrement tactile — pas de chevron ajouté : la carte elle-même
 * est la cible, et l'appui la réduit légèrement. Une valeur `0` reste cliquable
 * et ouvre un état vide explicatif, sinon l'admin ne saurait pas distinguer
 * « rien à signaler » de « écran cassé ».
 */
function ReportMetric({ icon, value, label, note, tone, theme, onPress, hint }: {
  icon: React.ReactNode
  value: string
  label: string
  note?: string
  tone: string
  theme: Theme
  onPress?: () => void
  hint?: string
}) {
  const body = (
    <>
      <View style={styles.reportMetricHead}>
        <Text numberOfLines={1} style={[styles.reportMetricLabel, { color: theme.textSoft }]}>{label}</Text>
        {icon}
      </View>
      <Text selectable style={[styles.reportMetricValue, { color: theme.text }]}>{value}</Text>
      {note ? (
        <Text numberOfLines={1} style={[styles.reportMetricNote, { color: theme.textMuted }]}>{note}</Text>
      ) : null}
    </>
  )

  if (!onPress) {
    return (
      <View style={[styles.reportMetric, { backgroundColor: tone, borderColor: theme.border }]}>{body}</View>
    )
  }

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.reportMetric,
        { backgroundColor: tone, borderColor: theme.border },
        pressed && styles.pressedTile,
      ]}
    >
      {body}
    </Pressable>
  )
}

function StatsFilters({
  value, options, loading, onPeriodChange, onFilterChange, onClear,
  pickerRequest, onPickerRequestHandled, theme, t,
}: {
  value: StatsFilters
  options: StatsFilterOptions
  loading: boolean
  onPeriodChange: (period: StatsPeriod) => void
  onFilterChange: (key: StatsFilterKey, value: string) => void
  onClear: () => void
  pickerRequest?: StatsFilterKey | 'period' | null
  onPickerRequestHandled?: () => void
  theme: Theme
  t: TFunction
}) {
  const [picker, setPicker] = useState<StatsFilterKey | 'period' | null>(null)

  // Ouverture pilotée depuis les pastilles du hero : le choix s'affiche dans
  // la même modale que les autres filtres, y compris pour la période.
  useEffect(() => {
    if (!pickerRequest) return
    setPicker(pickerRequest)
    onPickerRequestHandled?.()
  }, [pickerRequest, onPickerRequestHandled])
  const periods: StatsPeriod[] = ['semaine', 'mois', 'S1', 'S2', 'annee']
  const cycleOptions: FilterOption[] = [
    { value: '', label: t('admin.statsAllCycles') },
    { value: 'prescolaire', label: t('admin.statsCycle_prescolaire') },
    { value: 'primaire', label: t('admin.statsCycle_primaire') },
    { value: 'college', label: t('admin.statsCycle_college') },
  ]
  const pickerOptions: Record<StatsFilterKey, FilterOption[]> = {
    cycle: cycleOptions,
    niveau: [{ value: '', label: t('admin.statsAllLevels') }, ...options.niveaux.map(item => ({ value: item, label: item }))],
    classe: [{ value: '', label: t('admin.statsAllClasses') }, ...options.classes.map(item => ({ value: item, label: item }))],
    matiere: [{ value: '', label: t('admin.statsAllSubjects') }, ...options.matieres],
  }
  const pickerTitles: Record<StatsFilterKey, string> = {
    cycle: t('admin.statsCycle'),
    niveau: t('admin.statsLevel'),
    classe: t('admin.statsClass'),
    matiere: t('admin.statsSubject'),
  }
  const selectedLabels: Record<StatsFilterKey, string> = {
    cycle: cycleOptions.find(item => item.value === value.cycle)?.label || t('admin.statsAllCycles'),
    niveau: value.niveau || t('admin.statsAllLevels'),
    classe: value.classe || t('admin.statsAllClasses'),
    matiere: options.matieres.find(item => item.value === value.matiere)?.label || value.matiere || t('admin.statsAllSubjects'),
  }
  const hasFilters = !!(value.cycle || value.niveau || value.classe || value.matiere)

  return (
    <>
      <View style={[styles.filtersCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.filtersHead}>
          <View style={styles.filtersTitleWrap}>
            <Filter size={15} color={theme.primary} />
            <Text style={[styles.filtersTitle, { color: theme.text }]}>{t('admin.statsFilters')}</Text>
          </View>
          {loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
          {hasFilters ? (
            <Pressable onPress={onClear} accessibilityRole="button" style={[styles.clearFilters, { backgroundColor: theme.dangerSurface }]}>
              <X size={13} color={theme.danger} />
              <Text style={[styles.clearFiltersText, { color: theme.danger }]}>{t('admin.statsClear')}</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {periods.map(period => {
            const active = value.period === period
            return (
              <Pressable
                key={period}
                onPress={() => onPeriodChange(period)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.periodChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.surface }]}
              >
                <Text style={[styles.periodChipText, { color: active ? palette.white : theme.textSoft }]}>{t(`admin.statsPeriod_${period}`)}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={styles.filterSelectGrid}>
          {(['cycle', 'niveau', 'classe', 'matiere'] as StatsFilterKey[]).map(key => (
            <Pressable
              key={key}
              onPress={() => setPicker(key)}
              accessibilityRole="button"
              accessibilityLabel={`${pickerTitles[key]}: ${selectedLabels[key]}`}
              style={[styles.filterSelect, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.filterSelectCaption, { color: theme.textMuted }]}>{pickerTitles[key]}</Text>
              <View style={styles.filterSelectValueRow}>
                <Text numberOfLines={1} style={[styles.filterSelectValue, { color: theme.text }]}>{selectedLabels[key]}</Text>
                <ChevronRight size={14} color={theme.textMuted} />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <Modal visible={picker != null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} accessibilityLabel={t('admin.statsCloseFilter')} />
          {picker ? (
            <View style={[styles.pickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.pickerHead}>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  {picker === 'period' ? t(`admin.statsPeriod_${value.period}`) : pickerTitles[picker]}
                </Text>
                <Pressable onPress={() => setPicker(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('admin.statsCloseFilter')}>
                  <X size={20} color={theme.textSoft} />
                </Pressable>
              </View>
              <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
                {(picker === 'period'
                  ? periods.map(period => ({ value: period, label: t(`admin.statsPeriod_${period}`) }))
                  : pickerOptions[picker]
                ).map(option => {
                  const selected = picker === 'period'
                    ? value.period === option.value
                    : value[picker] === option.value
                  return (
                    <Pressable
                      key={`${picker}-${option.value || 'all'}`}
                      onPress={() => {
                        if (picker === 'period') onPeriodChange(option.value as StatsPeriod)
                        else onFilterChange(picker, option.value)
                        setPicker(null)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.pickerOption, { borderBottomColor: theme.border }, selected && { backgroundColor: theme.primarySurface }]}
                    >
                      <Text style={[styles.pickerOptionText, { color: selected ? theme.primary : theme.text }]}>{option.label}</Text>
                      {selected ? <CheckCircle2 size={17} color={theme.primary} /> : null}
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  )
}

function ViewTabs({ value, onChange, theme, t }: {
  value: StatsView
  onChange: (next: StatsView) => void
  theme: Theme
  t: TFunction
}) {
  const items: { id: StatsView; label: string; Icon: LucideIcon }[] = [
    { id: 'niveaux', label: t('admin.niveaux'), Icon: BarChart3 },
    { id: 'subjects', label: t('admin.viewSubjects'), Icon: BookOpen },
  ]

  return (
    <View style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}>
      {items.map(item => {
        const active = value === item.id
        const Icon = item.Icon
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={[styles.tab, active && { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Icon color={active ? theme.primary : theme.textSoft} size={18} />
            <Text numberOfLines={1} style={[styles.tabText, { color: active ? theme.primary : theme.textSoft }]}>{item.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function NiveauxView({ data, onSelectNiveau, onOpenBand, theme, t }: { data: DashboardData; onSelectNiveau: (niveau: string) => void; onOpenBand?: (band: string) => void; theme: Theme; t: TFunction }) {
  const COLORS = chartColors
  return (
    <>
      {data.niveauStats.length === 0 ? (
        <EmptyText theme={theme} text={t('common.noData')} />
      ) : (
        data.niveauStats.map((niv, idx) => {
          const color = COLORS[idx % COLORS.length]
          return (
            <Pressable key={niv.name} onPress={() => onSelectNiveau(niv.name)} style={({ pressed }) => [styles.niveauCard, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
              <View style={styles.niveauHeader}>
                <View style={[styles.niveauBadge, { backgroundColor: color }]}>
                  {/* 'Autre' est la sentinelle de regroupement posée par computeData. */}
                  <Text style={{ color: palette.white, fontWeight: '900', fontSize: 13 }}>{niv.name === 'Autre' ? t('common.other') : niv.name}</Text>
                </View>
                <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 12, flex: 1, marginStart: 8 }}>
                  {niv.classCount} {t('tabs.classes').toLowerCase()} · {niv.studentCount} {t('admin.eleves').toLowerCase()}
                </Text>
                <ChevronRight size={18} color={theme.textMuted} />
              </View>
              <View style={styles.niveauGrid}>
                <View style={[styles.niveauStat, { backgroundColor: theme.primarySurface }]}>
                  <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 18 }}>{formatNote(niv.avgNote)}</Text>
                  <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 10, marginTop: 2 }}>{t('admin.avgGrade')}</Text>
                </View>
                <View style={[styles.niveauStat, {
                  backgroundColor: niv.presenceRate == null
                    ? theme.surface
                    : niv.presenceRate >= 90 ? theme.infoSurface : theme.dangerSurface,
                }]}>
                  <Text style={{
                    color: niv.presenceRate == null
                      ? theme.textMuted
                      : niv.presenceRate >= 90 ? theme.info : theme.danger,
                    fontWeight: '900',
                    fontSize: 18,
                  }}>
                    {niv.presenceRate == null ? '—' : `${niv.presenceRate}%`}
                  </Text>
                  <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 10, marginTop: 2 }}>{t('admin.attendanceRate')}</Text>
                </View>
                <View style={[styles.niveauStat, { backgroundColor: theme.warningSurface }]}>
                  <Text style={{ color: theme.warning, fontWeight: '900', fontSize: 18 }}>{niv.successRate != null ? `${niv.successRate}%` : '—'}</Text>
                  <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 10, marginTop: 2 }}>{t('admin.successRate')}</Text>
                </View>
                <View style={[styles.niveauStat, { backgroundColor: niv.incidentsMonth > 5 ? theme.dangerSurface : theme.surface }]}>
                  <View style={styles.incidentOnly}>
                    <AlertTriangle size={16} color={niv.incidentsMonth > 5 ? theme.danger : theme.textSoft} />
                    <Text style={{ color: niv.incidentsMonth > 5 ? theme.danger : theme.text, fontWeight: '900', fontSize: 18, marginStart: 6 }}>{niv.incidentsMonth}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          )
        })
      )}

      <ChartCard title={t('tabs.grades')} theme={theme}>
        <DistributionBars bands={data.gradeDistribution} theme={theme} t={t} onOpenBand={onOpenBand} />
      </ChartCard>
    </>
  )
}

function NiveauClassesView({ data, niveau, onBack, onAction, onOpenNotes, onOpenThreshold, onOpenHomework, onOpenAttendance, theme, t }: {
  data: DashboardData; niveau: string; onBack: () => void; onAction: (action: StatsAction) => void; onOpenNotes: (target?: NotesTarget) => void; onOpenThreshold: (classe: string) => void; onOpenHomework: (classe: string) => void; onOpenAttendance: (classe: string) => void; theme: Theme; t: TFunction
}) {
  const classes = data.classStats.filter(item => item.niveauGroup === niveau)
  const label = niveau === 'Autre' ? t('common.other') : niveau
  return (
    <>
      <Pressable onPress={onBack} style={[styles.niveauBack, { backgroundColor: theme.surfaceAlt }]}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13, marginStart: 2 }}>{t('admin.niveaux')}</Text>
        <Text style={{ color: theme.textSoft, fontWeight: '800', fontSize: 13, marginStart: 8 }}>— {label}</Text>
      </Pressable>
      <View style={styles.classGrid}>
        {classes.length === 0 ? (
          <EmptyText theme={theme} text={t('common.noData')} />
        ) : (
          classes.map(item => <ClassCardRich key={item.name} item={item} onAction={onAction} onOpenNotes={onOpenNotes}
              onOpenThreshold={onOpenThreshold} onOpenHomework={onOpenHomework}
              onOpenAttendance={onOpenAttendance} theme={theme} t={t} />)
        )}
      </View>
    </>
  )
}

function ClassCardRich({ item, onAction, onOpenNotes, onOpenThreshold, onOpenHomework, onOpenAttendance, theme, t }: { item: ClassStats; onAction: (action: StatsAction) => void; onOpenNotes: (target?: NotesTarget) => void; onOpenThreshold: (classe: string) => void; onOpenHomework: (classe: string) => void; onOpenAttendance: (classe: string) => void; theme: Theme; t: TFunction }) {
  const healthColor = item.healthScore >= 75 ? theme.info : item.healthScore >= 55 ? theme.warning : theme.danger
  return (
    <View style={[styles.classCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.classCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '900', fontSize: 17 }}>{item.name}</Text>
          {item.niveau ? <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 11, marginTop: 2 }}>{item.niveau}</Text> : null}
        </View>
        <View style={[styles.countBadge, { backgroundColor: theme.primarySurface }]}>
          <Users size={13} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '900', fontSize: 13, marginStart: 4 }}>{item.studentCount}</Text>
        </View>
      </View>

      <View style={styles.classCardBody}>
        <Pressable
          onPress={() => onOpenAttendance(item.name)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} ${t('admin.attendanceRate')}`}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <RingGauge value={item.presenceRate} color={healthColor} trackColor={theme.surfaceAlt} textColor={theme.text} label={t('admin.attendanceRate')} size={RING_SM} stroke={8} />
        </Pressable>
        <View style={styles.classCardMetrics}>
          <MetricLine icon={<TrendingUp size={14} color={theme.primary} />} label={t('admin.avgGrade')} value={formatNote(item.avgNote)} theme={theme} onPress={() => onOpenNotes({ classe: item.name })} />
          {/* Le taux de reussite d'une classe ouvre les eleves qui le composent,
              pas l'analyse des notes : c'est le seuil qui est en cause. */}
          <MetricLine icon={<CheckCircle2 size={14} color={theme.info} />} label={t('admin.successRate')} value={item.successRate == null ? '—' : `${item.successRate}%`} theme={theme} onPress={() => onOpenThreshold(item.name)} />
          <MetricLine icon={<BookOpen size={14} color={theme.warning} />} label={t('admin.homeworkShort')} value={String(item.activeHomework)} theme={theme} onPress={() => onOpenHomework(item.name)} />
        </View>
      </View>

      <View style={styles.healthRow}>
        <Text style={{ color: theme.textSoft, fontWeight: '800', fontSize: 10, width: 60 }}>{t('admin.classHealth')}</Text>
        <View style={[styles.healthTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.healthFill, { width: `${item.healthScore}%`, backgroundColor: healthColor }]} />
        </View>
        <Text style={{ color: healthColor, fontWeight: '900', fontSize: 11, width: 36, textAlign: 'right' }}>{item.healthScore}%</Text>
      </View>

      <View style={styles.classCardFooter}>
        <Pressable
          onPress={() => onOpenAttendance(item.name)}
          accessibilityRole="button"
          accessibilityLabel={`${item.incidentsMonth} ${t('tabs.absences')}`}
          style={({ pressed }) => [styles.incidentPill, { backgroundColor: theme.dangerSurface }, pressed && styles.pressed]}
        >
          <AlertTriangle size={13} color={theme.danger} />
          <Text style={{ color: theme.danger, fontWeight: '900', fontSize: 11, marginStart: 4 }}>{item.incidentsMonth}</Text>
        </Pressable>
        <MiniTrend points={item.trend} color={theme.primary} mutedColor={theme.primarySurface} textColor={theme.textSoft} />
      </View>
    </View>
  )
}

function MetricLine({ icon, label, value, theme, onPress }: { icon: React.ReactNode; label: string; value: string; theme: Theme; onPress?: () => void }) {
  const content = (
    <>
      {icon}
      <Text numberOfLines={1} style={{ flex: 1, marginStart: 6, color: theme.textSoft, fontWeight: '700', fontSize: 11 }}>{label}</Text>
      <Text style={{ color: theme.text, fontWeight: '900', fontSize: 13 }}>{value}</Text>
      {onPress ? <ChevronRight size={12} color={theme.textMuted} /> : null}
    </>
  )
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value}`}
        style={({ pressed }) => [styles.metricLine, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    )
  }
  return (
    <View style={styles.metricLine}>
      {content}
    </View>
  )
}

function SubjectsView({ data, onOpenNotes, onOpenBand, theme, t }: { data: DashboardData; onOpenNotes: (target?: NotesTarget) => void; onOpenBand?: (band: string) => void; theme: Theme; t: TFunction }) {
  return (
    <>
      <View style={styles.subjectList}>
        {data.subjectStats.length === 0 ? (
          <EmptyText theme={theme} text={t('admin.noSubjects')} />
        ) : (
          data.subjectStats.map(item => <SubjectTile key={item.name} item={item} onPress={() => onOpenNotes({ matiere: item.name })} theme={theme} t={t} />)
        )}
      </View>
    </>
  )
}

function Kpi({ icon, value, label, bg, theme }: {
  icon: React.ReactNode
  value: string
  label: string
  bg: string
  theme: Theme
}) {
  return (
    <View style={[styles.kpi, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[styles.kpiValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.kpiLabel, { color: theme.textSoft }]}>{label}</Text>
    </View>
  )
}

function ChartCard({ title, theme, children }: {
  title: string
  theme: Theme
  children: React.ReactNode
}) {
  return (
    <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text numberOfLines={1} style={[styles.chartTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  )
}

function RingGauge({ value, color, trackColor, textColor, label, size, stroke }: {
  value: number | null
  color: string
  trackColor: string
  textColor: string
  label: string
  size: number
  stroke: number
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = value == null ? 0 : clamp(value)
  const offset = circumference - (circumference * progress) / 100

  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="transparent" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, { color: textColor, fontSize: size > 90 ? 25 : 15 }]}>
          {value == null ? '—' : `${progress}%`}
        </Text>
        <Text numberOfLines={1} style={[styles.ringLabel, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  )
}

function MiniBars({ points, color, mutedColor, textColor }: {
  points: TrendPoint[]
  color: string
  mutedColor: string
  textColor: string
}) {
  const max = Math.max(1, ...points.map(point => point.value))
  return (
    <View style={styles.barsRow}>
      {points.map(point => {
        const height = Math.max(8, Math.round((point.value / max) * 58))
        return (
          <View key={point.label} style={styles.barItem}>
            <View style={[styles.barTrack, { backgroundColor: mutedColor }]}>
              <View style={[styles.barFill, { height, backgroundColor: color }]} />
            </View>
            <Text style={[styles.barLabel, { color: textColor }]}>{point.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function MiniTrend({ points, color, mutedColor, textColor }: { points: TrendPoint[]; color: string; mutedColor: string; textColor: string }) {
  const max = Math.max(1, ...points.map(p => p.value))
  return (
    <View style={styles.trendWrap}>
      {points.map(p => (
        <View key={p.label} style={styles.trendItem}>
          <View style={[styles.trendTrack, { backgroundColor: mutedColor }]}>
            <View style={[styles.trendFill, { height: Math.max(4, Math.round((p.value / max) * 26)), backgroundColor: color }]} />
          </View>
          <Text style={[styles.trendLabel, { color: textColor }]}>{p.label}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * Chaque bande ouvre exactement les élèves qu'elle compte. Depuis A9 la
 * distribution partitionne les ÉLÈVES (borne ≥10, la même que `successRate`),
 * donc « ouvrir une bande » ne demande aucun second calcul : le segment `band`
 * de la callable relit le même partitionnement.
 */
function DistributionBars({ bands, theme, t, onOpenBand }: {
  bands: GradeBand[]; theme: Theme; t: TFunction; onOpenBand?: (band: string) => void
}) {
  const max = Math.max(1, ...bands.map(item => item.value))
  return (
    <View style={styles.distribution}>
      {bands.map(item => {
        const row = (
          <>
            <Text style={[styles.distributionLabel, { color: theme.textSoft }]}>{item.label}</Text>
            <View style={[styles.distributionTrack, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.distributionFill, { width: `${Math.max(5, (item.value / max) * 100)}%`, backgroundColor: item.color }]} />
            </View>
            <Text style={[styles.distributionValue, { color: theme.text }]}>{item.value}</Text>
          </>
        )
        if (!onOpenBand) {
          return <View key={item.label} style={styles.distributionRow}>{row}</View>
        }
        return (
          <Pressable
            key={item.label}
            onPress={() => {
              void Haptics.selectionAsync()
              onOpenBand(item.label)
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} — ${item.value}`}
            accessibilityHint={t('admin.statsOpenBand')}
            style={({ pressed }) => [styles.distributionRow, pressed && styles.pressedTile]}
          >
            {row}
          </Pressable>
        )
      })}
    </View>
  )
}

function RiskRail({ data, theme, t }: { data: ClassStats[]; theme: Theme; t: TFunction }) {
  if (data.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {data.map(item => {
        const color = scoreColor(item.healthScore, theme)
        return (
          <View key={item.name} style={[styles.riskCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.riskAccent, { backgroundColor: color }]} />
            <Text numberOfLines={1} style={[styles.riskName, { color: theme.text }]}>{item.name}</Text>
            <View style={[styles.smallBar, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.smallFill, { width: `${item.healthScore}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.riskMeta, { color: theme.textSoft }]}>{item.healthScore}% · {item.incidentsMonth} {t('tabs.absences').toLowerCase()}</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

function ClassMap({ classes, theme, t }: { classes: ClassStats[]; theme: Theme; t: TFunction }) {
  if (classes.length === 0) return <EmptyText theme={theme} text={t('common.noData')} />
  const counts = classes.map(item => item.studentCount)
  const minCount = Math.min(...counts)
  const maxCount = Math.max(...counts)

  return (
    <View>
      <View style={[styles.scatter, { backgroundColor: theme.surfaceAlt }]}>
        {classes.map(item => {
          const size = bubbleSize(item.studentCount, minCount, maxCount)
          const x = `${clamp(((item.avgNote ?? 10) / 20) * 100, 12, 86)}%`
          const y = `${clamp(item.presenceRate ?? 50, 14, 82)}%`
          const color = scoreColor(item.healthScore, theme)
          return (
            <View
              key={item.name}
              style={[
                styles.scatterDot,
                {
                  left: x as any,
                  bottom: y as any,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  marginLeft: -(size / 2),
                  marginBottom: -(size / 2),
                  backgroundColor: color,
                },
              ]}
            >
              <Text style={[styles.scatterCount, { fontSize: size > 48 ? 9 : 7 }]}>{item.studentCount}</Text>
            </View>
          )
        })}
      </View>
      <View style={styles.axisRow}>
        <Text style={[styles.axisText, { color: theme.textSoft }]}>0</Text>
        <Text style={[styles.axisText, { color: theme.textSoft }]}>{t('admin.avgGrade')} /20</Text>
        <Text style={[styles.axisText, { color: theme.textSoft }]}>20</Text>
      </View>
    </View>
  )
}

function IconStat({ icon, value, theme }: { icon: React.ReactNode; value: string; theme: Theme }) {
  return (
    <View style={[styles.iconStat, { backgroundColor: theme.surfaceAlt }]}>
      {icon}
      <Text numberOfLines={1} style={[styles.iconStatText, { color: theme.text }]}>{value}</Text>
    </View>
  )
}

function SubjectTile({ item, onPress, theme, t }: { item: SubjectStats; onPress: () => void; theme: Theme; t: TFunction }) {
  const color = scoreColor(item.heatScore, theme)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      style={({ pressed }) => [styles.subjectTile, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]}
    >
      <View style={styles.subjectHead}>
        <View style={[styles.subjectIcon, { backgroundColor: noteHeatColor(item.avgNote, theme) }]}>
          <BookOpen size={17} color={noteTextColor(item.avgNote, theme)} />
        </View>
        <Text numberOfLines={1} style={[styles.subjectTitle, { color: theme.text }]}>{item.name}</Text>
        <Text style={[styles.subjectScore, { color }]}>{item.heatScore}%</Text>
        <ChevronRight size={15} color={theme.textMuted} />
      </View>
      <View style={styles.subjectStats}>
        <IconStat icon={<TrendingUp size={15} color={theme.primary} />} value={formatNote(item.avgNote)} theme={theme} />
        <IconStat icon={<CheckCircle2 size={15} color={theme.info} />} value={item.successRate == null ? '—' : `${item.successRate}%`} theme={theme} />
        <IconStat icon={<AlertTriangle size={15} color={theme.danger} />} value={String(item.below10Count)} theme={theme} />
        <IconStat icon={<Award size={15} color={theme.warning} />} value={String(item.classesCount)} theme={theme} />
      </View>
      <View style={styles.subjectFoot}>
        <Text numberOfLines={1} style={[styles.subjectFootText, { color: theme.danger }]}>↓ {item.weakestClass}</Text>
        <Text numberOfLines={1} style={[styles.subjectFootText, { color: theme.info }]}>↑ {item.strongestClass}</Text>
      </View>
    </Pressable>
  )
}

function EmptyText({ theme, text }: { theme: Theme; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: theme.textSoft }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 34 },
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 36, alignItems: 'center' },
  emptyText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },

  report: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  reportIntro: { marginBottom: 14 },
  reportEyebrow: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  reportTitle: { fontSize: 25, lineHeight: 31, fontWeight: '900', marginTop: 7 },
  reportLead: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 5 },
  reportScopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  reportScopePill: {
    maxWidth: '100%', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  reportScopeText: { fontSize: 10, fontWeight: '800' },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reportMetric: { width: '48.5%', minHeight: 82, borderWidth: 1, borderRadius: 12, padding: 11, justifyContent: 'space-between' },
  reportMetricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  reportMetricLabel: { flex: 1, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  reportMetricValue: { fontSize: 22, fontWeight: '900', marginTop: 8, fontVariant: ['tabular-nums'] },
  reportMetricNote: { fontSize: 9, fontWeight: '700', marginTop: 3 },
  // Appui : réduction + atténuation, identiques sur les quatre tuiles et les
  // pastilles, pour que « ceci s'ouvre » se lise sans chevron surajouté.
  pressedTile: { opacity: 0.72, transform: [{ scale: 0.975 }] },

  filtersCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  filtersHead: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  filtersTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filtersTitle: { fontSize: 13, fontWeight: '900' },
  clearFilters: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  clearFiltersText: { fontSize: 10, fontWeight: '900' },
  periodRow: { gap: 6, paddingBottom: 10 },
  periodChip: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  periodChipText: { fontSize: 11, fontWeight: '900' },
  filterSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterSelect: { width: '48.5%', minHeight: 58, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  filterSelectCaption: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  filterSelectValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterSelectValue: { flex: 1, fontSize: 12, fontWeight: '800' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  pickerSheet: { width: '100%', maxHeight: '72%', borderWidth: 1, borderRadius: 18, padding: 14 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 8 },
  pickerTitle: { flex: 1, fontSize: 17, fontWeight: '900' },
  pickerList: { flexGrow: 0 },
  pickerOption: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerOptionText: { flex: 1, fontSize: 13, fontWeight: '800' },

  tabs: { flexDirection: 'row', borderRadius: 8, padding: 4, marginBottom: 12, gap: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 7, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  tabText: { fontSize: 11, fontWeight: '900' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpi: { width: '48.5%', minHeight: 112, borderWidth: 1, borderRadius: 8, padding: 12 },
  kpiIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  kpiValue: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kpiLabel: { fontSize: 11, fontWeight: '800', marginTop: 4 },

  chartGrid: { gap: 12, marginBottom: 12 },
  chartCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  chartTitle: { fontSize: 13, fontWeight: '900', marginBottom: 10 },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: '76%' },
  ringValue: { fontWeight: '900', fontVariant: ['tabular-nums'] },
  ringLabel: { fontSize: 8, fontWeight: '800', opacity: 0.62, marginTop: 1, textAlign: 'center' },

  barsRow: { height: 88, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  barItem: { flex: 1, alignItems: 'center' },
  barTrack: { height: 64, width: '100%', borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  barLabel: { fontSize: 9, fontWeight: '800', marginTop: 4 },

  distribution: { gap: 10 },
  distributionRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  distributionLabel: { width: 42, fontSize: 11, fontWeight: '900' },
  distributionTrack: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  distributionFill: { height: 10, borderRadius: 999 },
  distributionValue: { width: 30, textAlign: 'right', fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },

  rail: { gap: 10, paddingBottom: 2 },
  riskCard: { width: 128, borderWidth: 1, borderRadius: 8, padding: 10, overflow: 'hidden' },
  riskAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  riskName: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  riskMeta: { fontSize: 10, fontWeight: '800', marginTop: 6 },
  smallBar: { height: 7, borderRadius: 999, overflow: 'hidden' },
  smallFill: { height: 7, borderRadius: 999 },

  scatter: { height: 196, borderRadius: 8, overflow: 'hidden' },
  scatterDot: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.white },
  scatterCount: { color: palette.white, fontWeight: '900', opacity: 0.9, fontVariant: ['tabular-nums'] },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  axisText: { fontSize: 10, fontWeight: '800' },

  niveauCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  niveauBack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 12 },
  niveauHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  niveauBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  niveauGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  niveauStat: { width: '48%', borderRadius: 10, padding: 10, alignItems: 'center' },
  incidentOnly: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  classSummary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryPill: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  classGrid: { gap: 10 },
  classCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 2 },
  classCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  countBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  classCardBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  classCardMetrics: { flex: 1, gap: 4 },
  metricLine: { flexDirection: 'row', alignItems: 'center', minHeight: 26, borderRadius: 8 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  healthTrack: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  healthFill: { height: 8, borderRadius: 999 },
  classCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  incidentPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  trendWrap: { flex: 1, height: 38, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 5 },
  trendItem: { width: 16, alignItems: 'center' },
  trendTrack: { width: 12, height: 28, borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
  trendFill: { width: 12, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  trendLabel: { fontSize: 8, fontWeight: '700', marginTop: 2 },
  iconStat: { minWidth: '47%', flex: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconStatText: { flex: 1, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },

  subjectList: { gap: 10 },
  subjectTile: { borderWidth: 1, borderRadius: 8, padding: 12 },
  subjectHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  subjectIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  subjectTitle: { flex: 1, fontSize: 15, fontWeight: '900' },
  subjectScore: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  subjectStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  subjectFoot: { flexDirection: 'row', gap: 8, marginTop: 9 },
  subjectFootText: { flex: 1, fontSize: 11, fontWeight: '900' },
})
