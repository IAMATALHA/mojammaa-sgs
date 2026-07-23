/**
 * AdminScopeHomeworkScreen — les devoirs d'un périmètre statistique.
 *
 * Dernière entrée de la carte d'interactions. Comme les trois autres
 * drill-downs, il ne recalcule rien : `getStatsHomework` repart de
 * `resolveScope`, qui a déjà réduit les devoirs à ceux dont l'échéance tombe
 * dans la période ET dont la classe appartient au périmètre. Le total affiché
 * ici est donc le même tableau que celui compté par la tuile.
 *
 * L'écran parle de devoirs, pas d'élèves : il compte les rendus sans jamais
 * dire qui a rendu. Aucun nominatif ne transite.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { BookOpen, CalendarClock } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { functions } from '../../config/firebase'
import type { AdminStackParamList } from '../../navigation/types'
import type { AppliedScope } from '../../types/stats'

interface HomeworkRow {
  id: string
  titre: string
  classe: string
  matiere: string
  dateLimite: string
  submissions: number
  submitted: number
}

interface HomeworkResult {
  homework: HomeworkRow[]
  total: number
  nextCursor: string | null
  applied: AppliedScope
}

const PAGE_SIZE = 50

export default function AdminScopeHomeworkScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminScopeHomework'>>()
  const { scope } = route.params

  const [rows, setRows] = useState<HomeworkRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (mode: 'initial' | 'more' | 'refresh', nextCursor?: string | null) => {
    if (mode === 'more') setLoadingMore(true)
    else if (mode === 'refresh') setRefreshing(true)
    else setLoading(true)
    try {
      const response = await httpsCallable<
        { scope: AppliedScope; cursor?: string | null; limit: number }, HomeworkResult
      >(functions, 'getStatsHomework')({ scope, cursor: nextCursor ?? null, limit: PAGE_SIZE })
      const payload = response.data
      setRows(prev => (mode === 'more' ? [...prev, ...payload.homework] : payload.homework))
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
  }, [scope, t])

  useEffect(() => { void load('initial') }, [load])

  const scopeLabel = [
    scope.cycle ? t(`admin.statsCycle_${scope.cycle}`) : '',
    scope.niveau, scope.classe,
  ].filter(Boolean).join(' · ') || t('admin.statsWholeSchool')

  return (
    <ScreenLayout title={t('admin.statsHomeworkTitle')} showBack>
      <View style={[styles.scopeBar, { backgroundColor: theme.primarySurface, borderColor: theme.border }]}>
        <Text numberOfLines={1} style={[styles.scopeText, { color: theme.textSoft }]}>
          {scopeLabel} · {t(`admin.statsPeriod_${scope.period}`)}
        </Text>
        {total != null ? (
          <Text style={[styles.scopeTotal, { color: theme.primary }]}>
            {t('admin.statsCountHomework', { count: total })}
          </Text>
        ) : null}
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
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.primary} />
          }
          ListEmptyComponent={<EmptyState theme={theme} t={t} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (cursor && !loadingMore) void load('more', cursor) }}
          ListFooterComponent={loadingMore ? (
            <View style={styles.footer}><ActivityIndicator color={theme.primary} /></View>
          ) : null}
          renderItem={({ item }) => <HomeworkCard item={item} theme={theme} t={t} />}
        />
      )}
    </ScreenLayout>
  )
}

function HomeworkCard({ item, theme, t }: { item: HomeworkRow; theme: Theme; t: TFunction }) {
  const rate = item.submissions > 0 ? item.submitted / item.submissions : 0
  const tone = item.submissions === 0
    ? theme.textMuted
    : rate >= 0.8 ? theme.info : rate >= 0.5 ? theme.warning : theme.danger

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <BookOpen size={15} color={theme.warning} />
        <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.text }]}>
          {item.titre || t('admin.statsHomework')}
        </Text>
      </View>
      <Text numberOfLines={1} style={[styles.cardMeta, { color: theme.textSoft }]}>
        {[item.classe, item.matiere].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.cardFoot}>
        <View style={styles.cardDue}>
          <CalendarClock size={12} color={theme.textMuted} />
          <Text style={[styles.cardDueText, { color: theme.textMuted }]}>
            {t('admin.statsHomeworkDue', { date: item.dateLimite || '—' })}
          </Text>
        </View>
        <Text style={[styles.cardRate, { color: tone }]}>
          {t('admin.statsHomeworkSubmitted', { done: item.submitted, total: item.submissions })}
        </Text>
      </View>
    </View>
  )
}

function EmptyState({ theme, t }: { theme: Theme; t: TFunction }) {
  return (
    <View style={styles.empty}>
      <BookOpen size={26} color={theme.textMuted} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('admin.statsEmptyHomeworkTitle')}</Text>
      <Text style={[styles.emptyText, { color: theme.textSoft }]}>{t('admin.statsEmptyHomeworkText')}</Text>
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
  list: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 28 },
  card: { borderWidth: 1, borderRadius: 11, padding: 11, marginBottom: 8, gap: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '800' },
  cardMeta: { fontSize: 11, fontWeight: '700' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  cardDue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardDueText: { fontSize: 10, fontWeight: '700' },
  cardRate: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  loading: { paddingVertical: 40, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  errorBox: { marginHorizontal: 14, marginTop: 10, borderRadius: 10, padding: 11 },
  errorText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 46, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 14, fontWeight: '900' },
  emptyText: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
})
