import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable,
  type StyleProp, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AnimatePresence, MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Award, BarChart3, BookOpenCheck, CalendarX, CheckCircle2,
  ChevronRight, ClipboardCheck, GraduationCap, TrendingDown, TrendingUp,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import { db } from '../../config/firebase'
import { toDoc } from '../../services/firestore'
import type { AbsenceDoc } from '../../services/absencesService'
import type { EleveDoc } from '../../services/elevesService'
import type { TeacherStackParamList } from '../../navigation/types'
import AnimatedCounter from '../../components/AnimatedCounter'

interface NoteRow {
  eleveId?: string
  codeMassar?: string
  classe?: string
  semestre?: string
  matiere?: string
  note?: number | string | null
  controles?: unknown[]
  controls?: unknown[]
  bareme?: number | string | null
}

interface ClassStats {
  name: string
  studentCount: number
  absencesMonth: number
  gradedStudents: number
  coverage: number
  bareme: 10 | 20
  avg20: number | null
  avgDisplay: number | null
  delta: number | null
  healthScore: number
  gradeScore: number
  absenceScore: number
  trendScore: number
  gradedIds: string[]
  action: 'notes' | 'support' | 'attendance' | 'good'
}

type ExpandedPanel = { classe: string; mode: 'score' | 'coverage' } | null

const round1 = (value: number) => Math.round(value * 10) / 10
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function baremeFromClasse(classe: string): 10 | 20 {
  return /aep/i.test(classe) ? 10 : 20
}

function baremeFromNote(row: NoteRow, fallback: 10 | 20): 10 | 20 {
  const value = asNumber(row.bareme)
  return value === 10 || value === 20 ? value : fallback
}

function validNote20(row: NoteRow, fallbackBareme: 10 | 20): number | null {
  const bareme = baremeFromNote(row, fallbackBareme)
  const note = noteValue(row, bareme)
  if (note == null) return null
  if (note < 0 || note > bareme) return null
  return note * (20 / bareme)
}

function noteValue(row: NoteRow, bareme: 10 | 20): number | null {
  const note = asNumber(row.note)
  if (note != null) return note
  const raw = Array.isArray(row.controles) ? row.controles : Array.isArray(row.controls) ? row.controls : []
  const values = raw
    .map((item) => {
      if (item && typeof item === 'object') return asNumber((item as { note?: unknown }).note)
      return asNumber(item)
    })
    .filter((value): value is number => value != null && value >= 0 && value <= bareme)
  return average(values)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function seanceForClasse(todaySlots: { classe: string; seance?: string }[], classe: string): string | undefined {
  return todaySlots.find(slot => slot.classe === classe)?.seance
}

function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

function formatDelta(value: number | null): string {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

function actionTone(action: ClassStats['action'], theme: Theme) {
  if (action === 'notes') return { color: theme.warning, bg: theme.warningSurface }
  if (action === 'support') return { color: theme.danger, bg: theme.dangerSurface }
  if (action === 'attendance') return { color: theme.info, bg: theme.infoSurface }
  return { color: theme.success, bg: theme.successSurface }
}

function triggerHaptic(kind: 'light' | 'medium') {
  const feedback = kind === 'medium'
    ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    : Haptics.selectionAsync()
  feedback.catch(() => {})
}

function studentName(e: EleveDoc): string {
  const first = e.prenomLatin || e.prenom || ''
  const last = e.nomLatin || e.nom || ''
  return `${first} ${last}`.trim() || e.codeMassar || '—'
}

function MotionPressable({ children, style, onPress, haptic, accessibilityLabel }: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  haptic?: 'light' | 'medium'
  accessibilityLabel?: string
}) {
  const [pressed, setPressed] = useState(false)

  if (!onPress) return <View style={style}>{children}</View>
  return (
    <MotiView
      style={style}
      animate={{ scale: pressed ? 0.975 : 1, opacity: pressed ? 0.88 : 1 }}
      transition={{ type: 'spring', damping: 17, stiffness: 280, mass: 0.7 }}
    >
      {children}
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          if (haptic) triggerHaptic(haptic)
          onPress()
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[StyleSheet.absoluteFill, styles.motionHitArea]}
      />
    </MotiView>
  )
}

