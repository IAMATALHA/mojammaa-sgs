/**
 * Mérites et avertissements de toute l'école (administration), comme la page
 * « Comportement » du site : totaux de la période, détail par classe puis par
 * élève, journal récent. Une entrée annulée reste lisible dans le journal mais
 * sort des totaux. Lecture seule : la saisie et l'annulation restent aux
 * professeurs (appel, journal de classe).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { collection, getDocs } from 'firebase/firestore'
import { Award, ChevronRight, TriangleAlert, Users } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import { toDocs } from '../../services/firestore'
import type { ComportementDoc } from '../../services/comportementsService'
import { summarizeBehavior, type BehaviorScope } from '../../utils/behavior-overview'
import { localISODate } from '../../utils/academicPeriod'
import { hexWithAlpha } from '../../utils/format'

const SCOPES: BehaviorScope[] = ['month', 'year', 'all']
const RECENT_LIMIT = 30

export default function AdminBehaviorScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const rtl = i18n.language.startsWith('ar')
  const locale = rtl ? 'ar-MA' : i18n.language.startsWith('en') ? 'en-GB' : 'fr-FR'
  const row = { flexDirection: rtl ? 'row-reverse' as const : 'row' as const }
  const text = { color: theme.text, textAlign: rtl ? 'right' as const : 'left' as const }
  const [entries, setEntries] = useState<ComportementDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [scope, setScope] = useState<BehaviorScope>('year')
  const [classe, setClasse] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      setEntries(toDocs<ComportementDoc>(await getDocs(collection(db, 'comportements'))))
      setHasLoaded(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const today = localISODate()
  const overview = useMemo(() => summarizeBehavior(entries, scope, today, classe ?? undefined), [entries, scope, today, classe])
  const reasonLabel = (reason: string) => t(`behavior.reasons.${reason}`, { defaultValue: reason })
  const formatDay = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`)
    return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }

  const stat = (label: string, value: number, tone: string, Icon: typeof Award) => (
    <View style={[styles.stat, { backgroundColor: theme.card, borderColor: hexWithAlpha(tone, 0.3) }, theme.shadows.xs]}>
      <View style={[styles.statIcon, { backgroundColor: hexWithAlpha(tone, 0.12) }]}><Icon size={18} color={tone} /></View>
      <Text style={[styles.statValue, { color: theme.text, fontFamily: theme.fonts.bold }]}>{value.toLocaleString(locale)}</Text>
      <Text style={[styles.statLabel, { color: theme.textSoft, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.medium }]}
        numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  )

  return (
    <ScreenLayout title={classe ? `${t('adminBehavior.title')} · ${classe}` : t('adminBehavior.title')}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && hasLoaded} onRefresh={() => { void load() }} tintColor={theme.primary} />}>
        <View style={[row, styles.segment, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          {SCOPES.map(item => {
            const active = item === scope
            return (
              <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setScope(item)}
                style={[styles.segmentItem, active && [{ backgroundColor: theme.card }, theme.shadows.xs]]}>
                <Text style={{ color: active ? theme.text : theme.textSoft, fontFamily: active ? theme.fonts.semibold : theme.fonts.medium, fontSize: 13 }}>
                  {t(`adminBehavior.scopes.${item}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {classe ? (
          <Pressable accessibilityRole="button" onPress={() => setClasse(null)} style={[row, styles.back]}>
            <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold, fontSize: 14 }}>{t('adminBehavior.allClasses')}</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={[styles.notice, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[text, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{t('adminBehavior.loadError')}</Text>
            <Pressable accessibilityRole="button" disabled={loading} onPress={() => { void load() }} style={styles.retry}>
              <Text style={[text, { color: theme.danger, fontFamily: theme.fonts.bold }]}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !hasLoaded ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : hasLoaded ? (
          <>
            <View style={[row, styles.stats]}>
              {stat(t('adminBehavior.merits'), overview.totals.merites, theme.success, Award)}
              {stat(t('adminBehavior.warnings'), overview.totals.avertissements, theme.warning, TriangleAlert)}
              {stat(t('adminBehavior.students'), overview.totals.students, theme.info, Users)}
            </View>
            {overview.totals.cancelled ? (
              <Text style={[text, { color: theme.textMuted, fontSize: 12, fontFamily: theme.fonts.regular }]}>
                {t('adminBehavior.cancelledNote', { count: overview.totals.cancelled })}
              </Text>
            ) : null}

            {!classe ? (
              <View style={styles.block}>
                <Text style={[text, styles.blockTitle, { fontFamily: theme.fonts.bold }]}>{t('adminBehavior.byClass')}</Text>
                {overview.byClass.length ? overview.byClass.map(room => (
                  <Pressable key={room.classe} accessibilityRole="button" onPress={() => setClasse(room.classe)}
                    style={({ pressed }) => [row, styles.line, { backgroundColor: pressed ? theme.surfaceAlt : theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.className, { color: theme.text, fontFamily: theme.fonts.bold }]}>{room.classe}</Text>
                    <View style={[row, styles.flex, styles.counts]}>
                      <Text style={[styles.count, { color: theme.success, backgroundColor: hexWithAlpha(theme.success, 0.1), fontFamily: theme.fonts.semibold }]}>+{room.merites}</Text>
                      <Text style={[styles.count, { color: theme.warning, backgroundColor: hexWithAlpha(theme.warning, 0.1), fontFamily: theme.fonts.semibold }]}>−{room.avertissements}</Text>
                      <Text style={[styles.meta, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{t('adminBehavior.studentsCount', { count: room.students })}</Text>
                    </View>
                    <ChevronRight size={18} color={theme.textMuted} style={rtl ? styles.flip : undefined} />
                  </Pressable>
                )) : <Text style={[text, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{t('adminBehavior.empty')}</Text>}
              </View>
            ) : (
              <View style={styles.block}>
                <Text style={[text, styles.blockTitle, { fontFamily: theme.fonts.bold }]}>{t('adminBehavior.byStudent')}</Text>
                {overview.byStudent.length ? overview.byStudent.map(student => (
                  <View key={`${student.eleveId}-${student.nom}`} style={[row, styles.line, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.flex}>
                      <Text style={[text, { fontFamily: theme.fonts.semibold, fontSize: 14 }]}>{student.prenom} {student.nom}</Text>
                      <Text style={[text, styles.meta, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{t('adminBehavior.lastEntry', { date: formatDay(student.lastDate) })}</Text>
                    </View>
                    <Text style={[styles.count, { color: theme.success, backgroundColor: hexWithAlpha(theme.success, 0.1), fontFamily: theme.fonts.semibold }]}>+{student.merites}</Text>
                    <Text style={[styles.count, { color: theme.warning, backgroundColor: hexWithAlpha(theme.warning, 0.1), fontFamily: theme.fonts.semibold }]}>−{student.avertissements}</Text>
                  </View>
                )) : <Text style={[text, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{t('adminBehavior.empty')}</Text>}
              </View>
            )}

            {overview.recent.length ? (
              <View style={styles.block}>
                <Text style={[text, styles.blockTitle, { fontFamily: theme.fonts.bold }]}>{t('adminBehavior.recent')}</Text>
                {overview.recent.slice(0, RECENT_LIMIT).map(entry => {
                  const merit = entry.kind !== 'avertissement'
                  const tone = merit ? theme.success : theme.warning
                  const cancelled = Boolean(entry.cancelledAt)
                  return (
                    <View key={entry.id} style={[row, styles.entry, { borderColor: theme.border, opacity: cancelled ? 0.55 : 1 }]}>
                      <View style={[styles.dot, { backgroundColor: cancelled ? theme.textMuted : tone }]} />
                      <View style={styles.flex}>
                        <Text style={[text, { fontFamily: theme.fonts.semibold, fontSize: 13.5, textDecorationLine: cancelled ? 'line-through' : 'none' }]}>
                          {entry.elevePrenom} {entry.eleveNom} · {entry.classe}
                        </Text>
                        <Text style={[text, styles.meta, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                          {t(merit ? 'adminBehavior.merit' : 'adminBehavior.warning')} · {reasonLabel(entry.reason)} · {formatDay(entry.date)}
                          {entry.teacherNom ? ` · ${entry.teacherNom}` : ''}
                        </Text>
                        {cancelled ? <Text style={[text, styles.meta, { color: theme.danger, fontFamily: theme.fonts.medium }]}>{t('adminBehavior.cancelled')}</Text> : null}
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32, gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  flip: { transform: [{ scaleX: -1 }] },
  segment: { borderRadius: 999, borderWidth: 1, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  back: { alignSelf: 'flex-start', minHeight: 36, alignItems: 'center' },
  notice: { borderRadius: 12, padding: 12 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  loader: { paddingVertical: 30 },
  stats: { gap: 10 },
  stat: { flex: 1, minWidth: 0, borderRadius: 18, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10, gap: 6, minHeight: 112 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 24, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11.5, lineHeight: 15 },
  block: { gap: 8 },
  blockTitle: { fontSize: 15, marginTop: 4 },
  line: { alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 54 },
  className: { fontSize: 15, minWidth: 74 },
  counts: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  count: { fontSize: 13, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  meta: { fontSize: 12, lineHeight: 17 },
  entry: { alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
})
