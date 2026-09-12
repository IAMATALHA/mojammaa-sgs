import React from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import { meritProgress } from '../utils/merit-progress'
import { localISODate } from '../utils/academicPeriod'
import type { ComportementDoc } from '../services/comportementsService'

export default function MeritProgressCard({ entries, name }: { entries: ComportementDoc[]; name: string }) {
  const theme = useTheme(), { t, i18n } = useTranslation()
  const summary = meritProgress(entries, localISODate())
  const max = Math.max(1, ...summary.months.map(month => month.points))
  return (
    <View style={{ padding: 16, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, gap: 10, marginBottom: 12 }}>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 16 }}>{name}</Text>
      <Text style={{ color: theme.success, fontFamily: theme.fonts.bold, fontSize: 20 }}>{t('meritProgress.points', { count: summary.current })}</Text>
      <Text style={{ color: theme.textSoft }}>{t('meritProgress.comparison', { previous: summary.previous, year: summary.yearPoints })}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        {summary.months.map(month => {
          const label = new Date(`${month.key}-15T12:00:00Z`).toLocaleDateString(i18n.language, { month: 'short' })
          return <View key={month.key} accessible accessibilityLabel={`${label}: ${month.points}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>{month.points}</Text>
            <View style={{ height: 60, width: '100%', justifyContent: 'flex-end' }}><View style={{ height: Math.max(2, month.points / max * 60), borderRadius: 5, backgroundColor: month.points ? theme.success : theme.border }} /></View>
            <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 10 }}>{label}</Text>
          </View>
        })}
      </View>
      {summary.reasons.slice(0, 3).map(([reason, count]) => <Text key={reason} style={{ color: theme.text, fontSize: 12 }}>{t(`behavior.reasons.${reason}`, { defaultValue: t('behavior.reasons.other') })} · {count}</Text>)}
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('meritProgress.rule')}</Text>
      {summary.warnings > 0 && <Text style={{ color: theme.danger, fontSize: 12 }}>{t('meritProgress.warnings', { count: summary.warnings })}</Text>}
    </View>
  )
}
