/**
 * ParentComportementScreen — timeline des mérites / avertissements.
 *
 * - KPI strip (mérites / avertissements)
 * - Filtre par enfant
 * - Liste chronologique (motif localisé + commentaire du prof)
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Star, AlertTriangle, Smile } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentComportements } from '../../hooks/useParentComportements'
import type { ComportementDoc } from '../../services/comportementsService'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import { localeFor } from '../../utils/format'
import { dirStyle } from '../../utils/arabicText'

export default function ParentComportementScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const parent = useParentData()
  const { entries, error } = useParentComportements()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')

  const filtered = useMemo(
    () => selectedChildId === 'all'
      ? entries
      : entries.filter(e => e.eleveId === selectedChildId),
    [selectedChildId, entries],
  )

  const stats = useMemo(() => ({
    merites:        filtered.filter(e => e.kind === 'merite').length,
    avertissements: filtered.filter(e => e.kind === 'avertissement').length,
  }), [filtered])

  const childName = (id: string): string => {
    const c = parent.children.find(x => x.id === id)
    return c ? c.firstName : ''
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          {t('behavior.parentTitle')}
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {t('behavior.parentSubtitle')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(error || parent.error) && entries.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}

        {/* Stat strip */}
        <View style={styles.kpiRow}>
          <KpiChip value={stats.merites} label={t('behavior.merites')} color={theme.success} theme={theme} />
          <KpiChip value={stats.avertissements} label={t('behavior.avertissements')} color={theme.danger} theme={theme} />
        </View>

        {/* Child filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={t('parent.allFilter')}
            active={selectedChildId === 'all'}
            onPress={() => setSelectedChildId('all')}
            theme={theme}
          />
          {parent.children.map(c => (
            <Chip
              key={c.id}
              label={c.firstName}
              active={selectedChildId === c.id}
              color={c.avatarColor}
              onPress={() => setSelectedChildId(c.id)}
              theme={theme}
            />
          ))}
        </ScrollView>

        {/* Entries */}
        <View style={styles.section}>
          <SectionHeader title={t('parent.history')} subtitle={t('parent.recentFirst')} />
          <Card padding={4}>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Smile}
                title={t('behavior.noEntries')}
                message={t('behavior.noEntriesMsg')}
              />
            ) : (
              filtered.map((e, idx) => (
                <ComportementRow
                  key={e.id}
                  item={e}
                  childName={childName(e.eleveId)}
                  isLast={idx === filtered.length - 1}
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

function Chip({
  label, active, onPress, color, theme,
}: { label: string; active: boolean; onPress: () => void; color?: string; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? (color ?? theme.primary) : theme.surface,
          borderColor:     active ? (color ?? theme.primary) : theme.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{
        color: active ? '#fff' : theme.text,
        fontFamily: theme.fonts.semibold,
        fontSize: 12.5,
      }}>
        {label}
      </Text>
    </Pressable>
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

function ComportementRow({
  item, childName, isLast, theme,
}: { item: ComportementDoc; childName: string; isLast: boolean; theme: Theme }) {
  const { t } = useTranslation()
  const merite = item.kind === 'merite'
  const tint = merite ? theme.success : theme.danger
  const Icon = merite ? Star : AlertTriangle

  const date = new Date(item.date).toLocaleDateString(localeFor(), {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border },
    ]}>
      <View style={[styles.rowIcon, { backgroundColor: tint + '18' }]}>
        <Icon size={16} color={tint} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.semibold,
          fontSize: 13.5,
        }}>
          {t(`behavior.reasons.${item.reason}`)}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 11.5,
            marginTop: 2,
          }}
        >
          {date}{childName ? ` · ${childName}` : ''} · {item.teacherNom}
        </Text>
        {item.comment ? (
          <Text style={[{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 12,
            marginTop: 4,
          }, dirStyle(item.comment)]}>
            “{item.comment}”
          </Text>
        ) : null}
      </View>
      <View style={[styles.pill, { backgroundColor: merite ? theme.successSurface : theme.dangerSurface }]}>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
        }}>
          {t(`behavior.${item.kind}`).toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  scroll: { paddingBottom: 32 },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  chips: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4, gap: 8,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
    marginEnd: 6,
  },
  section: { paddingHorizontal: 20, marginTop: 18 },
  kpiChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiDot: { width: 8, height: 8, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
  },
  rowIcon: {
    width: 32, height: 32, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  pill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    marginStart: 8,
  },
})
