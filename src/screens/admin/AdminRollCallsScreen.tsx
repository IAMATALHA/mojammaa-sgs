import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  Pressable,
} from 'react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck,
  Clock3,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import { toDoc, toDocs } from '../../services/firestore'
import type { AbsenceDoc } from '../../services/absencesService'
import type { AdminStackParamList } from '../../navigation/types'
import {
  buildTodayRollCallSessions,
  rollCallSessionKey,
  summarizeRollCallSessions,
  type RollCallSession,
  type RollCallSlot,
} from '../../utils/rollCalls'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function copyFor(lang: string) {
  if (lang === 'ar') {
    return {
      title: 'تسجيل الحضور',
      current: 'الحصص الجارية الآن',
      missing: 'تسجيلات حضور يجب إنجازها',
      all: 'كل الحصص',
      noCurrent: 'لا توجد حصة جارية الآن',
      noMissing: 'كل تسجيلات الحضور المستحقة منجزة',
      noSessions: 'لا توجد حصص مبرمجة اليوم',
      missingClasses: 'أقسام بدون تسجيل حضور',
      done: 'تم',
      todo: 'للانجاز',
      later: 'لاحقا',
      course: 'حصة',
      calls: 'تسجيلات الحضور',
      openAbsences: 'عرض الغيابات',
      loadError: 'تعذر تحميل تسجيلات الحضور اليوم.',
    }
  }
  if (lang.startsWith('en')) {
    return {
      title: 'Roll calls',
      current: 'In session now',
      missing: 'Roll calls to do',
      all: 'Sessions',
      noCurrent: 'No class is in session right now',
      noMissing: 'All due roll calls are done',
      noSessions: 'No scheduled session today',
      missingClasses: 'Classes without call',
      done: 'Done',
      todo: 'Todo',
      later: 'Later',
      course: 'Class',
      calls: 'Calls',
      openAbsences: 'Open absences',
      loadError: 'Unable to load today roll calls.',
    }
  }
  return {
    title: 'Appels',
    current: 'Séances en cours',
    missing: 'Appels à faire',
    all: 'Séances',
    noCurrent: 'Aucune séance en cours maintenant',
    noMissing: 'Tous les appels dus sont faits',
    noSessions: 'Aucune séance programmée aujourd\'hui',
    missingClasses: 'Classes sans appel',
    done: 'Fait',
    todo: 'À faire',
    later: 'À venir',
    course: 'Cours',
    calls: 'Appels',
    openAbsences: 'Voir les absences',
    loadError: 'Impossible de charger les appels du jour.',
  }
}

