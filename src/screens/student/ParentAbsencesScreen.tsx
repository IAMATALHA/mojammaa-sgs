/**
 * ParentAbsencesScreen — historique des absences / retards.
 *
 * - KPI strip (3 stats : justifiées / non-justifiées / retards)
 * - Filtre par enfant
 * - Liste chronologique avec type + justification
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { CalendarCheck, CalendarPlus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import {
  Card, EmptyState, SectionHeader,
} from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentAbsences } from '../../hooks/useParentAbsences'
import {
  type AbsenceEntry,
} from '../../utils/dashboardTypes'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import DeclareAbsenceSheet from '../../components/DeclareAbsenceSheet'
import { useAuth } from '../../contexts/AuthContext'
import { subscribeAbsenceRequestsForParent, type AbsenceRequestDoc } from '../../services/absenceRequestsService'
import { localeFor } from '../../utils/format'

export default function ParentAbsencesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()

  const TYPE_META: Record<string, { color: string; label: string }> = {
    absence: { color: theme.danger,  label: t('parent.absence') },
    retard:  { color: theme.warning, label: t('parent.late')  },
    depart:  { color: theme.info,    label: t('parent.earlyLeave') },
  }
  const parent = useParentData()
  const { absences: live, error: absError } = useParentAbsences()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')
  const { profile } = useAuth()
  const [showDeclare, setShowDeclare] = useState(false)
  const [declarations, setDeclarations] = useState<AbsenceRequestDoc[]>([])

  useEffect(() => {
    if (!profile?.uid) return
    return subscribeAbsenceRequestsForParent(profile.uid, setDeclarations, () => {})
  }, [profile?.uid])

  const filtered = useMemo(() => {
    const base = selectedChildId === 'all'
      ? live
      : live.filter(a => a.childId === selectedChildId)
    return [...base].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }, [selectedChildId, live])

  const stats = useMemo(() => {
    const justified   = filtered.filter(a => a.justified && a.type === 'absence').length
    const unjustified = filtered.filter(a => !a.justified).length
    const retards     = filtered.filter(a => a.type === 'retard').length
    return { justified, unjustified, retards }
  }, [filtered])

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
          {t('tabs.absences')}
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {t('parent.entriesCount', { count: filtered.length })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(absError || parent.error) && live.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}

        {/* Stat strip */}
        <View style={styles.kpiRow}>
          <KpiChip value={stats.justified} label={t('parent.justified')} color={theme.success} theme={theme} />
          <KpiChip value={stats.unjustified} label={t('parent.unjustified')} color={theme.danger} theme={theme} />
          <KpiChip value={stats.retards} label={t('parent.lateArrivals')} color={theme.warning} theme={theme} />
        </View>

        {/* Signaler une absence (déclaration parent) */}
        <Pressable
          onPress={() => setShowDeclare(true)}
          style={({ pressed }) => [styles.declareBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.88 }]}>
          <CalendarPlus size={17} color="#fff" strokeWidth={2.2} />
          <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 13.5 }}>
            {t('absenceRequest.declare')}
          </Text>
        </Pressable>

        {declarations.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t('absenceRequest.myDeclarations')} />
            <Card padding={4}>
              {declarations.slice(0, 5).map((d, idx) => {
                const meta = d.status === 'approved'
                  ? { color: theme.success, bg: theme.successSurface, label: t('absenceRequest.approved') }
                  : d.status === 'declined'
                    ? { color: theme.danger, bg: theme.dangerSurface, label: t('absenceRequest.declined') }
                    : { color: theme.warning, bg: theme.warning + '20', label: t('absenceRequest.pending') }
                return (
                  <View key={d.id} style={[styles.row, idx !== Math.min(declarations.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <View style={[styles.rowDot, { backgroundColor: meta.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 13.5 }}>
                        {d.elevePrenom} · {new Date(d.date).toLocaleDateString(localeFor(), { day: '2-digit', month: 'short' })}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 11.5, marginTop: 2 }}>
                        {d.reason}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                      <Text style={{ color: meta.color, fontFamily: theme.fonts.semibold, fontSize: 10, letterSpacing: 0.4 }}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </Card>
          </View>
        )}

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
                icon={CalendarCheck}
                title={t('parent.noAbsence')}
                message={t('parent.perfectAttendance')}
              />
            ) : (
              filtered.map((a, idx) => (
                <AbsenceRow
                  key={a.id}
                  item={a}
                  childName={childName(a.childId)}
                  isLast={idx === filtered.length - 1}
                  theme={theme}
                  typeMeta={TYPE_META}
                />
              ))
            )}
          </Card>
        </View>
      </ScrollView>

      <DeclareAbsenceSheet
        visible={showDeclare}
        onClose={() => setShowDeclare(false)}
        profile={profile}
        children={parent.children}
      />
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
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

function AbsenceRow({
  item, childName, isLast, theme, typeMeta,
}: { item: AbsenceEntry; childName: string; isLast: boolean; theme: Theme; typeMeta: Record<string, { color: string; label: string }> }) {
  const { t } = useTranslation()
  const meta = typeMeta[item.type]
  const tint = item.justified ? theme.success : theme.danger

  const date = new Date(item.date).toLocaleDateString(localeFor(), {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border },
    ]}>
      <View style={[styles.rowDot, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.semibold,
          fontSize: 13.5,
        }}>
          {meta.label} · {item.duration}
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
          {date}{childName ? ` · ${childName}` : ''} · {item.reason}
        </Text>
      </View>
      <View style={[
        styles.pill,
        { backgroundColor: item.justified ? theme.successSurface : theme.dangerSurface },
      ]}>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
        }}>
          {item.justified ? t('parent.justifiedLabel') : t('parent.unjustifiedLabel')}
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
  declareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 16, paddingVertical: 13, borderRadius: 14,
    shadowColor: '#1D3557', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
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
  rowDot: {
    width: 10, height: 10, borderRadius: 5,
    marginEnd: 12,
  },
  pill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    marginStart: 8,
  },
})
