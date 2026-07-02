/**
 * ParentPerformanceScreen — vue combinée « Performance » d'un enfant :
 *   • récap du bulletin (moyenne générale, rang, mention) + détail par matière
 *   • comportement (mérites / avertissements) du même enfant
 *
 * Réutilise useParentNotes (bulletin) et useParentComportements (comportement).
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { StudentHomeStackParamList } from '../../navigation/types'
import {
  ChevronLeft, FileText, Star, AlertTriangle, Smile,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { AcademicReportCard, Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentNotes } from '../../hooks/useParentNotes'
import { useParentComportements } from '../../hooks/useParentComportements'
import type { ComportementDoc } from '../../services/comportementsService'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import { localeFor } from '../../utils/format'
import { dirStyle } from '../../utils/arabicText'

export default function ParentPerformanceScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<NativeStackNavigationProp<StudentHomeStackParamList>>()

  const parent = useParentData()
  const { entries } = useParentComportements()
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  useEffect(() => {
    if (parent.children.length > 0 && !selectedChildId) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedEleve = useMemo(
    () => parent.eleves.find(e => e.codeMassar === selectedChildId),
    [parent.eleves, selectedChildId],
  )

  const { loading, error, report } = useParentNotes(selectedChildId, selectedEleve?.classe)

  const childComportements = useMemo(
    () => entries.filter(e => e.eleveId === selectedChildId),
    [entries, selectedChildId],
  )
  const behaviorStats = useMemo(() => ({
    merites:        childComportements.filter(e => e.kind === 'merite').length,
    avertissements: childComportements.filter(e => e.kind === 'avertissement').length,
  }), [childComportements])

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      {/* Header avec bouton retour */}
      <View style={styles.header}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <ChevronLeft size={20} color={theme.primary} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={{
            color: theme.text,
            fontFamily: theme.fonts.black,
            fontSize: theme.fontSize.h2,
            letterSpacing: -0.5,
          }}>
            {t('actions.performance')}
          </Text>
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize.small,
            marginTop: 2,
          }}>
            {t('parent.performanceSubtitle')}
          </Text>
        </View>
      </View>

      {/* Filtre enfant */}
      {parent.children.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // flexShrink: 0 — sinon Yoga écrase cette rangée (hors du scroll
          // vertical) et les noms des enfants sont coupés à mi-hauteur.
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={styles.chips}
        >
          {parent.children.map(c => (
            <Pressable
              key={c.id}
              onPress={() => setSelectedChildId(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedChildId === c.id }}
              accessibilityLabel={c.firstName}
              style={[styles.chip, {
                backgroundColor: selectedChildId === c.id ? c.avatarColor : theme.surface,
                borderColor:     selectedChildId === c.id ? c.avatarColor : theme.border,
              }]}
            >
              <Text style={{
                color: selectedChildId === c.id ? '#fff' : theme.text,
                fontFamily: theme.fonts.semibold,
                fontSize: 12.5,
              }}>
                {c.firstName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(error || parent.error) && !report ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}

        {/* ── Bulletin ──────────────────────────────────── */}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : !report ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <EmptyState
                icon={FileText}
                title={t('parent.noBulletin')}
                message={t('parent.bulletinAvailable')}
              />
            </Card>
          </View>
        ) : (
          <AcademicReportCard report={report} />
        )}

        {/* ── Comportement ──────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('behavior.parentTitle')}
            subtitle={t('behavior.parentSubtitle')}
          />
          <View style={styles.kpiRow}>
            <KpiChip value={behaviorStats.merites} label={t('behavior.merites')} color={theme.success} theme={theme} />
            <KpiChip value={behaviorStats.avertissements} label={t('behavior.avertissements')} color={theme.danger} theme={theme} />
          </View>
          <Card padding={4}>
            {childComportements.length === 0 ? (
              <EmptyState
                icon={Smile}
                title={t('behavior.noEntries')}
                message={t('behavior.noEntriesMsg')}
              />
            ) : (
              childComportements.map((e, idx) => (
                <ComportementRow
                  key={e.id}
                  item={e}
                  isLast={idx === childComportements.length - 1}
                  theme={theme}
                />
              ))
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function KpiChip({ value, label, color, theme }: { value: number; label: string; color: string; theme: Theme }) {
  return (
    <View style={[styles.kpiChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.kpiDot, { backgroundColor: color }]} />
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 18, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: theme.textSoft, fontFamily: theme.fonts.medium, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 }}>{label}</Text>
    </View>
  )
}

function ComportementRow({ item, isLast, theme }: { item: ComportementDoc; isLast: boolean; theme: Theme }) {
  const { t } = useTranslation()
  const merite = item.kind === 'merite'
  const tint = merite ? theme.success : theme.danger
  const Icon = merite ? Star : AlertTriangle

  const date = new Date(item.date).toLocaleDateString(localeFor(), {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: tint + '18' }]}>
        <Icon size={16} color={tint} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 13.5 }}>
          {t(`behavior.reasons.${item.reason}`)}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 11.5, marginTop: 2 }}>
          {date} · {item.teacherNom}
        </Text>
        {item.comment ? (
          <Text style={[{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 12, marginTop: 4 }, dirStyle(item.comment)]}>
            “{item.comment}”
          </Text>
        ) : null}
      </View>
      <View style={[styles.pill, { backgroundColor: merite ? theme.successSurface : theme.dangerSurface }]}>
        <Text style={{ color: tint, fontFamily: theme.fonts.semibold, fontSize: 10, letterSpacing: 0.4 }}>
          {t(`behavior.${item.kind}`).toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  chips: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginEnd: 6 },
  scroll: { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  kpiDot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginStart: 8 },
})