export default function TeacherStatsScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const { profile } = useAuth()
  const teacher = useTeacherData()
  const [classStats, setClassStats] = useState<ClassStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)

  const subject = (profile?.matiere || '').trim()

  const load = useCallback(async () => {
    if (teacher.classes.length === 0 || !profile?.uid) {
      setClassStats([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const mStart = monthStart()
      const results = await Promise.all(teacher.classes.map(async (classe) => {
        const bareme = baremeFromClasse(classe)
        const absQuery = query(collection(db, 'absences'), where('classe', '==', classe))
        const notesQuery = subject
          ? query(collection(db, 'notes'), where('classe', '==', classe), where('matiere', '==', subject))
          : null

        const [absSnap, notesSnap] = await Promise.all([
          getDocs(absQuery),
          notesQuery ? getDocs(notesQuery) : Promise.resolve(null),
        ])

        const absences = new Set<string>()
        absSnap.docs.forEach((docSnap) => {
          const row = toDoc<AbsenceDoc>(docSnap)
          if (typeof row.date !== 'string' || row.date < mStart) return
          if (row.statut === 'absent') absences.add(row.eleveId || docSnap.id)
        })

        const validNotes: { eleveId: string; semestre: string; value20: number }[] = []
        notesSnap?.docs.forEach((docSnap) => {
          const row = toDoc<NoteRow>(docSnap)
          const value20 = validNote20(row, bareme)
          const eleveId = asString(row.eleveId) || asString(row.codeMassar) || docSnap.id
          if (value20 == null || !eleveId) return
          validNotes.push({
            eleveId,
            semestre: asString(row.semestre),
            value20,
          })
        })

        const hasS2 = validNotes.some(note => note.semestre === 'S2')
        const hasS1 = validNotes.some(note => note.semestre === 'S1')
        const currentSemestre = hasS2 ? 'S2' : hasS1 ? 'S1' : ''
        const currentNotes = currentSemestre
          ? validNotes.filter(note => note.semestre === currentSemestre)
          : validNotes
        const gradedIds = [...new Set(currentNotes.map(note => note.eleveId))]
        const gradedStudents = gradedIds.length
        const studentCount = teacher.byClasse[classe]?.length ?? 0
        const coverage = studentCount > 0 ? clamp(Math.round((gradedStudents / studentCount) * 100)) : 0
        const avg20 = average(currentNotes.map(note => note.value20))
        const avgDisplay = avg20 == null ? null : round1(avg20 * (bareme / 20))
        const avgS1 = average(validNotes.filter(note => note.semestre === 'S1').map(note => note.value20))
        const avgS2 = average(validNotes.filter(note => note.semestre === 'S2').map(note => note.value20))
        const delta = avgS1 != null && avgS2 != null ? round1(avgS2 - avgS1) : null
        const absenceScore = studentCount > 0 ? clamp(100 - ((absences.size / studentCount) * 120)) : 100
        const gradeScore = avg20 != null ? clamp((avg20 / 20) * 100) : 52
        const trendScore = delta == null ? 58 : clamp(58 + (delta * 8))
        const healthScore = Math.round(clamp(
          (gradeScore * 0.42) +
          (coverage * 0.26) +
          (absenceScore * 0.22) +
          (trendScore * 0.10),
        ))

        const action: ClassStats['action'] =
          coverage < 70 ? 'notes' :
          avg20 != null && avg20 < 10 ? 'support' :
          studentCount > 0 && absences.size / studentCount >= 0.25 ? 'attendance' :
          'good'

        return {
          name: classe,
          studentCount,
          absencesMonth: absences.size,
          gradedStudents,
          coverage,
          bareme,
          avg20: avg20 == null ? null : round1(avg20),
          avgDisplay,
          delta,
          healthScore,
          gradeScore: Math.round(gradeScore),
          absenceScore: Math.round(absenceScore),
          trendScore: Math.round(trendScore),
          gradedIds,
          action,
        }
      }))

      results.sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name, 'fr'))
      setClassStats(results)
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [teacher.classes.join('|'), teacher.byClasse, profile?.uid, subject, t])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const totalStudents = classStats.reduce((sum, item) => sum + item.studentCount, 0)
    const totalAbsences = classStats.reduce((sum, item) => sum + item.absencesMonth, 0)
    const totalExpected = classStats.reduce((sum, item) => sum + item.studentCount, 0)
    const totalGraded = classStats.reduce((sum, item) => sum + item.gradedStudents, 0)
    const weightedAvgRows = classStats.filter(item => item.avg20 != null && item.gradedStudents > 0)
    const avg20 = weightedAvgRows.length > 0
      ? weightedAvgRows.reduce((sum, item) => sum + (item.avg20 || 0) * item.gradedStudents, 0) /
        weightedAvgRows.reduce((sum, item) => sum + item.gradedStudents, 0)
      : null
    return {
      totalStudents,
      totalAbsences,
      coverage: totalExpected > 0 ? Math.round((totalGraded / totalExpected) * 100) : 0,
      avg20: avg20 == null ? null : round1(avg20),
      strongest: classStats[0],
      focus: classStats.length > 0 ? classStats[classStats.length - 1] : undefined,
    }
  }, [classStats])

  const openAttendance = (classe: string) => {
    navigation.navigate('TeacherAttendance', {
      classe,
      seance: seanceForClasse(teacher.todaySlots, classe),
    })
  }

  const openFolder = (classe: string) => navigation.navigate('TeacherClasseFolder', { classe })
  const openNotes = (classe: string) => navigation.navigate('TeacherNotes', { classe })

  const togglePanel = (classe: string, mode: 'score' | 'coverage') => {
    setExpandedPanel(current => (
      current?.classe === classe && current.mode === mode ? null : { classe, mode }
    ))
  }

  const missingStudentsFor = (item: ClassStats) => {
    const gradedIds = new Set(item.gradedIds)
    return (teacher.byClasse[item.name] || []).filter(e => (
      !gradedIds.has(e.codeMassar) && !gradedIds.has(e.id || '')
    ))
  }

  return (
    <ScreenLayout title={t('teacher.classPerformance')}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[styles.errorText, { color: theme.danger, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>{error}</Text>
          </View>
        ) : null}

        {loading && classStats.length === 0 ? (
          <StatsSkeleton theme={theme} />
        ) : classStats.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.textSoft, fontSize: 14 }}>{t('common.noData')}</Text>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[theme.primaryDark, theme.primary, '#2F8A72']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, theme.shadows.clay]}
            >
              <View style={[styles.heroTop, isAr && styles.rowReverse]}>
                <View style={[styles.heroCopy, isAr && styles.rtlBlock]}>
                  <Text style={[styles.heroEyebrow, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                    {subject || t('teacher.perfYourSubject')}
                  </Text>
                  <Text style={[styles.heroTitle, { fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
                    {summary.avg20 == null ? t('teacher.perfNoAverage') : <><AnimatedCounter value={summary.avg20} decimals={1} />/20</>}
                  </Text>
                  <Text style={[styles.heroSub, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
                    {t('teacher.perfHeroSubtitle', { classes: classStats.length, students: summary.totalStudents })}
                  </Text>
                </View>
                <View style={styles.heroBadge}>
                  <BarChart3 size={24} color="#fff" strokeWidth={2.2} />
                </View>
              </View>

              <View style={[styles.heroMetrics, isAr && styles.rowReverse]}>
                <HeroPill value={<><AnimatedCounter value={summary.coverage} />%</>} label={t('teacher.perfCoverage')} isAr={isAr} theme={theme} />
                <HeroPill value={<AnimatedCounter value={summary.totalAbsences} />} label={t('teacher.perfAbsencesMonth')} isAr={isAr} theme={theme} />
                <HeroPill
                  value={summary.focus?.name || '—'}
                  label={t('teacher.perfFocusClass')}
                  onPress={summary.focus ? () => openFolder(summary.focus!.name) : undefined}
                  isAr={isAr}
                  theme={theme}
                />
              </View>
            </LinearGradient>

            <View style={styles.insightGrid}>
              <InsightCard
                icon={<Award size={17} color={theme.success} strokeWidth={2.2} />}
                label={t('teacher.perfStrongClass')}
                value={summary.strongest?.name || '—'}
                detail={summary.strongest ? `${summary.strongest.healthScore}%` : '—'}
                bg={theme.successSurface}
                color={theme.success}
                theme={theme}
                isAr={isAr}
                onPress={summary.strongest ? () => openFolder(summary.strongest!.name) : undefined}
              />
              <InsightCard
                icon={<AlertTriangle size={17} color={theme.warning} strokeWidth={2.2} />}
                label={t('teacher.perfFocusClass')}
                value={summary.focus?.name || '—'}
                detail={summary.focus ? `${summary.focus.healthScore}%` : '—'}
                bg={theme.warningSurface}
                color={theme.warning}
                theme={theme}
                isAr={isAr}
                onPress={summary.focus ? () => openFolder(summary.focus!.name) : undefined}
              />
            </View>

            <View style={[styles.sectionTitleRow, isAr && styles.rowReverse]}>
              <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
                {t('teacher.perfByClass')}
              </Text>
              <Text style={[styles.sectionDetail, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                {t('teacher.perfCurrentSemester')}
              </Text>
            </View>

            {classStats.map((item, index) => (
              <MotiView
                key={item.name}
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260, delay: index * 45 }}
              >
                <ClassPerformanceCard
                  item={item}
                  missingStudents={missingStudentsFor(item)}
                  expandedMode={expandedPanel?.classe === item.name ? expandedPanel.mode : null}
                  isAr={isAr}
                  theme={theme}
                  t={t}
                  onOpenFolder={() => openFolder(item.name)}
                  onOpenNotes={() => openNotes(item.name)}
                  onOpenAttendance={() => openAttendance(item.name)}
                  onToggleScore={() => togglePanel(item.name, 'score')}
                  onToggleCoverage={() => togglePanel(item.name, 'coverage')}
                />
              </MotiView>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function HeroPill({ value, label, onPress, theme, isAr }: {
  value: React.ReactNode; label: string; onPress?: () => void; theme: Theme; isAr: boolean
}) {
  const content = (
    <>
      <Text numberOfLines={1} style={[styles.heroPillValue, { fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.heroPillLabel, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>{label}</Text>
    </>
  )
  return (
    <MotionPressable
      onPress={onPress}
      haptic={onPress ? 'light' : undefined}
      style={styles.heroPill}
      accessibilityLabel={label}
    >
      {content}
    </MotionPressable>
  )
}

function InsightCard({ icon, label, value, detail, bg, color, theme, isAr, onPress }: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  bg: string
  color: string
  theme: Theme
  isAr: boolean
  onPress?: () => void
}) {
  return (
    <MotionPressable
      onPress={onPress}
      accessibilityLabel={label}
      style={[
        styles.insightCard,
        { backgroundColor: bg, borderColor: color + '24' },
        theme.shadows.xs,
      ]}
    >
      <View style={[styles.insightIcon, { backgroundColor: color + '14' }]}>{icon}</View>
      <Text numberOfLines={1} style={[styles.insightValue, { color, fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.insightLabel, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.insightDetail, { color, fontFamily: theme.fonts.black }]}>{detail}</Text>
    </MotionPressable>
  )
}

function ClassPerformanceCard({
  item, missingStudents, expandedMode, isAr, theme, t,
  onOpenFolder, onOpenNotes, onOpenAttendance, onToggleScore, onToggleCoverage,
}: {
  item: ClassStats
  missingStudents: EleveDoc[]
  expandedMode: 'score' | 'coverage' | null
  isAr: boolean
  theme: Theme
  t: (key: string, options?: Record<string, unknown>) => string
  onOpenFolder: () => void
  onOpenNotes: () => void
  onOpenAttendance: () => void
  onToggleScore: () => void
  onToggleCoverage: () => void
}) {
  const tone = actionTone(item.action, theme)
  const deltaColor = item.delta == null ? theme.textMuted : item.delta >= 0 ? theme.success : theme.danger
  const actionLabel =
    item.action === 'notes' ? t('teacher.perfActionCompleteNotes') :
    item.action === 'support' ? t('teacher.perfActionSupport') :
    item.action === 'attendance' ? t('teacher.perfActionAttendance') :
    t('teacher.perfActionGood')

  return (
    <View style={[styles.classCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.sm]}>
      <View style={[styles.cardHead, isAr && styles.rowReverse]}>
        <MotionPressable
          onPress={onOpenFolder}
          accessibilityLabel={item.name}
          style={[styles.classOpenTarget, isAr && styles.rowReverse]}
        >
          <View style={[styles.classAvatar, { backgroundColor: theme.primary }]}>
            <Text style={[styles.classAvatarText, { fontFamily: theme.fonts.black }]}>{item.name.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={[styles.classTitleBlock, isAr && styles.rtlBlock]}>
            <Text numberOfLines={1} style={[styles.className, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
              {item.name}
            </Text>
            <Text numberOfLines={1} style={[styles.classMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
              {t('teacher.studentsCount', { count: item.studentCount })} · {item.gradedStudents}/{item.studentCount} {t('teacher.perfGradedShort').toLowerCase()}
            </Text>
          </View>
        </MotionPressable>
        <MotionPressable
          onPress={onToggleScore}
          haptic="medium"
          accessibilityLabel={t('teacher.perfScoreBreakdown')}
          style={[styles.scoreBadge, { backgroundColor: tone.bg }]}
        >
          <Text style={[styles.scoreText, { color: tone.color, fontFamily: theme.fonts.black }]}>
            {item.healthScore}%
          </Text>
          <ChevronRight size={12} color={tone.color} strokeWidth={2.4} style={expandedMode === 'score' ? styles.chevronOpen : undefined} />
        </MotionPressable>
      </View>

      <View style={[styles.actionStrip, { backgroundColor: tone.bg, borderColor: tone.color + '22' }, isAr && styles.rowReverse]}>
        <View style={[styles.actionStripIcon, { backgroundColor: tone.color + '16' }]}>
          {item.action === 'good'
            ? <CheckCircle2 size={16} color={tone.color} strokeWidth={2.3} />
            : <AlertTriangle size={16} color={tone.color} strokeWidth={2.3} />}
        </View>
        <Text numberOfLines={2} style={[styles.actionStripText, { color: tone.color, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {actionLabel}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricTile
          icon={<BookOpenCheck size={14} color={theme.primary} strokeWidth={2.1} />}
          value={item.avgDisplay == null ? '—' : `${formatNumber(item.avgDisplay, 1)}/${item.bareme}`}
          label={t('teacher.perfAvgEntered')}
          color={theme.primary}
          bg={theme.primarySurface}
          theme={theme}
          isAr={isAr}
          onPress={onOpenNotes}
        />
        <MetricTile
          icon={<GraduationCap size={14} color={theme.info} strokeWidth={2.1} />}
          value={`${item.coverage}%`}
          label={t('teacher.perfCoverage')}
          color={theme.info}
          bg={theme.infoSurface}
          theme={theme}
          isAr={isAr}
          onPress={onToggleCoverage}
          haptic="medium"
          active={expandedMode === 'coverage'}
        />
        <MetricTile
          icon={<CalendarX size={14} color={theme.warning} strokeWidth={2.1} />}
          value={String(item.absencesMonth)}
          label={t('teacher.perfAbsencesMonth')}
          color={theme.warning}
          bg={theme.warningSurface}
          theme={theme}
          isAr={isAr}
          onPress={onOpenAttendance}
        />
        <MetricTile
          icon={item.delta == null || item.delta >= 0
            ? <TrendingUp size={14} color={deltaColor} strokeWidth={2.1} />
            : <TrendingDown size={14} color={deltaColor} strokeWidth={2.1} />}
          value={formatDelta(item.delta)}
          label={t('teacher.perfS2Trend')}
          color={deltaColor}
          bg={item.delta == null ? theme.surfaceAlt : (item.delta >= 0 ? theme.successSurface : theme.dangerSurface)}
          theme={theme}
          isAr={isAr}
          onPress={onOpenNotes}
        />
      </View>

      <View style={[styles.progressWrap, { backgroundColor: theme.surfaceAlt }]}>
        <View style={[styles.progressFill, { width: `${item.healthScore}%`, backgroundColor: tone.color }]} />
      </View>

      <AnimatePresence>
        {expandedMode === 'score' ? (
          <ScoreBreakdownPanel
            key="score-panel"
            item={item}
            theme={theme}
            isAr={isAr}
            t={t}
            onOpenNotes={onOpenNotes}
          />
        ) : null}
        {expandedMode === 'coverage' ? (
          <MissingGradesPanel
            key="coverage-panel"
            item={item}
            students={missingStudents}
            theme={theme}
            isAr={isAr}
            t={t}
            onOpenNotes={onOpenNotes}
          />
        ) : null}
      </AnimatePresence>

      <View style={[styles.cardActions, isAr && styles.rowReverse]}>
        <ActionButton icon={<ClipboardCheck size={15} color={theme.primary} />} label={t('teacher.takeAttendance')} onPress={onOpenAttendance} theme={theme} isAr={isAr} />
        <ActionButton icon={<BookOpenCheck size={15} color={theme.primary} />} label={t('teacher.notesTitle')} onPress={onOpenNotes} theme={theme} isAr={isAr} />
        <ActionButton icon={<ChevronRight size={15} color={theme.primary} />} label={t('teacher.see')} onPress={onOpenFolder} theme={theme} isAr={isAr} />
      </View>
    </View>
  )
}

function ScoreBreakdownPanel({ item, theme, isAr, t, onOpenNotes }: {
  item: ClassStats
  theme: Theme
  isAr: boolean
  t: (key: string, options?: Record<string, unknown>) => string
  onOpenNotes: () => void
}) {
  const rows = [
    { id: 'notes', icon: <BookOpenCheck size={15} color={theme.primary} />, label: t('teacher.perfScoreNotes'), value: item.gradeScore, weight: 42, color: theme.primary },
    { id: 'coverage', icon: <GraduationCap size={15} color={theme.info} />, label: t('teacher.perfCoverage'), value: item.coverage, weight: 26, color: theme.info },
    { id: 'presence', icon: <CheckCircle2 size={15} color={theme.success} />, label: t('teacher.perfScorePresence'), value: item.absenceScore, weight: 22, color: theme.success },
    { id: 'trend', icon: <TrendingUp size={15} color={theme.warning} />, label: t('teacher.perfS2Trend'), value: item.trendScore, weight: 10, color: theme.warning },
  ]

  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -8 }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.detailPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={[styles.detailHead, isAr && styles.rowReverse]}>
        <View style={isAr ? styles.rtlBlock : undefined}>
          <Text style={[styles.detailTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
            {t('teacher.perfScoreBreakdown')}
          </Text>
          <Text style={[styles.detailMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
            {item.name}
          </Text>
        </View>
        <Text style={[styles.detailScore, { color: actionTone(item.action, theme).color, fontFamily: theme.fonts.black }]}>
          {item.healthScore}%
        </Text>
      </View>

      {rows.map(row => (
        <ScoreBreakdownRow key={row.id} {...row} theme={theme} isAr={isAr} t={t} />
      ))}

      <MotionPressable
        onPress={onOpenNotes}
        haptic="light"
        accessibilityLabel={t('teacher.notesTitle')}
        style={[styles.panelButton, { backgroundColor: theme.primarySurface }]}
      >
        <BookOpenCheck size={15} color={theme.primary} strokeWidth={2.2} />
        <Text numberOfLines={1} style={[styles.panelButtonText, { color: theme.primary, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {t('teacher.notesTitle')}
        </Text>
      </MotionPressable>
    </MotiView>
  )
}

function ScoreBreakdownRow({ icon, label, value, weight, color, theme, isAr, t }: {
  icon: React.ReactNode
  label: string
  value: number
  weight: number
  color: string
  theme: Theme
  isAr: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <View style={styles.scoreRow}>
      <View style={[styles.scoreRowTop, isAr && styles.rowReverse]}>
        <View style={[styles.scoreLabelWrap, isAr && styles.rowReverse]}>
          <View style={[styles.scoreIconBox, { backgroundColor: color + '14' }]}>{icon}</View>
          <Text numberOfLines={1} style={[styles.scoreLabel, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
            {label}
          </Text>
        </View>
        <Text style={[styles.scoreValue, { color, fontFamily: theme.fonts.black }]}>{value}%</Text>
      </View>
      <View style={[styles.scoreTrack, { backgroundColor: theme.surfaceAlt }]}>
        <View style={[styles.scoreFill, { width: `${clamp(value)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreWeight, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
        {t('teacher.perfScoreWeightSuffix', { pct: weight })}
      </Text>
    </View>
  )
}

function MissingGradesPanel({ item, students, theme, isAr, t, onOpenNotes }: {
  item: ClassStats
  students: EleveDoc[]
  theme: Theme
  isAr: boolean
  t: (key: string, options?: Record<string, unknown>) => string
  onOpenNotes: () => void
}) {
  const shown = students.slice(0, 3)
  const extra = Math.max(0, students.length - shown.length)

  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -8 }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.detailPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={[styles.detailHead, isAr && styles.rowReverse]}>
        <View style={isAr ? styles.rtlBlock : undefined}>
          <Text style={[styles.detailTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
            {t('teacher.perfMissingGradesTitle')}
          </Text>
          <Text style={[styles.detailMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
            {item.gradedStudents}/{item.studentCount} {t('teacher.perfGradedShort').toLowerCase()} · {item.coverage}%
          </Text>
        </View>
        <GraduationCap size={20} color={theme.info} strokeWidth={2.2} />
      </View>

      {students.length === 0 ? (
        <View style={[styles.emptyInline, isAr && styles.rowReverse]}>
          <CheckCircle2 size={17} color={theme.success} strokeWidth={2.2} />
          <Text style={[styles.emptyInlineText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
            {t('teacher.perfMissingGradesEmpty')}
          </Text>
        </View>
      ) : (
        <View style={styles.studentPreviewList}>
          {shown.map((student, index) => (
            <View key={student.id || student.codeMassar || index} style={[styles.studentPreviewRow, isAr && styles.rowReverse, { borderColor: theme.border }]}>
              <View style={[styles.studentDot, { backgroundColor: theme.warning }]} />
              <Text numberOfLines={1} style={[styles.studentPreviewName, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
                {studentName(student)}
              </Text>
            </View>
          ))}
          {extra > 0 ? (
            <Text style={[styles.moreStudents, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
              {t('teacher.perfMissingGradesMore', { count: extra })}
            </Text>
          ) : null}
        </View>
      )}

      <MotionPressable
        onPress={onOpenNotes}
        haptic="light"
        accessibilityLabel={t('teacher.perfMissingGradesCta')}
        style={[styles.panelButton, { backgroundColor: theme.primarySurface }]}
      >
        <BookOpenCheck size={15} color={theme.primary} strokeWidth={2.2} />
        <Text numberOfLines={1} style={[styles.panelButtonText, { color: theme.primary, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {t('teacher.perfMissingGradesCta')}
        </Text>
      </MotionPressable>
    </MotiView>
  )
}

function MetricTile({ icon, value, label, color, bg, theme, isAr, onPress, haptic, active }: {
  icon: React.ReactNode
  value: string
  label: string
  color: string
  bg: string
  theme: Theme
  isAr: boolean
  onPress?: () => void
  haptic?: 'light' | 'medium'
  active?: boolean
}) {
  return (
    <MotionPressable
      onPress={onPress}
      haptic={haptic}
      accessibilityLabel={label}
      style={[
        styles.metricTile,
        {
          backgroundColor: bg,
          borderColor: active ? color : 'transparent',
        },
      ]}
    >
      <View style={[styles.metricIconWrap, { backgroundColor: color + '14' }]}>
        {icon}
      </View>
      <View style={[styles.metricTextBlock, isAr && styles.rtlBlock]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={[styles.metricValue, { color, fontFamily: theme.fonts.black }]}
        >
          {value}
        </Text>
        <Text numberOfLines={2} style={[styles.metricLabel, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>
          {label}
        </Text>
      </View>
    </MotionPressable>
  )
}

function ActionButton({ icon, label, onPress, theme, isAr }: {
  icon: React.ReactNode
  label: string
  onPress: () => void
  theme: Theme
  isAr: boolean
}) {
  return (
    <MotionPressable
      onPress={onPress}
      haptic="light"
      accessibilityLabel={label}
      style={[styles.actionBtn, { backgroundColor: theme.primarySurface }]}
    >
      {icon}
      <Text numberOfLines={1} style={[styles.actionBtnText, { color: theme.primary, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>{label}</Text>
    </MotionPressable>
  )
}

function StatsSkeleton({ theme }: { theme: Theme }) {
  return (
    <>
      <View style={[styles.hero, { backgroundColor: theme.card, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }, theme.shadows.xs]}>
        <SkeletonBlock theme={theme} style={{ width: '38%', height: 12, borderRadius: 999 }} />
        <SkeletonBlock theme={theme} style={{ width: '58%', height: 42, borderRadius: 14, marginTop: 12 }} />
        <SkeletonBlock theme={theme} style={{ width: '72%', height: 12, borderRadius: 999, marginTop: 10 }} />
        <View style={styles.heroMetrics}>
          <SkeletonBlock theme={theme} style={{ flex: 1, height: 58, borderRadius: 18 }} />
          <SkeletonBlock theme={theme} style={{ flex: 1, height: 58, borderRadius: 18 }} />
          <SkeletonBlock theme={theme} style={{ flex: 1, height: 58, borderRadius: 18 }} />
        </View>
      </View>

      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.classCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <View style={styles.cardHead}>
            <SkeletonBlock theme={theme} style={{ width: 44, height: 44, borderRadius: 15 }} />
            <View style={{ flex: 1, gap: 7 }}>
              <SkeletonBlock theme={theme} style={{ width: '42%', height: 16, borderRadius: 999 }} />
              <SkeletonBlock theme={theme} style={{ width: '68%', height: 10, borderRadius: 999 }} />
            </View>
            <SkeletonBlock theme={theme} style={{ width: 48, height: 34, borderRadius: 13 }} />
          </View>
          <SkeletonBlock theme={theme} style={{ height: 44, borderRadius: 15, marginTop: 12 }} />
          <View style={styles.metricsGrid}>
            <SkeletonBlock theme={theme} style={styles.metricSkeleton} />
            <SkeletonBlock theme={theme} style={styles.metricSkeleton} />
            <SkeletonBlock theme={theme} style={styles.metricSkeleton} />
            <SkeletonBlock theme={theme} style={styles.metricSkeleton} />
          </View>
        </View>
      ))}
    </>
  )
}

function SkeletonBlock({ theme, style }: { theme: Theme; style: StyleProp<ViewStyle> }) {
  return (
    <MotiView
      from={{ opacity: 0.42 }}
      animate={{ opacity: 0.86 }}
      transition={{ type: 'timing', duration: 820, loop: true, repeatReverse: true }}
      style={[{ backgroundColor: theme.surfaceAlt }, style]}
    />
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32, gap: 14 },
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 12 },
  errorText: { fontSize: 13 },
  motionHitArea: { zIndex: 2 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },

  hero: { borderRadius: 28, padding: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: 'rgba(255,255,255,0.76)', fontSize: 12 },
  heroTitle: { color: '#fff', fontSize: 40, lineHeight: 47, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroSub: { color: 'rgba(255,255,255,0.80)', fontSize: 12.5 },
  heroBadge: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)' },
  heroMetrics: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroPill: { flex: 1, minHeight: 58, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  heroPillValue: { color: '#fff', fontSize: 17, fontVariant: ['tabular-nums'] },
  heroPillLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 10, marginTop: 3, letterSpacing: 0.2 },

  insightGrid: { flexDirection: 'row', gap: 10 },
  insightCard: { flex: 1, minHeight: 114, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  insightIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  insightValue: { fontSize: 20, marginTop: 9 },
  insightLabel: { fontSize: 11, marginTop: 2 },
  insightDetail: { fontSize: 13, marginTop: 8, fontVariant: ['tabular-nums'] },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  sectionTitle: { flex: 1, fontSize: 18 },
  sectionDetail: { fontSize: 11.5 },

  classCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 13 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  classOpenTarget: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  classAvatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  classAvatarText: { color: '#fff', fontSize: 14 },
  classTitleBlock: { flex: 1, minWidth: 0 },
  className: { fontSize: 18 },
  classMeta: { fontSize: 11.5, marginTop: 2 },
  scoreBadge: { minWidth: 54, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3, paddingHorizontal: 8 },
  scoreText: { fontSize: 15, fontVariant: ['tabular-nums'] },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  actionStrip: { minHeight: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  actionStripIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionStripText: { flex: 1, minWidth: 0, fontSize: 12.5 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metricTile: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 132,
    minHeight: 70,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  metricIconWrap: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricTextBlock: { flex: 1, minWidth: 0 },
  metricValue: { fontSize: 17, lineHeight: 21, fontVariant: ['tabular-nums'] },
  metricLabel: { fontSize: 10.5, lineHeight: 13, marginTop: 1, letterSpacing: 0.1 },
  metricSkeleton: { flexBasis: '48%', flexGrow: 1, minWidth: 132, height: 70, borderRadius: 16 },
  progressWrap: { height: 7, borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: 7, borderRadius: 999 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, minHeight: 38, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  actionBtnText: { flexShrink: 1, fontSize: 11.5 },

  detailPanel: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginTop: 12 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  detailTitle: { fontSize: 14.5 },
  detailMeta: { fontSize: 11.5, marginTop: 2 },
  detailScore: { fontSize: 18, fontVariant: ['tabular-nums'] },
  scoreRow: { marginBottom: 10 },
  scoreRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  scoreLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  scoreIconBox: { width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scoreLabel: { flex: 1, minWidth: 0, fontSize: 12.5 },
  scoreValue: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  scoreTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 7 },
  scoreFill: { height: 6, borderRadius: 999 },
  scoreWeight: { fontSize: 10.5, marginTop: 4 },
  panelButton: { minHeight: 40, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4, paddingHorizontal: 10 },
  panelButtonText: { flexShrink: 1, fontSize: 12.5 },
  emptyInline: { minHeight: 42, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyInlineText: { flex: 1, fontSize: 12.5 },
  studentPreviewList: { gap: 0 },
  studentPreviewRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  studentDot: { width: 6, height: 6, borderRadius: 3 },
  studentPreviewName: { flex: 1, minWidth: 0, fontSize: 13 },
  moreStudents: { fontSize: 11.5, marginTop: 8 },
})
