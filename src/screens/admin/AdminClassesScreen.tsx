import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable,
} from 'react-native'
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, GraduationCap, TrendingUp, Users,
} from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import type { AdminDashboardNav } from '../../navigation/types'
import { currentAcademicPeriod } from '../../utils/academicPeriod'

type CollectionName = 'eleves' | 'notes' | 'absences' | 'devoirs'

interface EleveRow {
  id: string
  classe: string
  niveau: string
}

interface NoteRow {
  id: string
  eleveId: string
  classe: string
  matiere: string
  note: number | null
  cycle: string
  bareme: number | null
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
}

interface DevoirRow {
  id: string
  classeId: string
  dateLimite: string
}

interface TrendPoint {
  label: string
  value: number
}

interface ClasseStat {
  name: string
  niveau: string
  eleveCount: number
  presenceRate: number
  avgNote: number | null
  successRate: number | null
  notesCount: number
  absentsToday: number
  incidentsMonth: number
  activeHomework: number
  healthScore: number
  trend: TrendPoint[]
}

interface SnapshotCache {
  eleves: EleveRow[]
  notes: NoteRow[]
  absences: AbsenceRow[]
  devoirs: DevoirRow[]
  coefficients: CoefConfig
}

const COLLECTIONS: CollectionName[] = ['eleves', 'notes', 'absences', 'devoirs']
const RING_SIZE = 74
const RING_STROKE = 8

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

/** Primaire (…AEP) noté /10, sinon /20 — cf. AdminStatsScreen.baremeFromNote. */
function baremeFromNote(row: Pick<NoteRow, 'bareme' | 'cycle' | 'classe'>): 10 | 20 {
  if (row.bareme === 10 || row.bareme === 20) return row.bareme
  if (row.cycle.toLowerCase() === 'primaire') return 10
  return /aep/i.test(row.classe) ? 10 : 20
}

/** Normalise une note sur 20 pour comparer/agréger des classes de barèmes différents. */
function noteOn20(row: NoteRow): number | null {
  if (row.note == null) return null
  const bareme = baremeFromNote(row)
  if (row.note < 0 || row.note > bareme) return null
  return row.note * (20 / bareme)
}

