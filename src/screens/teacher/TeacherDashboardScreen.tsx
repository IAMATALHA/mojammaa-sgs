/**
 * TeacherDashboardScreen — premium SaaS dashboard for the teacher role.
 *
 * Every card / quick-action is wired to navigation.
 * KPIs read real Firestore data via useTeacherData().
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Text, Pressable, Image,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import type { TeacherDashboardNav } from '../../navigation/types'
import {
  Layers, Users, Percent, ClipboardCheck,
  ChevronRight, Send, BookOpen, Clock3, MoonStar,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import { useTeacherDayCompletion } from '../../hooks/useTeacherDayCompletion'
import { useTeacherPrayerActivity } from '../../hooks/useTeacherPrayerActivity'
import {
  QuickActions,
} from '../../components/dashboard'
import {
  type QuickAction,
} from '../../utils/dashboardTypes'
import type { WeeklySlot } from '../../services/scheduleService'
import { greetingKey, hexWithAlpha } from '../../utils/format'
import { localServiceDate } from '../../services/pickup-service'
import {
  findCurrentScheduleSlot,
  resolveScheduleSessionCode,
  scheduleLessonKey,
} from '../../utils/scheduleSession'

const TEACHER_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa1', label: 'Faire l\'appel',  labelKey: 'actions.takeAttendance', icon: 'check-circle', tint: 'primary' },
  { id: 'qa3', label: 'Nouveau devoir',  labelKey: 'actions.newHomework',    icon: 'book-open',    tint: 'info'    },
  { id: 'qa4', label: 'Envoyer message', labelKey: 'actions.sendMessage',    icon: 'send',         tint: 'success' },
  { id: 'qa5', label: 'Performance',     labelKey: 'actions.performance',    icon: 'bar-chart-3',  tint: 'accent'  },
]

type TeacherQuickRoute = 'TeacherEdt' | 'TeacherDevoirs' | 'TeacherMessages' | 'TeacherStats'

const QUICK_ACTION_ROUTES: Record<string, TeacherQuickRoute> = {
  qa3: 'TeacherDevoirs',   // Nouveau devoir
  qa4: 'TeacherMessages',  // Envoyer message
  qa5: 'TeacherStats',     // Performance
}

export default function TeacherDashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile } = useAuth()
  const teacher = useTeacherData()
  // useTeacherDayCompletion ne lit que `.classe` sur chaque créneau ; les
  // champs WeeklySlot manquants (day, durationMin) ne lui servent pas ici.
  const { attendanceDone, homeworkPosted } = useTeacherDayCompletion(
    teacher.todaySlots as unknown as WeeklySlot[], profile?.uid,
  )
  const nav = useNavigation<TeacherDashboardNav>()
  const [refreshing, setRefreshing] = useState(false)
  const [showGreeting, setShowGreeting] = useState(true)
  const loading = teacher.loading
  const serviceDate = localServiceDate()
  const prayerActivity = useTeacherPrayerActivity(teacher.classes, serviceDate, profile?.uid)

  // Le toast de salutation s'affiche une seule fois au montage puis s'efface.
  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(false), 2600)
    return () => clearTimeout(id)
  }, [])

  const currentSlot = teacher.todaySlots.find(s => s.status === 'now')
  const currentScheduleSlot = findCurrentScheduleSlot(teacher.schedule?.weeklySlots ?? [])
  const currentAttendanceSeance = currentScheduleSlot
    ? resolveScheduleSessionCode(currentScheduleSlot)
    : null
  const focusSlot = currentSlot
    ?? teacher.todaySlots.find(s => s.status === 'upcoming')
    ?? teacher.todaySlots[teacher.todaySlots.length - 1]
  const focusSeance = focusSlot ? resolveScheduleSessionCode(focusSlot) : null
  const currentPrayerSession = currentScheduleSlot
    ? prayerActivity.sessions.find(session => session.classe === currentScheduleSlot.classe) ?? null
    : null
  const prayerClasse = prayerActivity.activeSession?.classe
    ?? (currentScheduleSlot && !currentPrayerSession ? currentScheduleSlot.classe : null)
  const focusAttendanceDone = !!focusSlot && !!focusSeance && attendanceDone.has(`${focusSlot.classe}|${focusSeance}`)
  const focusHomeworkDone = !!focusSlot && homeworkPosted.has(focusSlot.classe)
  const focusStudents = focusSlot ? (teacher.byClasse[focusSlot.classe]?.length ?? 0) : teacher.kpis.students
  const doneCount = teacher.todaySlots.filter(s => s.status === 'done').length
  const totalCount = teacher.todaySlots.length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const teacherAccent = theme.info
  const attendanceTone = teacher.kpis.attendance >= 90
    ? theme.success
    : teacher.kpis.attendance >= 75
      ? theme.warning
      : theme.danger
  const focusIsActionable = !!focusSlot && focusSlot.status !== 'done'
  const focusCanTakeAttendance = !!(
    currentSlot
    && currentScheduleSlot
    && currentAttendanceSeance
    && currentSlot.classe === currentScheduleSlot.classe
    && currentSlot.startTime === currentScheduleSlot.startTime
  )
  const focusStatusLabel = !focusSlot
    ? t('teacher.noCourseToday')
    : focusSlot.status === 'now'
      ? t('teacher.currentCourse')
      : focusSlot.status === 'upcoming'
        ? t('teacher.nextCourse')
        : t('teacher.finishedToday')
  const heroActionLabel = focusCanTakeAttendance
    ? t('teacher.heroActionAttendance')
    : t('teacher.heroActionSchedule')

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }, [])

  const goTo = (route: TeacherQuickRoute) => nav.navigate(route)

  const handleQuickAction = (action: QuickAction) => {
    // "Faire l'appel" n'ouvre que le cours réellement en cours. Sans cible
    // exacte, l'enseignant choisit le créneau depuis son emploi du temps.
    if (action.id === 'qa1') {
      if (currentScheduleSlot && currentAttendanceSeance) {
        nav.navigate('TeacherAttendance', {
          lessonKey: scheduleLessonKey(currentScheduleSlot),
        })
      } else {
        goTo('TeacherEdt')
      }
      return
    }
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  const openFocusAttendance = () => {
    if (!focusCanTakeAttendance || !currentScheduleSlot) {
      goTo('TeacherEdt')
      return
    }
    nav.navigate('TeacherAttendance', {
      lessonKey: scheduleLessonKey(currentScheduleSlot),
    })
  }

  const openFocusHomework = () => {
    if (!focusSlot) {
      goTo('TeacherDevoirs')
      return
    }
    nav.navigate('TeacherDevoirsDetail', { classe: focusSlot.classe })
  }

  const openHero = () => {
    if (focusCanTakeAttendance) {
      openFocusAttendance()
      return
    }
    goTo('TeacherEdt')
  }

  const openFocusClass = () => {
    if (!focusSlot) {
      nav.navigate('TeacherClasses')
      return
    }
    nav.navigate('TeacherClasseFolder', { classe: focusSlot.classe })
  }

  const openFocusStudents = () => {
    if (!focusSlot) {
      nav.navigate('TeacherClasses')
      return
    }
    nav.navigate('TeacherClasseEleves', { classe: focusSlot.classe })
  }

  const priorities: {
    key: string
    icon: React.ReactNode
    title: string
    detail: string
    color: string
    bg: string
    onPress: () => void
  }[] = []

  if (prayerClasse) {
    priorities.push({
      key: 'prayer',
      icon: <MoonStar size={17} color={theme.info} strokeWidth={2.3} />,
      title: t('prayer.dashboardTitle'),
      detail: prayerActivity.activeSession
        ? `${prayerClasse} · ${t(`prayer.status.${prayerActivity.activeSession.status}`)}`
        : t('prayer.dashboardDetail', { classe: prayerClasse }),
      color: theme.info,
      bg: theme.infoSurface,
      onPress: () => nav.navigate('TeacherPrayer', { classe: prayerClasse }),
    })
  }
  if (priorities.length < 2 && focusSlot && focusCanTakeAttendance && focusSeance && !focusAttendanceDone) {
    priorities.push({
      key: 'attendance',
      icon: <ClipboardCheck size={17} color={theme.warning} strokeWidth={2.3} />,
      title: t('teacher.nextActionAttendance'),
      detail: t('teacher.nextActionAttendanceDetail', { classe: focusSlot.classe, seance: focusSeance }),
      color: theme.warning,
      bg: theme.warningSurface,
      onPress: openFocusAttendance,
    })
  }
  if (priorities.length < 2 && focusSlot && focusIsActionable && !focusHomeworkDone) {
    priorities.push({
      key: 'homework',
      icon: <BookOpen size={17} color={theme.info} strokeWidth={2.3} />,
      title: t('teacher.nextActionHomework'),
      detail: t('teacher.nextActionHomeworkDetail', { classe: focusSlot.classe, subject: focusSlot.subject || '—' }),
      color: theme.info,
      bg: theme.infoSurface,
      onPress: openFocusHomework,
    })
  }
  if (focusSlot && priorities.length < 2) {
    priorities.push({
      key: 'message',
      icon: <Send size={17} color={theme.success} strokeWidth={2.3} />,
      title: t('teacher.nextActionMessage'),
      detail: t('teacher.nextActionMessageDetail', { classe: focusSlot.classe }),
      color: theme.success,
      bg: theme.successSurface,
      onPress: () => goTo('TeacherMessages'),
    })
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Watercolor blobs background (same as ScreenLayout) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
        <Image source={require('../../../assets/logo.png')} resizeMode="contain" accessible={false} importantForAccessibility="no" style={{ width: 240, height: 240, opacity: 0.08 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.card,
              borderColor: hexWithAlpha(teacherAccent, 0.42),
            },
            theme.shadows.clay,
          ]}
        >
          <View
            pointerEvents="none"
            style={[styles.heroAccentWash, { backgroundColor: hexWithAlpha(teacherAccent, 0.08) }]}
          />
          <View style={[styles.heroTopRow, isAr && styles.rowReverse]}>
            <Pressable
              onPress={() => goTo('TeacherEdt')}
              accessibilityRole="button"
              accessibilityLabel={t('teacher.seeFullSchedule')}
              style={({ pressed }) => [
                styles.heroStatusPill,
                {
                  backgroundColor: hexWithAlpha(teacherAccent, 0.12),
                  borderColor: hexWithAlpha(teacherAccent, 0.18),
                },
                isAr && styles.rowReverse,
                pressed && styles.heroInlinePressed,
              ]}
            >
                <Clock3 size={13} color={teacherAccent} strokeWidth={2.2} />
                <Text style={[styles.heroStatusText, { color: teacherAccent, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>
                  {focusStatusLabel}
                </Text>
            </Pressable>
            <Pressable
              onPress={openHero}
              accessibilityRole="button"
              accessibilityLabel={heroActionLabel}
              style={({ pressed }) => [
                styles.heroCtaPill,
                {
                  backgroundColor: theme.primarySurface,
                  borderColor: theme.primaryBorder,
                },
                isAr && styles.rowReverse,
                pressed && styles.heroInlinePressed,
              ]}
            >
                <Text numberOfLines={1} style={[styles.heroCtaText, { color: theme.primary, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>
                  {heroActionLabel}
                </Text>
                <ChevronRight size={14} color={theme.primary} strokeWidth={2.4} />
            </Pressable>
          </View>

          <Pressable
            onPress={openFocusClass}
            accessibilityRole="button"
            accessibilityLabel={focusSlot?.classe || t('teacher.seeFullSchedule')}
            style={({ pressed }) => [
              styles.heroCourseBlock,
              {
                backgroundColor: theme.surface,
                borderColor: hexWithAlpha(teacherAccent, 0.18),
              },
              pressed && styles.heroInlinePressed,
              isAr && styles.rtlBlock,
            ]}
          >
              <Text style={[styles.heroEyebrow, { color: teacherAccent, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                {t('teacher.profCockpit')}
              </Text>
              <Text numberOfLines={1} style={[styles.heroSubject, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
                {focusSlot?.subject || t('teacher.noCourseToday')}
              </Text>
              <Text numberOfLines={1} style={[styles.heroMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                {focusSlot
                  ? `${focusSlot.classe} · ${focusSlot.startTime}-${focusSlot.endTime}${focusSeance ? ` · ${focusSeance}` : ''}`
                  : t('teacher.noCourseMsg')}
              </Text>
          </Pressable>

          <Pressable
            onPress={() => goTo('TeacherEdt')}
            accessibilityRole="button"
            accessibilityLabel={t('teacher.seeFullSchedule')}
            style={({ pressed }) => [styles.heroProgressRow, isAr && styles.rowReverse, pressed && styles.heroInlinePressed]}
          >
              <View style={styles.heroProgressText}>
                <Text style={[styles.heroProgressLabel, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                  {t('teacher.todayLoadout')}
                </Text>
                <Text style={[styles.heroProgressValue, { color: theme.text, fontFamily: theme.fonts.black }]}>
                  {doneCount}/{totalCount}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: hexWithAlpha(teacherAccent, 0.14) }]}>
                <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: teacherAccent }]} />
              </View>
          </Pressable>

          <View style={[styles.heroMetricsRow, isAr && styles.rowReverse]}>
              <HeroMetric
                icon={<Layers size={14} color={theme.primary} strokeWidth={2.3} />}
                value={String(teacher.kpis.classes)}
                label={t('teacher.kpiClasses')}
                onPress={() => nav.navigate('TeacherClasses')}
                color={theme.primary}
                bg={theme.primarySurface}
                isAr={isAr}
                theme={theme}
              />
              <HeroMetric
                icon={<Users size={14} color={teacherAccent} strokeWidth={2.3} />}
                value={String(focusStudents)}
                label={t('teacher.kpiStudents')}
                onPress={openFocusStudents}
                color={teacherAccent}
                bg={theme.infoSurface}
                isAr={isAr}
                theme={theme}
              />
              <HeroMetric
                icon={<Percent size={14} color={attendanceTone} strokeWidth={2.3} />}
                value={`${teacher.kpis.attendance}%`}
                label={t('teacher.kpiAttendance')}
                onPress={() => goTo('TeacherStats')}
                color={attendanceTone}
                bg={hexWithAlpha(attendanceTone, 0.12)}
                isAr={isAr}
                theme={theme}
              />
          </View>
        </View>

        {priorities.length > 0 ? (
          <View style={styles.sectionBlock}>
            {priorities.map(p => (
              <PriorityCard key={p.key} item={p} theme={theme} isAr={isAr} />
            ))}
          </View>
        ) : null}

        {/* ── Quick actions (4 solid tiles) ─────────────────── */}
        <View style={styles.sectionBlock}>
          <QuickActions actions={TEACHER_QUICK_ACTIONS} onPress={handleQuickAction} />
        </View>

        {/* ── Footer accent ─────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            marginStart: 6,
            letterSpacing: 0.3,
          }}>
            Mojammaa Al Maarifa — version mobile
          </Text>
        </View>
      </ScrollView>

      {/* ── Floating greeting toast (overlay, hors du flux) ── */}
      <AnimatePresence>
        {showGreeting && (
          <MotiView
            key="greeting"
            from={{ opacity: 0, translateY: -16 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -16 }}
            transition={{ type: 'timing', duration: 320 }}
            pointerEvents="box-none"
            style={[styles.greetingWrap, { top: insets.top + 8 }]}
          >
            <Pressable
              onPress={() => setShowGreeting(false)}
              style={[styles.greetingToast, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.md]}
            >
              <Text numberOfLines={1} style={{
                color: theme.text,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                fontSize: isAr ? 16 : 15,
                writingDirection: isAr ? 'rtl' : 'ltr',
                textAlign: 'center',
              }}>
                {t(greetingKey())}
              </Text>
              <Text style={{
                color: theme.textSoft,
                fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
                fontSize: 11,
                letterSpacing: isAr ? 0 : 0.5,
                marginTop: 2,
                textTransform: 'uppercase',
                textAlign: 'center',
                writingDirection: isAr ? 'rtl' : 'ltr',
              }}>
                {t('roles.teacher')}
              </Text>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </SafeAreaView>
  )
}