export default function AdminRollCallsScreen() {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const copy = copyFor(i18n.language)
  const nav = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const [sessions, setSessions] = useState<RollCallSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const date = todayISO()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [edtSnap, absSnap] = await Promise.all([
        getDocs(collection(db, 'emploiDuTemps')),
        getDocs(query(collection(db, 'absences'), where('date', '==', date))),
      ])
      const completed = new Set<string>()
      absSnap.forEach(docSnap => {
        const absence = toDoc<AbsenceDoc>(docSnap)
        if (absence.classe && absence.seance) {
          completed.add(rollCallSessionKey(absence.classe, absence.seance))
        }
      })
      setSessions(buildTodayRollCallSessions(toDocs<RollCallSlot>(edtSnap), completed))
    } catch (e: any) {
      setError(e?.message || copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [copy.loadError, date])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => summarizeRollCallSessions(sessions), [sessions])
  const currentSessions = useMemo(
    () => sessions.filter(session => session.timing === 'current'),
    [sessions],
  )

  return (
    <ScreenLayout title={copy.title}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
          <Text numberOfLines={3} style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={[styles.summaryCard, { backgroundColor: theme.primaryDark, borderColor: theme.primaryBorder }, theme.shadows.sm]}>
        <View style={[styles.summaryHeader, isAr && styles.rowReverse]}>
          <View style={[styles.summaryTitleBlock, isAr && styles.rtlBlock]}>
            <Text numberOfLines={1} style={[styles.summaryEyebrow, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
              {summary.callsDone}/{summary.callsExpected} {copy.calls.toLowerCase()}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.summaryTitle, { fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
              {copy.missingClasses}
            </Text>
          </View>
          <View style={styles.summaryBadge}>
            <Text style={[styles.summaryBadgeValue, { fontFamily: theme.fonts.black }]}>
              {summary.missingClasses.length}
            </Text>
          </View>
        </View>

        <View style={[styles.summaryStats, isAr && styles.rowReverse]}>
          <MiniStat
            icon={<ClipboardCheck size={14} color="#fff" strokeWidth={2.3} />}
            value={`${summary.callsDone}/${summary.callsExpected}`}
            label={copy.calls}
            theme={theme}
            isAr={isAr}
          />
          <MiniStat
            icon={<Clock3 size={14} color="#fff" strokeWidth={2.3} />}
            value={String(currentSessions.length)}
            label={copy.current}
            theme={theme}
            isAr={isAr}
          />
          <MiniStat
            icon={<AlertTriangle size={14} color="#fff" strokeWidth={2.3} />}
            value={String(summary.missingSessions.length)}
            label={copy.todo}
            theme={theme}
            isAr={isAr}
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : sessions.length === 0 ? (
          <EmptyState text={copy.noSessions} theme={theme} />
        ) : (
          <>
            <SessionSection
              title={copy.current}
              count={currentSessions.length}
              emptyText={copy.noCurrent}
              sessions={currentSessions}
              copy={copy}
              theme={theme}
              isAr={isAr}
              onOpenAbsences={() => nav.navigate('AdminAbsences')}
            />
            <SessionSection
              title={copy.missing}
              count={summary.missingSessions.length}
              emptyText={copy.noMissing}
              sessions={summary.missingSessions}
              copy={copy}
              theme={theme}
              isAr={isAr}
              onOpenAbsences={() => nav.navigate('AdminAbsences')}
            />
            <SessionSection
              title={copy.all}
              count={sessions.length}
              sessions={sessions}
              copy={copy}
              theme={theme}
              isAr={isAr}
              onOpenAbsences={() => nav.navigate('AdminAbsences')}
            />
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function MiniStat({ icon, value, label, theme, isAr }: {
  icon: React.ReactNode
  value: string
  label: string
  theme: Theme
  isAr: boolean
}) {
  return (
    <View style={styles.miniStat}>
      <View style={styles.miniIcon}>{icon}</View>
      <Text numberOfLines={1} style={[styles.miniValue, { fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.miniLabel, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
        {label}
      </Text>
    </View>
  )
}

function SessionSection({ title, count, emptyText, sessions, copy, theme, isAr, onOpenAbsences }: {
  title: string
  count: number
  emptyText?: string
  sessions: RollCallSession[]
  copy: ReturnType<typeof copyFor>
  theme: Theme
  isAr: boolean
  onOpenAbsences: () => void
}) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionTitleRow, isAr && styles.rowReverse]}>
        <Text numberOfLines={1} style={[styles.sectionTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {title}
        </Text>
        <View style={[styles.countPill, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={[styles.countText, { color: theme.textSoft, fontFamily: theme.fonts.black }]}>{count}</Text>
        </View>
      </View>
      {sessions.length === 0 && emptyText ? (
        <EmptyState text={emptyText} theme={theme} compact />
      ) : sessions.map(session => (
        <SessionCard
          key={`${session.id}-${session.seance}`}
          session={session}
          copy={copy}
          theme={theme}
          isAr={isAr}
          onOpenAbsences={onOpenAbsences}
        />
      ))}
    </View>
  )
}

function SessionCard({ session, copy, theme, isAr, onOpenAbsences }: {
  session: RollCallSession
  copy: ReturnType<typeof copyFor>
  theme: Theme
  isAr: boolean
  onOpenAbsences: () => void
}) {
  const actionable = !session.done && session.timing !== 'upcoming'
  const status = session.done ? copy.done : (session.timing === 'upcoming' ? copy.later : copy.todo)
  const tone = session.done
    ? { color: theme.success, bg: theme.successSurface, icon: <CheckCircle2 size={15} color={theme.success} strokeWidth={2.3} /> }
    : session.timing === 'upcoming'
      ? { color: theme.info, bg: theme.infoSurface, icon: <CalendarClock size={15} color={theme.info} strokeWidth={2.3} /> }
      : { color: theme.warning, bg: theme.warningSurface, icon: <AlertTriangle size={15} color={theme.warning} strokeWidth={2.3} /> }
  const time = session.startTime
    ? `${session.startTime}${session.endTime ? ` - ${session.endTime}` : ''}`
    : ''
  const meta = [
    session.seance,
    time,
    session.professeurNom,
    session.salle,
  ].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={actionable ? onOpenAbsences : undefined}
      disabled={!actionable}
      accessibilityRole={actionable ? 'button' : 'text'}
      accessibilityLabel={`${session.classe} ${session.seance} ${status}`}
      style={({ pressed }) => [
        styles.sessionCard,
        { backgroundColor: theme.card, borderColor: theme.border },
        theme.shadows.xs,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.statusRail, { backgroundColor: tone.color }]} />
      <View style={[styles.sessionIcon, { backgroundColor: tone.bg }]}>
        {tone.icon}
      </View>
      <View style={[styles.sessionMain, isAr && styles.rtlBlock]}>
        <View style={[styles.classLine, isAr && styles.rowReverse]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.className, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
            {session.classe}
          </Text>
          <Text numberOfLines={1} style={[styles.subjectText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
            {session.matiere || copy.course}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.metaText, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
          {meta}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
        <Text numberOfLines={1} style={[styles.statusText, { color: tone.color, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
          {status}
        </Text>
      </View>
      {actionable ? <ChevronRight size={15} color={theme.textMuted} strokeWidth={2.4} /> : null}
    </Pressable>
  )
}

function EmptyState({ text, theme, compact }: { text: string; theme: Theme; compact?: boolean }) {
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      <CheckCircle2 size={compact ? 18 : 26} color={theme.success} strokeWidth={2} />
      <Text numberOfLines={2} style={[styles.emptyText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  errorBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
  },
  summaryCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  summaryEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11.5,
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 25,
    lineHeight: 31,
    marginTop: 2,
  },
  summaryBadge: {
    minWidth: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  summaryBadgeValue: {
    color: '#fff',
    fontSize: 23,
    fontVariant: ['tabular-nums'],
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
  },
  miniStat: {
    flex: 1,
    minHeight: 72,
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  miniIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  miniValue: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 22,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  miniLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9.5,
    marginTop: 1,
  },
  scroll: {
    paddingBottom: 34,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  section: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitleRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
  },
  countPill: {
    minWidth: 30,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sessionCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  statusRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  sessionIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionMain: {
    flex: 1,
    minWidth: 0,
    marginStart: 11,
  },
  classLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  className: {
    flexShrink: 1,
    maxWidth: '48%',
    fontSize: 15,
    lineHeight: 20,
  },
  subjectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  metaText: {
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 2,
  },
  statusBadge: {
    maxWidth: 76,
    minHeight: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginStart: 8,
  },
  statusText: {
    fontSize: 11,
  },
  empty: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyCompact: {
    minHeight: 72,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.98 }],
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  rtlBlock: {
    alignItems: 'flex-end',
  },
})
