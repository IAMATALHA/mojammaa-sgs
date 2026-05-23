/**
 * ParentAbsencesScreen — historique des absences / retards.
 *
 * - KPI strip (3 stats : justifiées / non-justifiées / retards)
 * - Filtre par enfant
 * - Liste chronologique avec type + justification
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import {
  CalendarX, Clock, LogOut, Check, AlertTriangle, CalendarCheck,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import {
  Card, StatCard, EmptyState, SectionHeader,
} from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import {
  PARENT_ABSENCES,
  type AbsenceEntry,
} from '../../utils/mockData'

const TYPE_META = {
  absence: { icon: CalendarX, label: 'Absence' },
  retard:  { icon: Clock,     label: 'Retard'  },
  depart:  { icon: LogOut,    label: 'Départ anticipé' },
} as const

export default function ParentAbsencesScreen() {
  const theme = useTheme()
  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')

  const filtered = useMemo(() => {
    const base = selectedChildId === 'all'
      ? PARENT_ABSENCES
      : PARENT_ABSENCES.filter(a => a.childId === selectedChildId)
    return [...base].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }, [selectedChildId])

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

      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          Absences
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {filtered.length} entrée{filtered.length > 1 ? 's' : ''} sur ce trimestre
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Stat strip */}
        <View style={styles.kpiRow}>
          <StatCard
            icon={<Check size={18} color={theme.success} strokeWidth={2.2} />}
            value={stats.justified}
            label="Justifiées"
            tint="success"
          />
          <StatCard
            icon={<AlertTriangle size={18} color={theme.primary} strokeWidth={2.2} />}
            value={stats.unjustified}
            label="Non-justifiées"
            tint="primary"
          />
          <StatCard
            icon={<Clock size={18} color={theme.warning} strokeWidth={2.2} />}
            value={stats.retards}
            label="Retards"
            tint="warning"
          />
        </View>

        {/* Child filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Tous"
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
          <SectionHeader title="Historique" subtitle="Du plus récent au plus ancien" />
          <Card padding={4}>
            {filtered.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Aucune absence"
                message="Votre enfant a une présence parfaite. Bravo !"
              />
            ) : (
              filtered.map((a, idx) => (
                <AbsenceRow
                  key={a.id}
                  item={a}
                  childName={childName(a.childId)}
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
}: { label: string; active: boolean; onPress: () => void; color?: string; theme: any }) {
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

function AbsenceRow({
  item, childName, isLast, theme,
}: { item: AbsenceEntry; childName: string; isLast: boolean; theme: any }) {
  const meta = TYPE_META[item.type]
  const Icon = meta.icon
  const tint = item.justified ? theme.success : theme.primary
  const tintSurface = item.justified ? theme.successSurface : theme.dangerSurface

  const date = new Date(item.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  return (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border },
    ]}>
      <View style={[styles.iconWrap, { backgroundColor: tintSurface }]}>
        <Icon size={16} color={tint} strokeWidth={2.2} />
      </View>
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
        { backgroundColor: tintSurface },
      ]}>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
        }}>
          {item.justified ? 'JUSTIFIÉ' : 'NON JUST.'}
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
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  pill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    marginStart: 8,
  },
})
