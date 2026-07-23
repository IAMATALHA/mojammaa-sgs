/**
 * AdminScopeStudentsScreen — la liste d'élèves d'un périmètre statistique.
 *
 * Un seul écran pour cinq entrées de la carte d'interactions : la tuile
 * Élèves, la tuile À suivre, les récidivistes, une bande de la distribution et
 * les élèves sous / au-dessus du seuil de réussite. Tous affichent le même
 * objet élève dans le même périmètre ; les séparer aurait multiplié les
 * chemins de code sans rien apporter à l'admin.
 *
 * Le total affiché en tête provient du serveur et n'est jamais recalculé ici :
 * c'est ce qui garantit qu'il est exactement le chiffre de la tuile tapée.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, TextInput, RefreshControl,
} from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AlertTriangle, ChevronRight, Search, TrendingDown, Users } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { functions } from '../../config/firebase'
import type { AdminStackParamList } from '../../navigation/types'
import type {
  AppliedScope, FollowUpMetrics, FollowUpPriority, FollowUpReason,
  ScopeStudent, ScopeStudentsResult,
} from '../../types/stats'

const PAGE_SIZE = 50

const PRIORITY_ORDER: Record<FollowUpPriority, number> = { high: 0, medium: 1, low: 2 }

export default function AdminScopeStudentsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminScopeStudents'>>()
  const { scope, segment, band } = route.params

  const [students, setStudents] = useState<ScopeStudent[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async (mode: 'initial' | 'more' | 'refresh', nextCursor?: string | null) => {
    if (mode === 'more') setLoadingMore(true)
    else if (mode === 'refresh') setRefreshing(true)
    else setLoading(true)
    try {
      const response = await httpsCallable<
        { scope: AppliedScope; segment: string; band?: string; cursor?: string | null; limit: number },
        ScopeStudentsResult
      >(functions, 'getStatsStudents')({
        scope, segment, band, cursor: nextCursor ?? null, limit: PAGE_SIZE,
      })
      const payload = response.data
      setStudents(prev => (mode === 'more' ? [...prev, ...payload.students] : payload.students))
      setTotal(payload.total)
      setCursor(payload.nextCursor)
      setError(null)
    } catch (err: any) {
      setError(err?.message || t('common.error'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
    }
  }, [scope, segment, band, t])

  useEffect(() => { void load('initial') }, [load])

  const title = useMemo(() => {
    if (segment === 'followup') return t('admin.statsToFollow')
    if (segment === 'recidivists') return t('admin.statsRecidivists')
    if (segment === 'band') return t('admin.statsBandTitle', { band })
    if (segment === 'threshold') return t('admin.statsBelowThreshold')
    return t('admin.statsStudents')
  }, [segment, band, t])

  // Recherche purement locale sur les lignes déjà reçues : filtrer côté serveur
  // demanderait d'envoyer la saisie de l'admin à chaque frappe, alors que les
  // pages font 50 lignes et que le tri est déjà par classe puis par nom.
  const displayed = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return students
    return students.filter(row =>
      `${row.prenom} ${row.nom} ${row.classe}`.toLowerCase().includes(needle))
  }, [students, search])

  // Regroupement par classe — l'admin raisonne par classe, pas par ordre
  // alphabétique global.
  const sections = useMemo(() => {
    const byClass = new Map<string, ScopeStudent[]>()
    displayed.forEach(row => {
      const key = row.classe || t('common.other')
      const rows = byClass.get(key) || []
      rows.push(row)
      byClass.set(key, rows)
    })
    return [...byClass.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))
      .flatMap(([classe, rows]) => [
        { kind: 'header' as const, id: `h-${classe}`, classe, count: rows.length },
        ...rows.map(row => ({ kind: 'student' as const, id: row.id, student: row })),
      ])
  }, [displayed, t])

  const scopeLabel = [
    scope.cycle ? t(`admin.statsCycle_${scope.cycle}`) : '',
    scope.niveau, scope.classe,
  ].filter(Boolean).join(' · ') || t('admin.statsWholeSchool')

  return (
    <ScreenLayout title={title} showBack>
      <View style={[styles.scopeBar, { backgroundColor: theme.primarySurface, borderColor: theme.border }]}>
        <Text numberOfLines={1} style={[styles.scopeText, { color: theme.textSoft }]}>
          {scopeLabel} · {t(`admin.statsPeriod_${scope.period}`)}
        </Text>
        {total != null ? (
          <Text style={[styles.scopeTotal, { color: theme.primary }]}>
            {t('admin.statsCountStudents', { count: total })}
          </Text>
        ) : null}
      </View>

      <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Search size={16} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('admin.statsSearchStudent')}
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.primary} />
          }
          ListEmptyComponent={<EmptyState segment={segment} theme={theme} t={t} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (cursor && !loadingMore && !search) void load('more', cursor)
          }}
          ListFooterComponent={loadingMore ? (
            <View style={styles.footer}><ActivityIndicator color={theme.primary} /></View>
          ) : null}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupTitle, { color: theme.text }]}>{item.classe}</Text>
                  <Text style={[styles.groupCount, { color: theme.textMuted }]}>{item.count}</Text>
                </View>
              )
            }
            return (
              <StudentRow
                student={item.student}
                theme={theme}
                t={t}
                onPress={() => nav.navigate('AdminStudentFile', { eleveId: item.student.id, scope })}
              />
            )
          }}
        />
      )}
    </ScreenLayout>
  )
}

function StudentRow({ student, theme, t, onPress }: {
  student: ScopeStudent; theme: Theme; t: TFunction; onPress: () => void
}) {
  const reasons = (student.reasons || []).slice().sort()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${student.prenom} ${student.nom}`}
      accessibilityHint={t('admin.statsOpenStudentFile')}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowMain}>
        <Text numberOfLines={1} style={[styles.rowName, { color: theme.text }]}>
          {student.prenom} {student.nom}
        </Text>
        {reasons.length > 0 ? (
          <View style={styles.badgeRow}>
            {reasons.map(reason => (
              <ReasonBadge
                key={reason}
                reason={reason}
                metrics={student.metrics}
                theme={theme}
                t={t}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.rowEnd}>
        {student.priority ? <PriorityDot priority={student.priority} theme={theme} /> : null}
        <Text style={[styles.rowAverage, { color: theme.textSoft }]}>
          {student.average == null ? '—' : `${student.average}`}
        </Text>
        <ChevronRight size={14} color={theme.textMuted} />
      </View>
    </Pressable>
  )
}

/**
 * Badge de motif. Il porte SA PROPRE PREUVE : jamais « absentéisme » seul, mais
 * « 3 j. / 24 j. observés ». Sans le dénominateur, l'admin ne peut pas juger si
 * l'alerte est sévère, et le même badge signifierait des choses différentes
 * selon la période consultée.
 */
