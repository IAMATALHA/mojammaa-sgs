import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl,
} from 'react-native'
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle, Award, BarChart3, BookOpen, CheckCircle2,
  ChevronLeft, ChevronRight, TrendingUp, Users, type LucideIcon,
} from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { palette, chartColors } from '../../theme/designTokens'
import { db, functions } from '../../config/firebase'
import type { AdminDashboardNav } from '../../navigation/types'

type CollectionName = 'eleves' | 'users' | 'notes' | 'absences' | 'devoirs'
type StatsView = 'niveaux' | 'subjects'
type StatsAction = 'absences' | 'devoirs' | 'niveaux' | 'subjects'
type NotesTarget = { matiere?: string; classe?: string }

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
  presenceRate: number
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
  presenceRate: number
  incidentsMonth: number
}

interface DashboardData {
  totalEleves: number
  totalClasses: number
  totalTeachers: number
  totalParents: number
  absentsToday: number
  retardsToday: number
  presenceRate: number
  avgNote: number | null
  successRate: number | null
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
const RING = 124
const RING_SM = 74

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
    { label: '10-14', value: notes.filter(row => row.note! >= 10 && row.note! < 14).length, color: palette.navy },
    { label: '14+', value: notes.filter(row => row.note! >= 14).length, color: palette.green },
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
    nav.navigate('AdminMatiereDetail', target)
  }, [nav])

  // Pull-to-refresh : force le recalcul serveur (callable admin-only). Le
  // listener stats/summary reçoit ensuite la MAJ tout seul. Si la CF n'est pas
  // déployée, l'échec est silencieux et le fallback live reste affiché.
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await httpsCallable(functions, 'recomputeSchoolStats')()
    } catch {
      /* no-op : fallback live déjà à l'écran */
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const cache: SnapshotCache = {
      eleves: [],
      users: [],
      notes: [],
      absences: [],
      devoirs: [],
      coefficients: { matieres: {}, parNiveau: {} },
    }
    const ready = new Set<CollectionName>()

    const recompute = () => {
      if (ready.size !== COLLECTIONS.length) return
      setData(buildDashboardData(cache))
      setLoading(false)
      setError(null)
    }

    const handleError = (err: Error) => {
      setError(err.message || t('common.error'))
      setLoading(false)
    }

    // ── Fallback : calcul live à partir des 5 collections ──────────────────
    // Utilisé UNIQUEMENT si l'agrégat serveur stats/summary n'existe pas encore
    // (CF pas déployée / pas encore exécutée). Les absences sont bornées à la
    // fenêtre réellement exploitée (aujourd'hui + mois courant + tendance 5 j).
    const startLiveFallback = (): Unsubscribe => {
      const monthStart = monthStartISO()
      const trendStart = lastDays(5)[0].iso
      const absencesSince = monthStart < trendStart ? monthStart : trendStart

      const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'eleves'), snap => {
        cache.eleves = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            classe: asString(row.classe),
            niveau: asString(row.niveau),
          }
        })
        ready.add('eleves')
        recompute()
      }, handleError),
      onSnapshot(collection(db, 'users'), snap => {
        cache.users = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            role: asString(row.role) || 'parent',
          }
        })
        ready.add('users')
        recompute()
      }, handleError),
      onSnapshot(collection(db, 'notes'), snap => {
        cache.notes = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            eleveId: asString(row.eleveId),
            classe: asString(row.classe),
            subject: asString(row.matiereLabel) || asString(row.matiere) || asString(row.subject),
            matiere: asString(row.matiere),
            note: asNumber(row.note),
            cycle: asString(row.cycle),
            bareme: asNumber(row.bareme),
            importedBy: asString(row.importedBy),
          }
        })
        ready.add('notes')
        recompute()
      }, handleError),
      onSnapshot(query(collection(db, 'absences'), where('date', '>=', absencesSince)), snap => {
        cache.absences = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            eleveId: asString(row.eleveId),
            classe: asString(row.classe),
            date: asString(row.date),
            statut: asString(row.statut),
            professorId: asString(row.professorId),
          }
        })
        ready.add('absences')
        recompute()
      }, handleError),
      onSnapshot(collection(db, 'devoirs'), snap => {
        cache.devoirs = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            classeId: asString(row.classeId) || asString(row.classe),
            teacherId: asString(row.teacherId),
            dateLimite: asString(row.dateLimite),
          }
        })
        ready.add('devoirs')
        recompute()
      }, handleError),
      // Coefficients marocains : pas de gating `ready` (doc optionnel — absent
      // = tous les coef. à 1). Recalcule les moyennes pondérées si modifiés en direct.
      onSnapshot(doc(db, 'settings', 'coefficients'), snap => {
        const d = snap.data() as Record<string, unknown> | undefined
        cache.coefficients = {
          matieres: (d?.matieres as Record<string, number>) || {},
          parNiveau: (d?.parNiveau as Record<string, Record<string, number>>) || {},
        }
        recompute()
      }, () => { /* lecture refusée : coefficients tous à 1 */ }),
      ]
      return () => unsubs.forEach(unsub => unsub())
    }

    // ── Chemin rapide : lire l'agrégat serveur en 1 document ───────────────
    // Si stats/summary existe → affichage instantané (et live : la CF le
    // réécrit toutes les 30 min). Sinon → bascule sur le calcul client.
    let fallbackUnsub: Unsubscribe | null = null
    const ensureFallback = () => { if (!fallbackUnsub) fallbackUnsub = startLiveFallback() }

    const summaryUnsub = onSnapshot(
      doc(db, 'stats', 'summary'),
      snap => {
        if (snap.exists()) {
          setData(snap.data() as DashboardData)
          setLoading(false)
          setError(null)
          if (fallbackUnsub) { fallbackUnsub(); fallbackUnsub = null }
        } else {
          ensureFallback()
        }
      },
      () => ensureFallback(),
    )

    return () => {
      summaryUnsub()
      if (fallbackUnsub) fallbackUnsub()
    }
  }, [t])

  return (
    <ScreenLayout title={t('admin.statsTitle')}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading && !data ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <VisualHero
              data={data}
              theme={theme}
              t={t}
              onAction={handleStatsAction}
              onOpenNotes={openNotes}
            />
            <ViewTabs value={view} onChange={(v) => { setView(v); setSelectedNiveau(null) }} theme={theme} t={t} />
            {view === 'subjects' ? <SubjectsView data={data} onOpenNotes={openNotes} theme={theme} t={t} /> : null}
            {view === 'niveaux' ? (
              selectedNiveau != null ? (
                <NiveauClassesView
                  data={data}
                  niveau={selectedNiveau}
                  onBack={() => setSelectedNiveau(null)}
                  onAction={handleStatsAction}
                  onOpenNotes={openNotes}
                  theme={theme}
                  t={t}
                />
              ) : (
                <NiveauxView data={data} onSelectNiveau={setSelectedNiveau} theme={theme} t={t} />
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

function VisualHero({ data, theme, t, onAction, onOpenNotes }: {
  data: DashboardData; theme: Theme; t: TFunction; onAction: (action: StatsAction) => void; onOpenNotes: (target?: NotesTarget) => void
}) {
  const alerts = data.classStats.filter(item => item.healthScore < 58).length
  return (
    <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable
        onPress={() => onAction('absences')}
        accessibilityRole="button"
        accessibilityLabel={t('admin.attendanceRate')}
        style={({ pressed }) => [styles.heroMain, pressed && styles.pressed]}
      >
        <View style={[styles.livePill, { backgroundColor: theme.successSurface }]}>
          <View style={[styles.liveDot, { backgroundColor: theme.info }]} />
          <Text style={[styles.liveText, { color: theme.text }]}>{t('admin.live')}</Text>
        </View>
        <RingGauge
          value={data.presenceRate}
          color={data.presenceRate >= 92 ? theme.info : theme.danger}
          trackColor={theme.surfaceAlt}
          textColor={theme.text}
          label={t('admin.attendanceRate')}
          size={RING}
          stroke={11}
        />
      </Pressable>
      <View style={styles.heroTiles}>
        <MiniTile icon={<TrendingUp size={18} color={theme.primary} />} value={formatNote(data.avgNote)} label={t('tabs.grades')} bg={theme.primarySurface} theme={theme} onPress={() => onOpenNotes()} />
        <MiniTile icon={<AlertTriangle size={18} color={alerts > 0 ? theme.danger : theme.info} />} value={String(alerts)} label={t('admin.alerts')} bg={alerts > 0 ? theme.dangerSurface : theme.infoSurface} theme={theme} onPress={() => onAction('absences')} />
        <MiniTile icon={<BookOpen size={18} color={theme.warning} />} value={String(data.subjectStats.length)} label={t('admin.viewSubjects')} bg={theme.warningSurface} theme={theme} onPress={() => onAction('subjects')} />
      </View>
    </View>
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

function NiveauxView({ data, onSelectNiveau, theme, t }: { data: DashboardData; onSelectNiveau: (niveau: string) => void; theme: Theme; t: TFunction }) {
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
                <View style={[styles.niveauStat, { backgroundColor: niv.presenceRate >= 90 ? theme.infoSurface : theme.dangerSurface }]}>
                  <Text style={{ color: niv.presenceRate >= 90 ? theme.info : theme.danger, fontWeight: '900', fontSize: 18 }}>{niv.presenceRate}%</Text>
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
        <DistributionBars bands={data.gradeDistribution} theme={theme} />
      </ChartCard>
    </>
  )
}

function NiveauClassesView({ data, niveau, onBack, onAction, onOpenNotes, theme, t }: {
  data: DashboardData; niveau: string; onBack: () => void; onAction: (action: StatsAction) => void; onOpenNotes: (target?: NotesTarget) => void; theme: Theme; t: TFunction
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
          classes.map(item => <ClassCardRich key={item.name} item={item} onAction={onAction} onOpenNotes={onOpenNotes} theme={theme} t={t} />)
        )}
      </View>
    </>
  )
}

function ClassCardRich({ item, onAction, onOpenNotes, theme, t }: { item: ClassStats; onAction: (action: StatsAction) => void; onOpenNotes: (target?: NotesTarget) => void; theme: Theme; t: TFunction }) {
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
          onPress={() => onAction('absences')}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} ${t('admin.attendanceRate')}`}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <RingGauge value={item.presenceRate} color={healthColor} trackColor={theme.surfaceAlt} textColor={theme.text} label={t('admin.attendanceRate')} size={RING_SM} stroke={8} />
        </Pressable>
        <View style={styles.classCardMetrics}>
          <MetricLine icon={<TrendingUp size={14} color={theme.primary} />} label={t('admin.avgGrade')} value={formatNote(item.avgNote)} theme={theme} onPress={() => onOpenNotes({ classe: item.name })} />
          <MetricLine icon={<CheckCircle2 size={14} color={theme.info} />} label={t('admin.successRate')} value={item.successRate == null ? '—' : `${item.successRate}%`} theme={theme} onPress={() => onOpenNotes({ classe: item.name })} />
          <MetricLine icon={<BookOpen size={14} color={theme.warning} />} label={t('admin.homeworkShort')} value={String(item.activeHomework)} theme={theme} onPress={() => onAction('devoirs')} />
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
          onPress={() => onAction('absences')}
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

function SubjectsView({ data, onOpenNotes, theme, t }: { data: DashboardData; onOpenNotes: (target?: NotesTarget) => void; theme: Theme; t: TFunction }) {
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

function MiniTile({ icon, value, label, bg, theme, onPress }: {
  icon: React.ReactNode
  value: string
  label: string
  bg: string
  theme: Theme
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [styles.miniTile, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}
    >
      {icon}
      <Text numberOfLines={1} style={[styles.miniValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.miniLabel, { color: theme.textSoft }]}>{label}</Text>
    </Pressable>
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
  value: number
  color: string
  trackColor: string
  textColor: string
  label: string
  size: number
  stroke: number
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (circumference * clamp(value)) / 100

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
        <Text style={[styles.ringValue, { color: textColor, fontSize: size > 90 ? 25 : 15 }]}>{clamp(value)}%</Text>
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

function DistributionBars({ bands, theme }: { bands: GradeBand[]; theme: Theme }) {
  const max = Math.max(1, ...bands.map(item => item.value))
  return (
    <View style={styles.distribution}>
      {bands.map(item => (
        <View key={item.label} style={styles.distributionRow}>
          <Text style={[styles.distributionLabel, { color: theme.textSoft }]}>{item.label}</Text>
          <View style={[styles.distributionTrack, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.distributionFill, { width: `${Math.max(5, (item.value / max) * 100)}%`, backgroundColor: item.color }]} />
          </View>
          <Text style={[styles.distributionValue, { color: theme.text }]}>{item.value}</Text>
        </View>
      ))}
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
          const y = `${clamp(item.presenceRate, 14, 82)}%`
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

  hero: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 12 },
  heroMain: { width: 138, alignItems: 'center', justifyContent: 'center' },
  livePill: { position: 'absolute', top: 0, left: 0, flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, zIndex: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginEnd: 5 },
  liveText: { fontSize: 10, fontWeight: '900' },
  heroTiles: { flex: 1, gap: 8 },
  miniTile: { flex: 1, minHeight: 58, borderRadius: 8, padding: 10, justifyContent: 'center' },
  miniValue: { fontSize: 18, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
  miniLabel: { fontSize: 10, fontWeight: '800', marginTop: 1 },

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
