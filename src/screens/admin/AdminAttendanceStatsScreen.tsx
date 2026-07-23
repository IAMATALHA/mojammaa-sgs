/**
 * AdminAttendanceStatsScreen — analyse d'assiduité.
 *
 * Volontairement DISTINCT de `AdminAbsencesScreen`, qui reste l'outil
 * opérationnel du jour (« qui est absent maintenant »). Celui-ci est l'écran
 * statistique : il affiche le taux du périmètre et de la période sur lesquels
 * l'admin vient de taper, pas la situation du matin.
 *
 * C'était le piège principal du lot : « 94 % · 6AEP · Année » ne doit jamais
 * ouvrir « école entière · aujourd'hui ».
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl,
} from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronRight, Clock, UserX, Users } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { functions } from '../../config/firebase'
import type { AdminStackParamList } from '../../navigation/types'
import type { AppliedScope, ScopeStudent } from '../../types/stats'

type Tab = 'resume' | 'absences' | 'retards'

interface AttendanceRow { date: string; student: ScopeStudent }

interface ClassLine {
  name: string
  presenceRate: number
  attendanceCount: number
  studentCount: number
}

interface AttendanceResult {
  presenceRate: number
  attendanceCount: number
  absentsToday: number
  retardsToday: number
  trend: { label: string; value: number }[]
  byClass: ClassLine[]
  rows: AttendanceRow[]
  total: number
  nextCursor: string | null
  applied: AppliedScope
}

export default function AdminAttendanceStatsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminAttendanceStats'>>()
  const { scope } = route.params

  const [tab, setTab] = useState<Tab>('resume')
  const [result, setResult] = useState<AttendanceResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextTab: Tab, pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await httpsCallable<
        { scope: AppliedScope; tab: Tab; limit: number }, AttendanceResult
      >(functions, 'getStatsAttendanceDetails')({ scope, tab: nextTab, limit: 50 })
      setResult(response.data)
      setError(null)
    } catch (err: any) {
      setError(err?.message || t('common.error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [scope, t])

  useEffect(() => { void load(tab) }, [tab, load])

  const scopeLabel = [
    scope.cycle ? t(`admin.statsCycle_${scope.cycle}`) : '',
    scope.niveau, scope.classe,
  ].filter(Boolean).join(' · ') || t('admin.statsWholeSchool')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'resume', label: t('admin.statsTabResume') },
    { id: 'absences', label: t('admin.statsTabAbsences') },
    { id: 'retards', label: t('admin.statsTabRetards') },
  ]

  return (
    <ScreenLayout title={t('admin.statsAttendanceAnalysis')} showBack>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(tab, true)} tintColor={theme.primary} />
        }
      >
        <View style={[styles.scopeBar, { backgroundColor: theme.primarySurface, borderColor: theme.border }]}>
          <Text numberOfLines={1} style={[styles.scopeText, { color: theme.textSoft }]}>
            {scopeLabel} · {t(`admin.statsPeriod_${scope.period}`)}
          </Text>
          {result ? (
            <Text style={[styles.scopeRate, { color: theme.primary }]}>{result.presenceRate}%</Text>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {tabs.map(item => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: tab === item.id ? theme.primary : theme.card,
                  borderColor: theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[
                styles.tabText,
                { color: tab === item.id ? '#FFFFFF' : theme.textSoft },
              ]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}

        {loading && !result ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : result ? (
          tab === 'resume' ? (
            <ResumeView
              result={result}
              theme={theme}
              t={t}
              onOpenRecidivists={() => nav.navigate('AdminScopeStudents', { scope, segment: 'recidivists' })}
            />
          ) : (
            <RowsView rows={result.rows} total={result.total} tab={tab} theme={theme} t={t} nav={nav} scope={scope} />
          )
        ) : null}
      </ScrollView>
    </ScreenLayout>
  )
}

function ResumeView({ result, theme, t, onOpenRecidivists }: {
  result: AttendanceResult; theme: Theme; t: TFunction; onOpenRecidivists: () => void
}) {
  const maxTrend = Math.max(1, ...result.trend.map(p => p.value))
  return (
    <>
      <View style={styles.metricRow}>
        <MetricCard icon={<Users size={16} color={theme.info} />} value={`${result.presenceRate}%`} label={t('admin.attendanceRate')} theme={theme} />
        <MetricCard icon={<UserX size={16} color={theme.danger} />} value={String(result.absentsToday)} label={t('admin.statsAbsentsToday')} theme={theme} />
        <MetricCard icon={<Clock size={16} color={theme.warning} />} value={String(result.retardsToday)} label={t('admin.statsLateToday')} theme={theme} />
      </View>

      <Pressable
        onPress={onOpenRecidivists}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsRecidivists')}</Text>
        <Text style={[styles.cardLead, { color: theme.textSoft }]}>{t('admin.statsRecidivistsLead')}</Text>
        <ChevronRight size={15} color={theme.textMuted} style={styles.cardChevron} />
      </Pressable>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsTrend')}</Text>
        <View style={styles.trendRow}>
          {result.trend.map(point => (
            <View key={point.label} style={styles.trendCol}>
              <View style={styles.trendBarZone}>
                <View style={[
                  styles.trendBar,
                  {
                    height: `${Math.max(4, (point.value / maxTrend) * 100)}%`,
                    backgroundColor: point.value > 0 ? theme.danger : theme.surfaceAlt,
                  },
                ]} />
              </View>
              <Text style={[styles.trendLabel, { color: theme.textMuted }]}>{point.label}</Text>
              <Text style={[styles.trendValue, { color: theme.textSoft }]}>{point.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsByClass')}</Text>
        {result.byClass.length === 0 ? (
          <Text style={[styles.cardLead, { color: theme.textSoft }]}>{t('common.noData')}</Text>
        ) : (
          [...result.byClass]
            .sort((a, b) => a.presenceRate - b.presenceRate)
            .map(line => (
              <View key={line.name} style={styles.classLine}>
                <Text numberOfLines={1} style={[styles.className, { color: theme.text }]}>{line.name}</Text>
                <View style={[styles.classTrack, { backgroundColor: theme.surfaceAlt }]}>
                  <View style={[
                    styles.classFill,
                    {
                      width: `${Math.min(100, Math.max(0, line.presenceRate))}%`,
                      backgroundColor: line.presenceRate >= 92 ? theme.info : theme.danger,
                    },
                  ]} />
                </View>
                <Text style={[styles.classRate, { color: theme.textSoft }]}>{line.presenceRate}%</Text>
              </View>
            ))
        )}
      </View>
    </>
  )
}

function RowsView({ rows, total, tab, theme, t, nav, scope }: {
  rows: AttendanceRow[]
  total: number
  tab: Tab
  theme: Theme
  t: TFunction
  nav: NativeStackNavigationProp<AdminStackParamList>
  scope: AppliedScope
}) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {tab === 'retards' ? t('admin.statsNoLate') : t('admin.statsNoAbsence')}
        </Text>
        <Text style={[styles.emptyText, { color: theme.textSoft }]}>{t('admin.statsNoAbsenceText')}</Text>
      </View>
    )
  }
  return (
    <View style={styles.rowsWrap}>
      <Text style={[styles.rowsCount, { color: theme.textMuted }]}>
        {t('admin.statsCountRecords', { count: total })}
      </Text>
      {rows.map((row, index) => (
        <Pressable
          key={`${row.student.id}-${row.date}-${index}`}
          onPress={() => nav.navigate('AdminStudentFile', { eleveId: row.student.id, scope })}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.rowMain}>
            <Text numberOfLines={1} style={[styles.rowName, { color: theme.text }]}>
              {row.student.prenom} {row.student.nom}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
              {row.student.classe} · {row.date}
            </Text>
          </View>
          <ChevronRight size={14} color={theme.textMuted} />
        </Pressable>
      ))}
    </View>
  )
}

function MetricCard({ icon, value, label, theme }: {
  icon: React.ReactNode; value: string; label: string; theme: Theme
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {icon}
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 30, gap: 10 },
  scopeBar: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, gap: 3 },
  scopeText: { fontSize: 11, fontWeight: '700' },
  scopeRate: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tabRow: { flexDirection: 'row', gap: 7 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  tabText: { fontSize: 11, fontWeight: '800' },
  loading: { paddingVertical: 40, alignItems: 'center' },
  errorBox: { borderRadius: 10, padding: 11 },
  errorText: { fontSize: 12, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, borderWidth: 1, borderRadius: 11, padding: 10, alignItems: 'center', gap: 3 },
  metricValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { fontSize: 9, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 7 },
  cardTitle: { fontSize: 13, fontWeight: '900' },
  cardLead: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  cardChevron: { position: 'absolute', right: 12, top: 14 },
  trendRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  trendCol: { flex: 1, alignItems: 'center', gap: 3 },
  trendBarZone: { height: 54, width: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderRadius: 4 },
  trendLabel: { fontSize: 9, fontWeight: '700' },
  trendValue: { fontSize: 10, fontWeight: '900' },
  classLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  className: { width: 68, fontSize: 11, fontWeight: '800' },
  classTrack: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  classFill: { height: '100%', borderRadius: 4 },
  classRate: { width: 38, fontSize: 11, fontWeight: '900', textAlign: 'right' },
  rowsWrap: { gap: 6 },
  rowsCount: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 9,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 13, fontWeight: '800' },
  rowMeta: { fontSize: 10, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 22 },
  emptyTitle: { fontSize: 14, fontWeight: '900' },
  emptyText: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
})