function HeroMetric({ icon, value, label, onPress, color, bg, theme, isAr }: {
  icon: React.ReactNode
  value: string
  label: string
  onPress: () => void
  color: string
  bg: string
  theme: Theme
  isAr: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.heroMetric,
        { backgroundColor: bg, borderColor: hexWithAlpha(color, 0.14) },
        pressed && styles.heroInlinePressed,
      ]}
    >
      <View style={styles.heroMetricIcon}>{icon}</View>
      <Text numberOfLines={1} style={[styles.heroMetricValue, { color, fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.heroMetricText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function PriorityCard({ item, theme, isAr }: {
  item: {
    icon: React.ReactNode
    title: string
    detail: string
    color: string
    bg: string
    onPress: () => void
  }
  theme: Theme
  isAr: boolean
}) {
  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.detail}`}
      style={({ pressed }) => [
        styles.priorityCard,
        { backgroundColor: item.bg, borderColor: item.color + '33' },
        theme.shadows.xs,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.priorityRail, { backgroundColor: item.color }]} />
      <View style={[styles.priorityIconBox, { backgroundColor: item.bg }]}>
        {item.icon}
      </View>
      <View style={[styles.priorityText, isAr && styles.rtlBlock]}>
        <Text numberOfLines={1} style={[styles.priorityTitle, { color: item.color, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={[styles.priorityDetail, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
          {item.detail}
        </Text>
      </View>
      <View style={[styles.priorityChevron, { backgroundColor: item.color + '14' }]}>
        <ChevronRight size={15} color={item.color} strokeWidth={2.4} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  greetingWrap: {
    position: 'absolute',
    left: 20, right: 20,
    alignItems: 'center',
  },
  greetingToast: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 200,
  },
  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },

  heroCard: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 28,
    padding: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroAccentWash: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    top: -54,
    right: -38,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroEyebrow: { fontSize: 10.5, textTransform: 'uppercase' },
  heroCtaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '56%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  heroCtaText: { flexShrink: 1, fontSize: 11 },
  heroInlinePressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  heroCourseBlock: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroStatusText: { fontSize: 11 },
  heroSubject: { fontSize: 24, lineHeight: 30, marginTop: 8 },
  heroMeta: { fontSize: 12.5, marginTop: 3 },
  heroProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  heroProgressText: { minWidth: 58 },
  heroProgressLabel: { fontSize: 10 },
  heroProgressValue: { fontSize: 17, fontVariant: ['tabular-nums'], marginTop: 1 },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 999 },
  heroMetricsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroMetric: {
    flex: 1,
    minHeight: 66,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'space-between',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroMetricIcon: { width: 18, height: 18, alignItems: 'flex-start', justifyContent: 'center' },
  heroMetricValue: { fontSize: 18, fontVariant: ['tabular-nums'] },
  heroMetricText: { fontSize: 10.5, marginTop: 1 },

  sectionBlock: { paddingHorizontal: 20, marginTop: 18 },
  priorityCard: {
    minHeight: 70,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 9,
    paddingEnd: 12,
  },
  priorityRail: { width: 4, alignSelf: 'stretch' },
  priorityIconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginStart: 12 },
  priorityText: { flex: 1, minWidth: 0, marginStart: 11 },
  priorityTitle: { fontSize: 13.5 },
  priorityDetail: { fontSize: 11.5, marginTop: 2 },
  priorityChevron: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    marginTop:     28,
  },
})
