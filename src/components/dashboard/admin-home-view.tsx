import React from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native'
import { BookOpen, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, MessageSquare, PenSquare, RefreshCw, CircleDashed, UserRound } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { adminPalette, fontSize, radius, spacing } from '../../theme/designTokens'
import { adminHomeCopy } from '../../utils/admin-home-copy'
import type { AdminCurrentLessons, AdminHomeSummary } from '../../utils/admin-home-summary'
import { AdminActionRow, AdminSearchLink, AdminTiles } from './admin-school-access'

export interface AdminHomeData extends AdminHomeSummary {
  absents: number
  pointed: number
  updatedAt: number
  current: AdminCurrentLessons | null
  dayLabel?: string
  event?: { date: string; label: string }
}
export interface AdminHomeViewProps {
  language: string
  data: AdminHomeData | null
  loading: boolean
  error: boolean
  openingStudents: boolean
  unreadMessages: number
  onRefresh: () => void
  onAbsences: () => void
  onCalls: () => void
  onMissingCalls: () => void
  onMissingClass: (classe: string) => void
  onSearch: () => void
  onMessage: () => void
  onCompose: () => void
  onAppointments: () => void
  onHomework: () => void
  onCalendar: () => void
  onProfile: () => void
}

const MAX_CHIPS = 8