function ReasonBadge({ reason, metrics, theme, t }: {
  reason: FollowUpReason; metrics?: FollowUpMetrics; theme: Theme; t: TFunction
}) {
  const m = metrics || {}
  const label = (() => {
    switch (reason) {
      case 'low_average':
        return t('admin.reasonLowAverage', { average: m.average ?? '—' })
      case 'declining':
        return t('admin.reasonDeclining', { decline: m.decline ?? '—' })
      case 'absenteeism':
        return t('admin.reasonAbsenteeism', { days: m.absentDays ?? 0, observed: m.observedDays ?? 0 })
      case 'homework_not_done':
        return t('admin.reasonHomeworkNotDone', { count: m.homeworkNotDone ?? 0 })
      case 'homework_not_submitted':
        return t('admin.reasonHomeworkNotSubmitted', { count: m.homeworkNotSubmitted ?? 0 })
      default:
        return reason
    }
  })()
  const tone = reason === 'low_average' || reason === 'absenteeism'
    ? { bg: theme.dangerSurface, fg: theme.danger }
    : reason === 'declining'
      ? { bg: theme.warningSurface, fg: theme.warning }
      : { bg: theme.infoSurface, fg: theme.info }

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{label}</Text>
    </View>
  )
}

function PriorityDot({ priority, theme }: { priority: FollowUpPriority; theme: Theme }) {
  const color = priority === 'high' ? theme.danger : priority === 'medium' ? theme.warning : theme.info
  return <View style={[styles.priorityDot, { backgroundColor: color }]} />
}

/**
 * État vide explicite. Une tuile à 0 reste cliquable : arriver sur un écran
 * vide sans explication laisserait croire à une panne plutôt qu'à une bonne
 * nouvelle.
 */
function EmptyState({ segment, theme, t }: { segment: string; theme: Theme; t: TFunction }) {
  const positive = segment === 'followup' || segment === 'recidivists'
  const Icon = positive ? AlertTriangle : segment === 'threshold' ? TrendingDown : Users
  return (
    <View style={styles.empty}>
      <Icon size={26} color={positive ? theme.info : theme.textMuted} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {positive ? t('admin.statsEmptyFollowUpTitle') : t('admin.statsEmptyStudentsTitle')}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textSoft }]}>
        {positive ? t('admin.statsEmptyFollowUpText') : t('admin.statsEmptyStudentsText')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scopeBar: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    marginHorizontal: 14, marginTop: 10, gap: 3,
  },
  scopeText: { fontSize: 11, fontWeight: '700' },
  scopeTotal: { fontSize: 13, fontWeight: '900' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 11, marginHorizontal: 14, marginTop: 9, height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '600', paddingVertical: 0 },
  list: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 28 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, marginBottom: 6,
  },
  groupTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  groupCount: { fontSize: 11, fontWeight: '800' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 10, marginBottom: 7,
  },
  rowMain: { flex: 1, gap: 5 },
  rowName: { fontSize: 13, fontWeight: '800' },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowAverage: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  errorBox: { marginHorizontal: 14, marginTop: 10, borderRadius: 10, padding: 11 },
  errorText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 46, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 14, fontWeight: '900' },
  emptyText: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
})

export { PRIORITY_ORDER }
