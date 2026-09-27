import React from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native'
import { ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, GraduationCap, MessageSquare, RefreshCw, Search, CircleDashed } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { adminHomeCopy } from '../../utils/admin-home-copy'
import type { AdminHomeSummary } from '../../utils/admin-home-summary'

export interface AdminHomeData extends AdminHomeSummary {
  absents: number
  pointed: number
  updatedAt: number
  dayLabel?: string
  event?: { date: string; label: string }
}
export interface AdminHomeViewProps {
  language: string
  data: AdminHomeData | null
  loading: boolean
  error: boolean
  openingStudents: boolean
  onRefresh: () => void
  onAbsences: () => void
  onCalls: (classe?: string) => void
  onStudents: () => void
  onTeachers: () => void
  onMessage: () => void
  onHomework: () => void
  onCalendar: () => void
}

/** Presentational component: previews never need school credentials or real data. */
export default function AdminHomeView(props: AdminHomeViewProps) {
  const { language, data, loading, error, onRefresh } = props
  const theme = useTheme()
  const copy = adminHomeCopy(language)
  const rtl = language.startsWith('ar')
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < 350 || fontScale > 1.2
  const row = { flexDirection: rtl ? 'row-reverse' as const : 'row' as const }
  const text = { color: theme.text, textAlign: rtl ? 'right' as const : 'left' as const, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.regular }
  const bold = { fontFamily: rtl ? theme.fonts.arabicBold : theme.fonts.bold }
  const muted = { color: theme.textSoft }
  const locale = rtl ? 'ar-MA' : language.startsWith('en') ? 'en-GB' : 'fr-MA'
  const date = new Date(data?.updatedAt ?? Date.now())
  const day = date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const unavailable = !data || ['closed', 'unplanned', 'upcoming'].includes(data.status)
  const coverage = data && data.expectedClasses > 0 ? Math.round(data.completedClasses / data.expectedClasses * 100) : 0
  const missing = data?.missingClasses ?? []
  const emptyKey = data?.status === 'closed' ? 'closed' : data?.status === 'upcoming' ? 'upcoming'
    : data?.status === 'complete' ? 'complete' : 'unplanned'
  const arrow = { transform: [{ scaleX: rtl ? -1 : 1 }] }
  const buttonStyle = ({ pressed }: { pressed: boolean }) => [{ opacity: pressed ? 0.65 : 1 }]

  return (
    <ScrollView style={{ backgroundColor: theme.surface }} contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={[s.header, row]}>
        <View style={s.flex}>
          <Text style={[text, bold, s.eyebrow, { color: theme.primary }]}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={[text, bold, s.title]}>{copy.title}</Text>
          <Text style={[text, muted, s.date]}>{day}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.refresh} accessibilityState={{ busy: loading, disabled: loading }}
          disabled={loading} onPress={onRefresh} style={({ pressed }) => [s.refresh, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceAlt : theme.card }]}>
          {loading ? <ActivityIndicator color={theme.primary} /> : <RefreshCw size={19} color={theme.textSoft} />}
        </Pressable>
      </View>

      {error && <View accessibilityRole="alert" style={[s.notice, { backgroundColor: theme.dangerSurface }]}>
        <Text selectable style={[text, bold, { color: theme.danger }]}>{copy.error}</Text>
        {data && <Text style={[text, s.small]}>{copy.stale}</Text>}
        <Pressable accessibilityRole="button" onPress={onRefresh} style={s.textButton}><Text style={[text, bold, { color: theme.danger }]}>{copy.retry}</Text></Pressable>
      </View>}

      {!data && loading && <View accessibilityRole="progressbar" accessibilityLabel={copy.loading} style={s.loader}>
        <ActivityIndicator color={theme.primary} /><Text style={[text, muted]}>{copy.loading}</Text>
      </View>}

      {data && <>
        <View style={[s.overview, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[row, s.between]}>
            <Text accessibilityRole="header" style={[text, bold, s.sectionTitle]}>{copy.overview}</Text>
            <View style={[s.timestamp, row]}><View style={[s.dot, { backgroundColor: error ? theme.warning : theme.primary }]} />
              <Text accessibilityLabel={`${copy.updated} ${time}`} style={[text, muted, s.small]}>{time}</Text>
            </View>
          </View>
          <View style={[s.metrics, stacked ? s.stack : row]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${copy.absents}: ${data.pointed > 0 ? data.absents : copy.noAttendance}`}
              onPress={props.onAbsences} style={({ pressed }) => [s.metric, { opacity: pressed ? 0.6 : 1 }]}>
              <Text selectable style={[text, bold, s.bigNumber, { color: data.absents > 0 ? theme.danger : theme.text }]}>{data.pointed > 0 ? data.absents : '—'}</Text>
              <Text style={[text, bold, s.metricLabel]}>{copy.absents}</Text>
              <Text style={[text, muted, s.tiny]}>{copy.recorded}</Text>
            </Pressable>
            <View style={[stacked ? s.horizontalDivider : s.verticalDivider, { backgroundColor: theme.border }]} />
            <Pressable accessibilityRole="button" onPress={() => props.onCalls()} style={({ pressed }) => [s.metric, { opacity: pressed ? 0.6 : 1 }]}>
              <Text selectable style={[text, bold, s.bigNumber]}>{unavailable ? '—' : data.completedClasses}</Text>
              <Text style={[text, bold, s.metricLabel]}>{copy.completed}</Text>
              <Text style={[text, muted, s.tiny]}>{data.expectedClasses} {copy.expected}</Text>
            </Pressable>
            <View style={[stacked ? s.horizontalDivider : s.verticalDivider, { backgroundColor: theme.border }]} />
            <Pressable accessibilityRole="button" onPress={() => props.onCalls()} style={({ pressed }) => [s.metric, { opacity: pressed ? 0.6 : 1 }]}>
              <Text selectable style={[text, bold, s.bigNumber, { color: missing.length ? theme.warning : theme.text }]}>{unavailable ? '—' : missing.length}</Text>
              <Text style={[text, bold, s.metricLabel]}>{copy.missing}</Text>
              <Text style={[text, muted, s.tiny]}>{copy.coverage}</Text>
            </Pressable>
          </View>
          {!unavailable && <>
            <View accessibilityRole="progressbar" accessibilityLabel={copy.coverage} accessibilityValue={{ min: 0, max: 100, now: coverage }}
              style={[s.progress, { backgroundColor: theme.surfaceAlt, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
              <View style={{ height: '100%', width: `${coverage}%`, backgroundColor: coverage === 100 ? theme.success : theme.primary, borderRadius: 4 }} />
            </View>
            <Text style={[text, muted, s.tiny, { marginTop: 9 }]}>{data.pointed === 0 ? copy.noAttendance : missing.length ? copy.partial : copy.coverageHint}</Text>
          </>}
          {unavailable && data.pointed === 0 && <Text style={[text, muted, s.small]}>{copy.noAttendance}</Text>}
        </View>

        {missing.length > 0 ? <View style={s.section}>
          <View style={[row, s.between]}>
            <Text accessibilityRole="header" style={[text, bold, s.sectionTitle]}>{copy.pendingTitle}</Text>
            <Text style={[text, bold, s.count, { backgroundColor: theme.warningSurface, color: theme.warning }]}>{missing.length}</Text>
          </View>
          <Text style={[text, muted, s.small]}>{copy.pendingHint}</Text>
          <View style={[s.list, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {missing.slice(0, 3).map((item, index) => <Pressable key={item.classe} accessibilityRole="button"
              accessibilityLabel={`${item.classe}, ${item.missingCalls} ${copy.missingCalls}`} onPress={() => props.onCalls(item.classe)}
              style={({ pressed }) => [s.classRow, row, { backgroundColor: pressed ? theme.surfaceAlt : theme.card, borderTopWidth: index ? 1 : 0, borderColor: theme.border }]}>
              <View style={[s.classIcon, { backgroundColor: theme.warningSurface }]}><ClipboardCheck size={19} color={theme.warning} /></View>
              <View style={s.flex}><Text style={[text, bold, s.className]}>{item.classe}</Text>
                <Text style={[text, muted, s.small]}>{item.missingCalls} {item.missingCalls === 1 ? copy.missingCall : copy.missingCalls}</Text></View>
              <ChevronRight size={18} color={theme.textMuted} style={arrow} />
            </Pressable>)}
            <Pressable accessibilityRole="button" onPress={() => props.onCalls()} style={({ pressed }) => [s.allCalls, row, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[text, bold, { color: theme.primary }]}>{copy.allCalls}</Text><ArrowUpRight size={17} color={theme.primary} style={arrow} />
            </Pressable>
          </View>
        </View> : <View style={[s.empty, row, { backgroundColor: data.status === 'complete' ? theme.successSurface : theme.surfaceAlt }]}>
          {data.status === 'complete' ? <CheckCircle2 size={23} color={theme.success} /> : <CircleDashed size={23} color={theme.textSoft} />}
          <View style={s.flex}><Text style={[text, bold, s.className]}>{data.status === 'closed' && data.dayLabel ? data.dayLabel : copy[`${emptyKey}Title`]}</Text>
            <Text style={[text, muted, s.small, { marginTop: 4 }]}>{copy[`${emptyKey}Hint`]}</Text></View>
        </View>}
      </>}

      <View style={s.section}>
        <Text accessibilityRole="header" style={[text, bold, s.sectionTitle]}>{copy.shortcuts}</Text>
        <View style={[s.shortcuts, stacked ? s.stack : row]}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.students} disabled={props.openingStudents} accessibilityState={{ busy: props.openingStudents, disabled: props.openingStudents }}
            onPress={props.onStudents} style={({ pressed }) => [s.shortcut, { backgroundColor: pressed ? theme.primarySurface : theme.card, borderColor: theme.border }]}>
            {props.openingStudents ? <ActivityIndicator color={theme.primary} /> : <Search size={22} color={theme.primary} />}
            <Text style={[text, bold, s.shortcutTitle]}>{copy.students}</Text><Text style={[text, muted, s.small]}>{copy.studentsHint}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onTeachers}
            style={({ pressed }) => [s.shortcut, { backgroundColor: pressed ? theme.primarySurface : theme.card, borderColor: theme.border }]}>
            <GraduationCap size={23} color={theme.primary} /><Text style={[text, bold, s.shortcutTitle]}>{copy.teachers}</Text><Text style={[text, muted, s.small]}>{copy.teachersHint}</Text>
          </Pressable>
        </View>
        <View style={[s.utilityRow, stacked ? s.stack : row]}>
          <Pressable accessibilityRole="button" onPress={props.onMessage} style={state => [s.utility, row, ...buttonStyle(state)]}>
            <MessageSquare size={18} color={theme.primary} /><Text style={[text, bold, s.flex]}>{copy.message}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={props.onHomework} style={state => [s.utility, row, ...buttonStyle(state)]}>
            <BookOpen size={18} color={theme.primary} /><Text style={[text, bold, s.flex]}>{copy.homework}</Text>
          </Pressable>
        </View>
      </View>

      {data?.event && <Pressable accessibilityRole="button" onPress={props.onCalendar} style={state => [s.event, row, { borderColor: theme.border }, ...buttonStyle(state)]}>
        <CalendarDays size={21} color={theme.textSoft} /><View style={s.flex}>
          <Text style={[text, muted, s.small]}>{copy.event} · {new Date(`${data.event.date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Text>
          <Text style={[text, bold, { marginTop: 3 }]}>{data.event.label}</Text></View><ChevronRight size={18} color={theme.textMuted} style={arrow} />
      </Pressable>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 32, gap: 23, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { alignItems: 'center', gap: 14, paddingVertical: 7 }, flex: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }, title: { fontSize: 29, lineHeight: 39, letterSpacing: -0.8 },
  date: { fontSize: 13, marginTop: 5, textTransform: 'capitalize' }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  overview: { borderRadius: 22, borderWidth: 1, padding: 17 }, between: { justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 17, lineHeight: 25 }, timestamp: { gap: 6, alignItems: 'center' }, dot: { width: 5, height: 5, borderRadius: 3 },
  metrics: { paddingVertical: 22, gap: 10 }, metric: { flex: 1, gap: 5, minWidth: 0, minHeight: 100 },
  bigNumber: { fontSize: 35, lineHeight: 45, fontVariant: ['tabular-nums'] }, metricLabel: { fontSize: 12, lineHeight: 17 },
  tiny: { fontSize: 10, lineHeight: 16 }, small: { fontSize: 12, lineHeight: 19 }, verticalDivider: { width: 1 }, horizontalDivider: { height: 1 },
  progress: { height: 5, borderRadius: 4, overflow: 'hidden' }, section: { gap: 9 }, count: { fontSize: 12, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8 },
  list: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginTop: 4 }, classRow: { padding: 14, alignItems: 'center', gap: 12 },
  classIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, className: { fontSize: 14, lineHeight: 23 },
  allCalls: { minHeight: 48, padding: 12, borderTopWidth: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  empty: { borderRadius: 16, padding: 17, gap: 12, alignItems: 'flex-start' }, shortcuts: { gap: 11, marginTop: 4 },
  shortcut: { flex: 1, borderRadius: 17, borderWidth: 1, padding: 16, alignItems: 'stretch', minWidth: 0 }, shortcutTitle: { fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 3 },
  utilityRow: { gap: 8 }, utility: { flex: 1, gap: 9, alignItems: 'center', paddingVertical: 10, minHeight: 48 },
  event: { paddingVertical: 16, borderTopWidth: 1, gap: 12, alignItems: 'center' }, stack: { flexDirection: 'column' },
  notice: { padding: 14, borderRadius: 14, gap: 5 }, textButton: { minHeight: 44, justifyContent: 'center' }, loader: { paddingVertical: 35, gap: 14, alignItems: 'center' },
})