/** Pure presentation: previews use fictional data, with no school credentials. */
export default function AdminHomeView(props: AdminHomeViewProps) {
  const { language, data, loading, error, onRefresh } = props
  const theme = useTheme()
  const copy = adminHomeCopy(language)
  const rtl = language.startsWith('ar')
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < 350 || fontScale > 1.25
  const row = { flexDirection: rtl ? 'row-reverse' as const : 'row' as const }
  const text = { color: theme.text, textAlign: rtl ? 'right' as const : 'left' as const, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.regular }
  const bold = { fontFamily: rtl ? theme.fonts.arabicBold : theme.fonts.bold }
  const muted = { color: theme.textSoft }
  const locale = rtl ? 'ar-MA' : language.startsWith('en') ? 'en-GB' : 'fr-MA'
  const day = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = data ? new Date(data.updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''
  const unavailable = !data || ['closed', 'unplanned', 'upcoming'].includes(data.status)
  const coverage = data && data.expectedClasses > 0
    ? Math.min(100, Math.max(0, Math.round(data.completedClasses / data.expectedClasses * 100))) : 0
  const missingCount = data?.missingClasses.length ?? 0
  const dayState = data?.status === 'closed'
    ? { title: data.dayLabel || copy.closedTitle, hint: copy.closedHint }
    : data?.status === 'upcoming'
      ? { title: copy.upcomingTitle, hint: copy.upcomingHint }
      : { title: copy.unplannedTitle, hint: copy.unplannedHint }
  const arrow = { transform: [{ scaleX: rtl ? -1 : 1 }] }
  const onHero = { color: theme.white }
  const heroSoft = { color: adminPalette.onNavySoft }
  const current = data?.current
  const nowLine = current ? copy.nowClasses(current.classes) + ' · ' + copy.called + ' ' + current.recorded + '/' + current.classes
    + (current.until ? ' · ' + copy.until + ' ' + current.until : '') : ''

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={[s.header, row]}>
        <View style={s.flex}>
          <Text style={[text, bold, s.date, { color: theme.accent }, !rtl && s.dateLatin]}>{day}</Text>
          <Text accessibilityRole="header" numberOfLines={stacked ? undefined : 1} adjustsFontSizeToFit={!stacked} minimumFontScale={0.8}
            style={[text, bold, s.title, stacked && s.compactTitle, rtl && s.arabicTitle]}>{copy.title}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.profile} onPress={props.onProfile}
          style={({ pressed }) => [s.profile, { backgroundColor: pressed ? theme.border : theme.surfaceAlt }]}>
          <UserRound size={25} color={theme.primary} strokeWidth={1.6} />
        </Pressable>
      </View>

      <AdminSearchLink language={language} busy={props.openingStudents} onPress={props.onSearch} />

      {error ? <View accessibilityRole="alert" style={[s.notice, { backgroundColor: theme.dangerSurface }]}>
        <Text selectable style={[text, bold, { color: theme.danger }]}>{copy.error}</Text>
        {data ? <Text selectable style={[text, s.small]}>{copy.stale}</Text> : null}
        <Pressable accessibilityRole="button" disabled={loading} accessibilityState={{ disabled: loading }}
          onPress={onRefresh} style={({ pressed }) => [s.retry, { opacity: pressed || loading ? 0.6 : 1 }]}>
          <Text style={[text, bold, { color: theme.danger }]}>{copy.retry}</Text>
        </Pressable>
      </View> : null}

      {!data && loading ? <View accessibilityRole="progressbar" accessibilityLabel={copy.loading}
        style={[s.overview, s.loader, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[text, muted, s.small]}>{copy.loading}</Text>
      </View> : null}

      {data ? <View style={[s.overview, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        <View style={[row, s.between]}>
          <Text accessibilityRole="header" style={[text, bold, s.sectionTitle, s.flex, onHero]}>{copy.overview}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.refresh + '. ' + copy.updated + ' ' + time}
            disabled={loading} accessibilityState={{ busy: loading, disabled: loading }} onPress={onRefresh}
            style={({ pressed }) => [s.refresh, row, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[text, s.small, heroSoft]}>{time}</Text>
            {loading ? <ActivityIndicator size="small" color={theme.white} /> : <RefreshCw size={14} color={adminPalette.onNavySoft} />}
          </Pressable>
        </View>
        {current ? <Pressable accessibilityRole="button" accessibilityLabel={copy.now + ': ' + nowLine} onPress={props.onCalls}
          style={({ pressed }) => [s.live, row, { backgroundColor: adminPalette.onNavyLine, opacity: pressed ? 0.7 : 1 }]}>
          <View style={[s.liveDot, { backgroundColor: adminPalette.live }]} />
          <Text style={[text, bold, s.small, onHero]}>{copy.now}</Text>
          <Text style={[text, s.small, heroSoft, s.flex]}>{nowLine}</Text>
        </Pressable> : null}
        <View style={[s.metrics, stacked ? s.stack : row]}>
          <Pressable accessibilityRole="button"
            accessibilityLabel={copy.absents + ': ' + (data.pointed > 0 ? data.absents + ', ' + copy.outOf(data.pointed) : copy.noAttendance)} accessibilityHint={copy.recorded}
            onPress={props.onAbsences} style={({ pressed }) => [s.metric, { opacity: pressed ? 0.6 : 1 }]}>
            <Text selectable style={[text, bold, s.bigNumber, s.center, onHero]}>{data.pointed > 0 ? data.absents.toLocaleString(locale) : '—'}</Text>
            <Text style={[text, s.metricLabel, s.center, heroSoft]}>{copy.absents}</Text>
            {data.pointed > 0 ? <Text style={[text, s.small, s.center, heroSoft]}>{copy.outOf(data.pointed)}</Text> : null}
          </Pressable>
          <View style={[stacked ? s.horizontalDivider : s.verticalDivider, { backgroundColor: adminPalette.onNavyLine }]} />
          <Pressable accessibilityRole="button"
            accessibilityLabel={copy.completed + ': ' + (unavailable ? '—' : data.completedClasses + '/' + data.expectedClasses)}
            accessibilityHint={copy.coverageHint} onPress={props.onCalls}
            style={({ pressed }) => [s.metric, { opacity: pressed ? 0.6 : 1 }]}>
            <Text selectable style={[text, bold, s.bigNumber, s.center, onHero, { writingDirection: 'ltr' }]}>
              {unavailable ? '—' : data.completedClasses + '/' + data.expectedClasses}
            </Text>
            <Text style={[text, s.metricLabel, s.center, heroSoft]}>{copy.completed}</Text>
          </Pressable>
        </View>
        {!unavailable ? <>
          <View style={[row, s.progressRow]}>
            <View accessibilityRole="progressbar" accessibilityLabel={copy.coverage}
              accessibilityValue={{ min: 0, max: 100, now: coverage }}
              style={[s.progress, { backgroundColor: adminPalette.onNavyLine, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
              <View style={{ height: '100%', width: `${coverage}%`, backgroundColor: adminPalette.copperLight, borderRadius: radius.pill }} />
            </View>
            <Text style={[text, s.small, heroSoft]}>{coverage.toLocaleString(locale)}%</Text>
          </View>
          <Text style={[text, s.small, { color: missingCount ? adminPalette.copperLight : adminPalette.onNavySoft }]}>
            {data.pointed === 0 ? copy.noAttendance : missingCount ? copy.partial : copy.completeHint}
          </Text>
        </> : <View style={[s.dayState, row]}>
          <CircleDashed size={22} color={adminPalette.onNavySoft} />
          <View style={s.flex}>
            <Text style={[text, bold, s.small, onHero]}>{dayState.title}</Text>
            <Text style={[text, s.small, heroSoft, { marginTop: spacing.xs }]}>{dayState.hint}</Text>
          </View>
        </View>}
      </View> : null}

      <View>
        <Text accessibilityRole="header" style={[text, bold, s.sectionTitle]}>{copy.review}</Text>
        {data && missingCount > 0 ? <>
          <AdminActionRow language={language} Icon={ClipboardCheck} accent flush
            title={copy.missingClasses(missingCount)} subtitle={copy.callsHint} onPress={props.onMissingCalls} />
          <View style={[s.chips, row, { borderColor: theme.border }]}>
            {data.missingClasses.slice(0, MAX_CHIPS).map(({ classe, missingCalls }) => <Pressable key={classe} accessibilityRole="button"
              accessibilityLabel={classe + ', ' + missingCalls + ' ' + (missingCalls === 1 ? copy.missingCall : copy.missingCalls)}
              onPress={() => props.onMissingClass(classe)} hitSlop={4}
              style={({ pressed }) => [s.chip, row, { backgroundColor: pressed ? theme.border : theme.accentSurface }]}>
              <Text style={[bold, s.small, { color: theme.accent }]}>{classe}</Text>
              {missingCalls > 1 ? <Text style={[s.small, { color: theme.accent, fontFamily: theme.fonts.medium }]}>×{missingCalls}</Text> : null}
            </Pressable>)}
            {missingCount > MAX_CHIPS ? <Pressable accessibilityRole="button" accessibilityLabel={copy.allCalls}
              onPress={props.onMissingCalls} hitSlop={4}
              style={({ pressed }) => [s.chip, { backgroundColor: pressed ? theme.border : theme.surfaceAlt }]}>
              <Text style={[bold, s.small, { color: theme.text }]}>+{missingCount - MAX_CHIPS}</Text>
            </Pressable> : null}
          </View>
        </> : null}
        {data?.status === 'complete' ? <View style={[s.complete, row]}>
          <CheckCircle2 size={20} color={theme.success} />
          <Text style={[text, s.small, s.flex]}>{copy.completeTitle}</Text>
        </View> : null}
        <AdminActionRow language={language} Icon={MessageSquare}
          title={props.unreadMessages > 0 ? copy.unreadMessages(props.unreadMessages) : copy.messages}
          subtitle={copy.inbox} onPress={props.onMessage} />
      </View>

      <View style={s.section}>
        <Text accessibilityRole="header" style={[text, bold, s.sectionTitle]}>{copy.quickActions}</Text>
        <AdminTiles language={language} items={[
          { label: copy.message, hint: copy.messageHint, Icon: PenSquare, onPress: props.onCompose },
          { label: copy.appointments, hint: copy.appointmentsHint, Icon: CalendarClock, onPress: props.onAppointments },
          { label: copy.homework, hint: copy.homeworkHint, Icon: BookOpen, onPress: props.onHomework },
        ]} />
      </View>

      <Pressable accessibilityRole="button" onPress={props.onCalendar}
        style={({ pressed }) => [s.event, row, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceAlt : theme.card }]}>
        <View style={[s.eventIcon, { backgroundColor: theme.accentSurface }]}><CalendarDays size={23} color={theme.accent} strokeWidth={1.7} /></View>
        <View style={s.flex}>
          <Text style={[text, muted, s.small]}>{data?.event
            ? copy.event + ' · ' + new Date(data.event.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
            : copy.calendar}</Text>
          <Text style={[text, bold, s.small, { marginTop: spacing.xs }]}>{data?.event?.label ?? copy.calendarHint}</Text>
        </View>
        <ChevronRight size={19} color={theme.primary} style={arrow} />
      </Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  profile: { width: spacing.huge, height: spacing.huge, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.h2, lineHeight: 34, letterSpacing: -0.6 },
  compactTitle: { fontSize: fontSize.h3, lineHeight: 28 },
  arabicTitle: { letterSpacing: 0, lineHeight: 42 },
  date: { fontSize: fontSize.small, lineHeight: 16, marginBottom: spacing.xs },
  dateLatin: { textTransform: 'uppercase', letterSpacing: 1.2 },
  overview: { borderRadius: radius.xxl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  live: { alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill },
  chips: { flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: { alignItems: 'center', gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, justifyContent: 'center' },
  between: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sectionTitle: { fontSize: fontSize.title, lineHeight: 26 },
  refresh: { gap: spacing.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  metrics: { paddingVertical: spacing.sm, gap: spacing.md },
  metric: { flex: 1, minWidth: 0, gap: spacing.xs, justifyContent: 'center' },
  bigNumber: { fontSize: fontSize.display, lineHeight: 52, fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  metricLabel: { fontSize: fontSize.small, lineHeight: 18 },
  center: { textAlign: 'center' },
  verticalDivider: { width: 1 },
  horizontalDivider: { height: 1, width: '100%' },
  stack: { flexDirection: 'column' },
  progressRow: { alignItems: 'center', gap: spacing.sm },
  progress: { height: 8, flex: 1, borderRadius: radius.pill, overflow: 'hidden' },
  small: { fontSize: fontSize.small, lineHeight: 19 },
  notice: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.sm },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  loader: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  dayState: { alignItems: 'flex-start', gap: spacing.md },
  complete: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  section: { gap: spacing.lg },
  event: { padding: spacing.md, gap: spacing.md, alignItems: 'center', borderWidth: 1, borderRadius: radius.xl },
  eventIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
})