/**
 * Coefficients marocains (settings/coefficients) — miroir exact de coefOf()
 * dans mojammaa-admin/src/pages/Statistiques.tsx : parNiveau[niveau][matiere]
 * > matieres[matiere] (global) > 1.
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

function buildClassStats(cache: SnapshotCache): ClasseStat[] {
  const today = todayISO()
  const monthStart = monthStartISO()
  const days = lastDays(5)
  const eleveNiveauById = new Map(cache.eleves.map(e => [e.id, e.niveau]))
  const coefOf = makeCoefOf(cache.coefficients)
  const classStudents = new Map<string, EleveRow[]>()
  const notesByClass = new Map<string, NoteRow[]>()
  const absentTodayByClass = new Map<string, Set<string>>()
  const incidentsMonthByClass = new Map<string, number>()
  const homeworkByClass = new Map<string, number>()
  const trendByClass = new Map<string, Map<string, Set<string>>>()

  cache.eleves.forEach(eleve => {
    if (!eleve.classe) return
    const rows = classStudents.get(eleve.classe) || []
    rows.push(eleve)
    classStudents.set(eleve.classe, rows)
  })

  cache.notes.forEach(note => {
    if (!note.classe || noteOn20(note) == null) return
    const rows = notesByClass.get(note.classe) || []
    rows.push(note)
    notesByClass.set(note.classe, rows)
  })

  cache.absences.forEach(absence => {
    if (!absence.classe || (!isAbsent(absence) && !isLate(absence))) return
    if (absence.date === today && isAbsent(absence)) {
      const rows = absentTodayByClass.get(absence.classe) || new Set<string>()
      rows.add(absence.eleveId || absence.id)
      absentTodayByClass.set(absence.classe, rows)
    }
    if (absence.date >= monthStart) {
      incidentsMonthByClass.set(absence.classe, (incidentsMonthByClass.get(absence.classe) || 0) + 1)
    }
    const day = days.find(item => item.iso === absence.date)
    if (day) {
      const classMap = trendByClass.get(absence.classe) || new Map<string, Set<string>>()
      const set = classMap.get(day.iso) || new Set<string>()
      set.add(`${absence.eleveId || absence.id}-${absence.statut}`)
      classMap.set(day.iso, set)
      trendByClass.set(absence.classe, classMap)
    }
  })

  cache.devoirs.forEach(devoir => {
    if (!devoir.classeId || !isActiveHomework(devoir, today)) return
    homeworkByClass.set(devoir.classeId, (homeworkByClass.get(devoir.classeId) || 0) + 1)
  })

  return [...classStudents.entries()].map(([name, students]) => {
    const classNotes = notesByClass.get(name) || []
    // Notes normalisées /20 (équivalent primaire/collège) puis pondérées par
    // coefficient matière (settings/coefficients) : moyenne par élève, puis
    // moyennée sur la classe — miroir de AdminStatsScreen/schoolStats.js.
    const notesByEleve = new Map<string, { v: number; c: number }[]>()
    const noteValues: number[] = []
    classNotes.forEach(note => {
      const on20 = noteOn20(note)
      if (!note.eleveId || on20 == null) return
      noteValues.push(on20)
      const rows = notesByEleve.get(note.eleveId) || []
      rows.push({ v: on20, c: coefOf(note.matiere, eleveNiveauById.get(note.eleveId)) })
      notesByEleve.set(note.eleveId, rows)
    })

    const averages = [...notesByEleve.values()].map(pairs => weightedAvg(pairs))
    const absentsToday = absentTodayByClass.get(name)?.size || 0
    const presenceRate = students.length > 0 ? Math.round(((students.length - absentsToday) / students.length) * 100) : 100
    const avgNote = averages.length > 0 ? round1(averages.reduce((sum, value) => sum + value, 0) / averages.length) : null
    const successRate = averages.length > 0
      ? Math.round((averages.filter(value => value >= 10).length / averages.length) * 100)
      : null
    const noteScore = avgNote == null ? 55 : (avgNote / 20) * 100
    const successScore = successRate ?? 55
    const incidentsPenalty = Math.min(24, (incidentsMonthByClass.get(name) || 0) * 2)
    const niveau = students.find(eleve => eleve.niveau)?.niveau || ''
    const classTrend = trendByClass.get(name)

    return {
      name,
      niveau,
      eleveCount: students.length,
      presenceRate: clamp(presenceRate),
      avgNote,
      successRate,
      notesCount: noteValues.length,
      absentsToday,
      incidentsMonth: incidentsMonthByClass.get(name) || 0,
      activeHomework: homeworkByClass.get(name) || 0,
      healthScore: clamp(Math.round((presenceRate * 0.45) + (noteScore * 0.35) + (successScore * 0.20) - incidentsPenalty)),
      trend: days.map(day => ({
        label: day.label,
        value: classTrend?.get(day.iso)?.size || 0,
      })),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export default function AdminClassesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<AdminDashboardNav>()
  const [classes, setClasses] = useState<ClasseStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const period = currentAcademicPeriod()

  useEffect(() => {
    const cache: SnapshotCache = {
      eleves: [],
      notes: [],
      absences: [],
      devoirs: [],
      coefficients: { matieres: {}, parNiveau: {} },
    }
    const ready = new Set<CollectionName>()

    const recompute = () => {
      if (ready.size !== COLLECTIONS.length) return
      setClasses(buildClassStats(cache))
      setLoading(false)
      setError(null)
    }

    const handleError = (err: Error) => {
      setError(err.message || t('common.error'))
      setLoading(false)
    }

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
      onSnapshot(query(
        collection(db, 'notes'),
        where('academicYear', '==', period.academicYear),
        where('semestre', '==', period.semestre),
      ), snap => {
        cache.notes = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            eleveId: asString(row.eleveId),
            classe: asString(row.classe),
            matiere: asString(row.matiere),
            note: asNumber(row.note),
            cycle: asString(row.cycle),
            bareme: asNumber(row.bareme),
          }
        })
        ready.add('notes')
        recompute()
      }, handleError),
      onSnapshot(query(
        collection(db, 'absences'),
        where('academicYear', '==', period.academicYear),
        where('monthKey', '==', period.monthKey),
      ), snap => {
        cache.absences = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            eleveId: asString(row.eleveId),
            classe: asString(row.classe),
            date: asString(row.date),
            statut: asString(row.statut),
          }
        })
        ready.add('absences')
        recompute()
      }, handleError),
      onSnapshot(query(
        collection(db, 'devoirs'),
        where('academicYear', '==', period.academicYear),
        where('monthKey', '==', period.monthKey),
      ), snap => {
        cache.devoirs = snap.docs.map(docSnap => {
          const row = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            classeId: asString(row.classeId) || asString(row.classe),
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
  }, [period.academicYear, period.monthKey, period.semestre, t])

  const totalEleves = useMemo(() => classes.reduce((sum, item) => sum + item.eleveCount, 0), [classes])
  const averageSize = classes.length > 0 ? Math.round(totalEleves / classes.length) : 0
  const bestPresence = classes.reduce((best, item) => Math.max(best, item.presenceRate), 0)

  const renderHeader = () => (
    <>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
          <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '600' }}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.livePanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.textSoft }]}>{t('admin.classAnalytics')}</Text>
          <Text style={[styles.liveTitle, { color: theme.text }]}>
            {t('admin.classesTotal', { classes: classes.length, students: totalEleves })}
          </Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: theme.successSurface }]}>
          <View style={[styles.liveDot, { backgroundColor: theme.info }]} />
          <Text style={[styles.liveBadgeText, { color: theme.text }]}>{t('admin.live')}</Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard icon={<GraduationCap size={17} color={theme.primary} />} value={String(classes.length)} label={t('tabs.classes')} bg={theme.primarySurface} theme={theme} />
        <SummaryCard icon={<Users size={17} color={theme.info} />} value={String(totalEleves)} label={t('admin.eleves')} bg={theme.infoSurface} theme={theme} />
        <SummaryCard icon={<Activity size={17} color={theme.accent} />} value={String(averageSize)} label={t('admin.averageSize')} bg={theme.accentSurface} theme={theme} />
        <SummaryCard icon={<CheckCircle2 size={17} color={theme.warning} />} value={`${bestPresence}%`} label={t('admin.bestPresence')} bg={theme.warningSurface} theme={theme} />
      </View>
    </>
  )

  const renderItem = ({ item }: { item: ClasseStat }) => (
    <ClassCard item={item} nav={nav} theme={theme} t={t} />
  )

  return (
    <ScreenLayout title={t('admin.classesTitle')}>
      {loading && classes.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : classes.length === 0 && !error ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('admin.noClassInDb')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={item => item.name}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenLayout>
  )
}

function SummaryCard({ icon, value, label, bg, theme }: {
  icon: React.ReactNode
  value: string
  label: string
  bg: string
  theme: Theme
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[styles.summaryValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.summaryLabel, { color: theme.textSoft }]}>{label}</Text>
    </View>
  )
}

function ClassCard({ item, nav, theme, t }: { item: ClasseStat; nav: AdminDashboardNav; theme: Theme; t: (key: string, params?: Record<string, unknown>) => string }) {
  const healthColor = item.healthScore >= 75 ? theme.info : item.healthScore >= 55 ? theme.warning : theme.danger
  const goAbsences = () => nav.navigate('AdminAbsences')
  const goDevoirs = () => nav.navigate('AdminDevoirs')
  const goNotes = () => nav.navigate('AdminMatiereDetail', { classe: item.name })
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.classTitleArea}>
          <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
          {item.niveau ? <Text style={[styles.niveau, { color: theme.textSoft }]}>{item.niveau}</Text> : null}
        </View>
        <View style={[styles.countPill, { backgroundColor: theme.primarySurface }]}>
          <Users size={13} color={theme.primary} />
          <Text style={[styles.countPillText, { color: theme.primary }]}>{item.eleveCount}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Pressable onPress={goAbsences} accessibilityRole="button" accessibilityLabel={`${item.name} ${t('admin.attendanceRate')}`}>
          <RingGauge value={item.presenceRate} color={healthColor} trackColor={theme.surfaceAlt} textColor={theme.text} label={t('admin.attendanceRate')} />
        </Pressable>
        <View style={styles.metricColumn}>
          <MetricRow icon={<TrendingUp size={15} color={theme.primary} />} label={t('admin.avgGrade')} value={item.avgNote == null ? '—' : `${item.avgNote}/20`} theme={theme} onPress={goNotes} />
          <MetricRow icon={<CheckCircle2 size={15} color={theme.info} />} label={t('admin.successRate')} value={item.successRate == null ? '—' : `${item.successRate}%`} theme={theme} onPress={goNotes} />
          <MetricRow icon={<BookOpen size={15} color={theme.warning} />} label={t('admin.homeworkShort')} value={item.activeHomework} theme={theme} onPress={goDevoirs} />
        </View>
      </View>

      <View style={styles.healthLine}>
        <Text style={[styles.healthLabel, { color: theme.textSoft }]}>{t('admin.classHealth')}</Text>
        <View style={[styles.healthBar, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.healthFill, { width: `${item.healthScore}%`, backgroundColor: healthColor }]} />
        </View>
        <Text style={[styles.healthValue, { color: healthColor }]}>{item.healthScore}%</Text>
      </View>

      <View style={styles.footerRow}>
        <Pressable
          onPress={goAbsences}
          accessibilityRole="button"
          accessibilityLabel={`${item.incidentsMonth} ${t('tabs.absences')}`}
          style={[styles.footerPill, { backgroundColor: theme.dangerSurface }]}
        >
          <AlertTriangle size={12} color={theme.danger} />
          <Text style={[styles.footerPillText, { color: theme.danger }]}>
            {item.incidentsMonth}
          </Text>
        </Pressable>
        <MiniTrend points={item.trend} color={theme.primary} mutedColor={theme.primarySurface} textColor={theme.textSoft} />
      </View>
    </View>
  )
}

function MetricRow({ icon, label, value, theme, onPress }: {
  icon: React.ReactNode
  label: string
  value: number | string
  theme: Theme
  onPress?: () => void
}) {
  const content = (
    <>
      <View style={styles.metricRowIcon}>{icon}</View>
      <Text numberOfLines={1} style={[styles.metricRowLabel, { color: theme.textSoft }]}>{label}</Text>
      <Text style={[styles.metricRowValue, { color: theme.text }]}>{value}</Text>
    </>
  )
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value}`}
        style={({ pressed }) => [styles.metricRow, pressed && { opacity: 0.65 }]}
      >
        {content}
      </Pressable>
    )
  }
  return <View style={styles.metricRow}>{content}</View>
}

function RingGauge({ value, color, trackColor, textColor, label }: {
  value: number
  color: string
  trackColor: string
  textColor: string
  label: string
}) {
  const radius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (circumference * clamp(value)) / 100

  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} stroke={trackColor} strokeWidth={RING_STROKE} fill="transparent" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringValue, { color: textColor }]}>{clamp(value)}%</Text>
        <Text style={[styles.ringLabel, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  )
}

function MiniTrend({ points, color, mutedColor, textColor }: {
  points: TrendPoint[]
  color: string
  mutedColor: string
  textColor: string
}) {
  const max = Math.max(1, ...points.map(point => point.value))
  return (
    <View style={styles.trendWrap}>
      {points.map(point => (
        <View key={point.label} style={styles.trendItem}>
          <View style={[styles.trendTrack, { backgroundColor: mutedColor }]}>
            <View style={[styles.trendFill, { height: Math.max(4, Math.round((point.value / max) * 26)), backgroundColor: color }]} />
          </View>
          <Text style={[styles.trendLabel, { color: textColor }]}>{point.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 28 },
  loading: { paddingVertical: 48, alignItems: 'center' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 12 },

  livePanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  liveTitle: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginEnd: 6 },
  liveBadgeText: { fontSize: 11, fontWeight: '900' },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  summaryCard: { width: '48.5%', minHeight: 112, borderWidth: 1, borderRadius: 8, padding: 12 },
  summaryIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  card: { borderWidth: 1, borderRadius: 8, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  classTitleArea: { flex: 1, paddingEnd: 10 },
  name: { fontSize: 18, fontWeight: '900' },
  niveau: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  countPill: { minWidth: 52, height: 32, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  countPillText: { fontSize: 13, fontWeight: '900', marginStart: 5 },

  cardBody: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 16, fontWeight: '900' },
  ringLabel: { fontSize: 8, fontWeight: '800', opacity: 0.62 },
  metricColumn: { flex: 1, gap: 7 },
  metricRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center' },
  metricRowIcon: { width: 25, alignItems: 'flex-start' },
  metricRowLabel: { flex: 1, fontSize: 11, fontWeight: '700' },
  metricRowValue: { fontSize: 13, fontWeight: '900', marginStart: 8 },

  healthLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  healthLabel: { width: 68, fontSize: 10, fontWeight: '800' },
  healthBar: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  healthFill: { height: 8, borderRadius: 999 },
  healthValue: { width: 38, textAlign: 'right', fontSize: 11, fontWeight: '900' },

  footerRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' },
  footerPillText: { fontSize: 10, fontWeight: '900', marginStart: 5 },
  trendWrap: { flex: 1, height: 38, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 5 },
  trendItem: { width: 16, alignItems: 'center' },
  trendTrack: { width: 12, height: 28, borderRadius: 7, overflow: 'hidden', justifyContent: 'flex-end' },
  trendFill: { width: 12, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  trendLabel: { fontSize: 8, fontWeight: '700', marginTop: 2 },
})
