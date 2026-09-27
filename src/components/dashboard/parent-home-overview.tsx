import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { BookOpen, CalendarX, CheckCircle, ChevronLeft, ChevronRight, GraduationCap, Clock3 } from 'lucide-react-native'
import type { Theme } from '../../contexts/ThemeContext'
import type { Child } from '../../utils/dashboardTypes'
import type { useParentNotes } from '../../hooks/useParentNotes'
import type { useParentHomeActivity } from '../../hooks/use-parent-home-activity'
import { parentHomeCopy } from '../../utils/parent-home-copy'
import { formatParentAverage } from '../../utils/parentStatistics'
import { hexWithAlpha } from '../../utils/format'
import { useViewedParentAlerts } from '../../hooks/use-viewed-parent-alerts'
import { parentAlertToken } from '../../utils/parent-alert-history'

export default function ParentHomeOverview({ parentId, child, language, theme, academic, activity, period, onResults, onHomework, onAbsences }: {
  parentId: string; child: Child; language: string; theme: Theme; period: string
  academic: ReturnType<typeof useParentNotes>; activity: ReturnType<typeof useParentHomeActivity>
  onResults: () => void; onHomework: () => void; onAbsences: () => void
}) {
  const c = parentHomeCopy(language)
  const ar = language.startsWith('ar')
  const { width, fontScale } = useWindowDimensions()
  const viewed = useViewedParentAlerts(parentId, child.id)
  const stacked = width < 360 || fontScale > 1.25
  const row = { flexDirection: ar ? 'row-reverse' as const : 'row' as const }
  const text = { color: theme.textSoft, fontFamily: ar ? theme.fonts.arabic : theme.fonts.medium, textAlign: ar ? 'right' as const : 'left' as const, writingDirection: ar ? 'rtl' as const : 'ltr' as const }
  const bold = { ...text, color: theme.text, fontFamily: ar ? theme.fonts.arabicBold : theme.fonts.bold }
  const Chevron = ar ? ChevronLeft : ChevronRight
  const skills = academic.competenceReport?.summary
  const skillTotal = skills ? skills.acquis + skills.encours + skills.nonAcquis : 0
  const average = academic.loading || academic.error ? '—' : skills
    ? `${skills.acquis} / ${skillTotal}` : formatParentAverage(academic.report)
  const gradeNeedsSupport = !academic.loading && !academic.error && (
    (academic.report && academic.report.generalAvg < academic.report.bareme / 2) || (skills && skills.nonAcquis > 0)
  )
  const progress = activity.totalHomework > 0 ? Math.round(activity.completedHomework / activity.totalHomework * 100) : 0
  const resultAlerts = academic.report
    ? academic.report.subjects.map(subject => parentAlertToken(['results', period, academic.report!.bareme, subject.subject, subject.average, subject.controles]))
    : academic.competenceReport?.subjects.map(subject => parentAlertToken(['skills', period, subject.subject, subject.s1, subject.s2])) ?? []
  const priorities = [
    ...(activity.attendanceReady && activity.unjustifiedDays > 0 ? [{ id: 'absence', tokens: activity.absenceAlerts, title: c.absence, detail: c.absenceDetail, count: activity.unjustifiedDays, Icon: CalendarX, color: theme.warning, onPress: onAbsences }] : []),
    ...(activity.homeworkReady && activity.pendingHomework > 0 ? [{ id: 'homework', tokens: activity.homeworkAlerts, title: activity.dueToday ? c.dueToday : c.pending, detail: activity.dueToday ? c.dueDetail : c.pendingDetail, count: activity.dueToday || activity.pendingHomework, Icon: BookOpen, color: activity.dueToday ? theme.warning : theme.info, onPress: onHomework }] : []),
    ...(gradeNeedsSupport ? [{ id: 'results', tokens: resultAlerts, title: c.support, detail: c.supportDetail, count: null, Icon: GraduationCap, color: theme.primary, onPress: onResults }] : []),
  ]
  const visiblePriorities = viewed.ready ? priorities.filter(priority => !viewed.isViewed(priority.tokens)) : []
  const prioritiesLoading = !viewed.ready || academic.loading ||
    (!activity.homeworkReady && !activity.homeworkError) || (!activity.attendanceReady && !activity.attendanceError)
  const prioritiesError = activity.homeworkError || activity.attendanceError
  // Viewing an alert does not complete homework or justify an absence. Hide
  // the section after consultation without claiming those tasks are resolved.
  const showPriorities = prioritiesLoading || prioritiesError || visiblePriorities.length > 0 || priorities.length === 0
  const metrics = [
    { label: skills ? c.skills : c.average, value: average, Icon: GraduationCap, color: theme.primary, onPress: onResults },
    { label: c.homework, value: activity.homeworkReady ? String(activity.pendingHomework) : '—', Icon: BookOpen, color: theme.info, onPress: onHomework },
    { label: c.absences, value: activity.attendanceReady ? String(activity.absenceDays) : '—', Icon: CalendarX, color: theme.warning, onPress: onAbsences },
  ]

  return <View style={{ gap: 18 }}>
    <View style={[styles.hero, { backgroundColor: theme.card, borderColor: hexWithAlpha(theme.info, 0.42) }, theme.shadows.clay]}>
      <View pointerEvents="none" style={[styles.wash, { backgroundColor: hexWithAlpha(theme.info, 0.08) }]} />
      <View style={[styles.top, row, stacked && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[styles.pill, row, { backgroundColor: theme.infoSurface }]}>
          <Clock3 size={14} color={theme.info} />
          <Text style={[bold, { fontSize: 11, color: theme.info }]}>{c.today}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onResults} style={({ pressed }) => [styles.cta, row, { backgroundColor: theme.primarySurface }, pressed && styles.pressed]}>
          <Text style={[bold, { fontSize: 12, color: theme.primary, flexShrink: 1 }]}>{c.results}</Text>
          <Chevron size={15} color={theme.primary} />
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={`${c.results} · ${child.firstName} ${child.lastName}`} onPress={onResults}
        style={({ pressed }) => [styles.child, { backgroundColor: theme.surface, borderColor: hexWithAlpha(theme.info, 0.18) }, pressed && styles.pressed]}>
        <Text style={[bold, { color: theme.info, fontSize: 11 }]}>{c.title}</Text>
        <Text style={[bold, { fontSize: 25, lineHeight: ar ? 38 : 32, marginTop: 8 }]}>{child.firstName} {child.lastName}</Text>
        <Text style={[text, { fontSize: 13, marginTop: 3 }]}>{[child.classe, child.level].filter(Boolean).join(' · ')}</Text>
        <Text style={[text, { fontSize: 11, marginTop: 6 }]}>{period}</Text>
      </Pressable>

      <View style={[styles.metrics, row, stacked && { flexDirection: 'column' }]}>
        {metrics.map(({ label, value, Icon, color, onPress }) => <Pressable key={label} onPress={onPress}
          accessibilityRole="button" accessibilityLabel={`${label} : ${value}`}
          style={({ pressed }) => [styles.metric, { backgroundColor: hexWithAlpha(color, 0.09), borderColor: hexWithAlpha(color, 0.16) }, pressed && styles.pressed]}>
          <View style={row}><Icon size={16} color={color} /></View>
          <Text style={[bold, { color, fontSize: 18, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }]}>{value}</Text>
          <Text style={[text, { fontSize: 11 }]}>{label}</Text>
        </Pressable>)}
      </View>
      {academic.loading ? <ActivityIndicator accessibilityLabel={c.loading} color={theme.primary} style={{ marginTop: 12 }} />
        : academic.error ? <Text accessibilityRole="alert" style={[text, styles.note]}>{c.error}</Text>
        : <Text style={[text, styles.note]}>{skills ? c.skillsNote : academic.report ? c.gradeNote : c.emptyGrades}</Text>}

      {activity.homeworkReady && <Pressable accessibilityRole="button" onPress={onHomework} style={({ pressed }) => [{ marginTop: 16, gap: 8 }, pressed && styles.pressed]}>
        <View style={[row, { justifyContent: 'space-between', gap: 8 }]}>
          <Text style={[text, { fontSize: 11, flex: 1 }]}>{activity.totalHomework ? c.progress : c.noHomework}</Text>
          {activity.totalHomework > 0 && <Text style={[bold, { fontSize: 13, writingDirection: 'ltr' }]}>{activity.completedHomework}/{activity.totalHomework}</Text>}
        </View>
        {activity.totalHomework > 0 && <View accessibilityRole="progressbar" accessibilityLabel={c.progress} accessibilityValue={{ min: 0, max: activity.totalHomework, now: activity.completedHomework }} style={[styles.track, row, { backgroundColor: theme.infoSurface }]}>
          <View style={{ width: `${progress}%`, height: 7, borderRadius: 999, backgroundColor: theme.info }} />
        </View>}
      </Pressable>}
    </View>

    {showPriorities && <View style={{ gap: 9 }}>
      <Text style={[bold, { fontSize: 16 }]}>{c.priorities}</Text>
      {(activity.homeworkError || activity.attendanceError) && <Pressable accessibilityRole="button" onPress={activity.retry}
        style={({ pressed }) => [styles.notice, { backgroundColor: theme.warningSurface }, pressed && styles.pressed]}>
        <Text accessibilityRole="alert" style={text}>{c.error}</Text><Text style={[bold, { color: theme.primary }]}>{c.retry}</Text>
      </Pressable>}
      {prioritiesLoading && <View style={[styles.notice, row]}>
        <ActivityIndicator color={theme.info} /><Text style={[text, { fontSize: 12 }]}>{c.loading}</Text>
      </View>}
      {visiblePriorities.map(({ id, tokens, title, detail, count, Icon, color, onPress }) => <Pressable key={id} onPress={() => { onPress(); viewed.markViewed(tokens) }}
        accessibilityRole="button" accessibilityLabel={`${title}${count !== null ? ` : ${count}` : ''}. ${detail}`}
        style={({ pressed }) => [styles.priority, row, { backgroundColor: hexWithAlpha(color, 0.08), borderColor: hexWithAlpha(color, 0.22), borderStartColor: color }, pressed && styles.pressed]}>
        <Icon size={20} color={color} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={[bold, { fontSize: 14, color }]}>{title}{count !== null ? ` · ${count}` : ''}</Text>
          <Text style={[text, { fontSize: 12 }]}>{detail}</Text>
        </View>
        <Chevron size={17} color={color} />
      </Pressable>)}
      {priorities.length === 0 && !prioritiesLoading && activity.homeworkReady && activity.attendanceReady && !academic.error && <View style={[styles.notice, row, { backgroundColor: theme.successSurface }]}>
        <CheckCircle size={20} color={theme.success} />
        <View style={{ flex: 1, gap: 3 }}><Text style={[bold, { fontSize: 13, color: theme.success }]}>{c.calm}</Text><Text style={[text, { fontSize: 12 }]}>{c.calmDetail}</Text></View>
      </View>}
    </View>}
  </View>
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  wash: { position: 'absolute', width: 142, height: 142, borderRadius: 71, top: -54, right: -38 },
  top: { alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: { padding: 9, borderRadius: 12, alignItems: 'center', gap: 6 },
  cta: { minHeight: 44, padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 1 },
  child: { marginTop: 14, padding: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  metrics: { gap: 8, marginTop: 16 },
  metric: { flex: 1, minWidth: 0, minHeight: 100, padding: 10, gap: 7, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  note: { fontSize: 11, lineHeight: 18, marginTop: 12 },
  track: { height: 7, borderRadius: 999, overflow: 'hidden' },
  priority: { minHeight: 76, gap: 12, padding: 14, alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderStartWidth: 4 },
  notice: { padding: 14, gap: 10, borderRadius: 18, alignItems: 'center' },
  pressed: { opacity: 0.72 },
})
