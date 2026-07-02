import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import type { ChildCompetenceReportReal } from '../../hooks/useParentNotes'
import type { CompetenceValue } from '../../services/notesService'
import Card from './Card'

interface Props {
  report: ChildCompetenceReportReal
}

type ChipTone = {
  bg: string
  fg: string
  Icon: LucideIcon
}

function toneFor(value: CompetenceValue, theme: Theme): ChipTone {
  if (value === 'Acquis') return { bg: theme.successSurface, fg: theme.success, Icon: CheckCircle2 }
  if (value === 'En cours') return { bg: theme.warningSurface, fg: theme.warning, Icon: Clock3 }
  return { bg: theme.dangerSurface, fg: theme.danger, Icon: XCircle }
}

function trendIcon(trend: ChildCompetenceReportReal['subjects'][number]['trend']): LucideIcon {
  if (trend === 'up') return ArrowUp
  if (trend === 'down') return ArrowDown
  return ArrowRight
}

function trendColor(trend: ChildCompetenceReportReal['subjects'][number]['trend'], theme: Theme): string {
  if (trend === 'up' || trend === 'new') return theme.success
  if (trend === 'down') return theme.danger
  return theme.textMuted
}

function CompetenceChip({ value }: { value: CompetenceValue | null }) {
  const theme = useTheme()
  if (!value) {
    return (
      <View style={[styles.emptyChip, { backgroundColor: theme.surfaceAlt }]}>
        <Text style={[styles.emptyChipText, { color: theme.textMuted }]}>—</Text>
      </View>
    )
  }

  const tone = toneFor(value, theme)
  const Icon = tone.Icon
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Icon size={12} color={tone.fg} strokeWidth={2.4} />
      <Text numberOfLines={1} style={[styles.chipText, { color: tone.fg }]}>{value}</Text>
    </View>
  )
}

export default function CompetenceReportCard({ report }: Props) {
  const theme = useTheme()
  const total = report.summary.acquis + report.summary.encours + report.summary.nonAcquis

  return (
    <View style={styles.wrap}>
      <Card padding={16}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.kicker, { color: theme.textSoft }]}>{report.title}</Text>
            <Text style={[styles.title, { color: theme.text }]}>Préscolaire</Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: theme.primarySurface }]}>
            <Text style={[styles.countText, { color: theme.primary }]}>{total}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryChip label="Acquis" value={report.summary.acquis} color={theme.success} bg={theme.successSurface} />
          <SummaryChip label="En cours" value={report.summary.encours} color={theme.warning} bg={theme.warningSurface} />
          <SummaryChip label="Non acquis" value={report.summary.nonAcquis} color={theme.danger} bg={theme.dangerSurface} />
        </View>

        <View style={[styles.list, { borderTopColor: theme.border }]}>
          {report.subjects.map((item, index) => {
            const Trend = trendIcon(item.trend)
            const arrowColor = trendColor(item.trend, theme)
            return (
              <View
                key={item.subject}
                style={[
                  styles.row,
                  index < report.subjects.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text numberOfLines={2} style={[styles.subject, { color: theme.text }]}>{item.subject}</Text>
                <View style={styles.flow}>
                  <CompetenceChip value={item.s1} />
                  <Trend size={14} color={arrowColor} strokeWidth={2.4} />
                  <CompetenceChip value={item.s2} />
                </View>
              </View>
            )
          })}
        </View>
      </Card>
    </View>
  )
}

function SummaryChip({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.summaryChip, { backgroundColor: bg }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.summaryLabel, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 22, fontWeight: '900', marginTop: 3 },
  countPill: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 17, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  summaryChip: { flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  summaryValue: { fontSize: 17, fontWeight: '900' },
  summaryLabel: { fontSize: 9.5, fontWeight: '800', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.2 },
  list: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  subject: { flex: 1, fontSize: 13.5, fontWeight: '700', lineHeight: 18 },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chip: { minWidth: 78, maxWidth: 96, minHeight: 28, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  chipText: { fontSize: 10.5, fontWeight: '800' },
  emptyChip: { minWidth: 78, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyChipText: { fontSize: 12, fontWeight: '800' },
})
