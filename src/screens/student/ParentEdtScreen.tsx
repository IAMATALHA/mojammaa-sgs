/**
 * ParentEdtScreen — emploi du temps hebdomadaire de la classe de l'enfant.
 *
 * Lit `emploiDuTemps` (via subscribeClassSchedule) filtré sur la classe de
 * l'enfant sélectionné, groupe par jour et surligne le créneau en cours
 * (pickLiveCourse). Complète la carte « cours en cours » du dashboard.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, CalendarClock, MapPin, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { subscribeClassSchedule, type EmploiSlot } from '../../services/emploiDuTempsService'
import { pickLiveCourse, parseHM } from '../../utils/courseSchedule'
import ScreenBackground from '../../components/ScreenBackground'
import { hexWithAlpha } from '../../utils/format'

// Ordre d'affichage des jours (dimanche rarement utilisé, placé en fin).
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function ParentEdtScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<any>()

  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  useEffect(() => {
    if (parent.children.length > 0 && !selectedChildId) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedChild = useMemo(
    () => parent.children.find(c => c.id === selectedChildId) ?? parent.children[0],
    [parent.children, selectedChildId],
  )

  const classe = selectedChild?.classe || ''
  const [slots, setSlots] = useState<EmploiSlot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!classe) { setSlots([]); setLoading(false); return }
    setLoading(true)
    const unsub = subscribeClassSchedule(
      classe,
      list => { setSlots(list); setLoading(false) },
      ()   => { setSlots([]); setLoading(false) },
    )
    return unsub
  }, [classe])

  // Créneau en cours (pour le surlignage) — recalculé au montage.
  const liveSlotKey = useMemo(() => {
    const live = pickLiveCourse(slots, new Date())
    if (!live || live.status !== 'now') return null
    return `${live.slot.day}__${live.slot.startTime}`
  }, [slots])

  // Groupement par jour, trié par heure.
  const grouped = useMemo(() => {
    const byDay = new Map<string, EmploiSlot[]>()
    for (const s of slots) {
      if (!byDay.has(s.day)) byDay.set(s.day, [])
      byDay.get(s.day)!.push(s)
    }
    return DAY_ORDER
      .filter(d => byDay.has(d))
      .map(d => ({
        day: d,
        items: byDay.get(d)!.sort((a, b) => parseHM(a.startTime) - parseHM(b.startTime)),
      }))
  }, [slots])

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.header}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={8}
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
            {t('parent.scheduleTitle')}
          </Text>
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize.small,
            marginTop: 2,
          }}>
            {classe || t('parent.scheduleSubtitle')}
          </Text>
        </View>
      </View>

      {/* Filtre enfant */}
      {parent.children.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
        >
          {parent.children.map(c => (
            <Pressable
              key={c.id}
              onPress={() => setSelectedChildId(c.id)}
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
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : grouped.length === 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <EmptyState
                icon={CalendarClock}
                title={t('parent.scheduleEmpty')}
                message={t('parent.scheduleEmptyMsg')}
              />
            </Card>
          </View>
        ) : (
          grouped.map(g => (
            <View key={g.day} style={styles.section}>
              <SectionHeader
                title={t(`days.${g.day}`)}
                subtitle={t('parent.scheduleCount', { count: g.items.length })}
              />
              <Card padding={4}>
                {g.items.map((s, idx) => (
                  <SlotRow
                    key={`${s.day}__${s.startTime}`}
                    slot={s}
                    isLast={idx === g.items.length - 1}
                    isNow={`${s.day}__${s.startTime}` === liveSlotKey}
                    theme={theme}
                  />
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function SlotRow({ slot, isLast, isNow, theme }: {
  slot: EmploiSlot; isLast: boolean; isNow: boolean; theme: Theme
}) {
  const { t } = useTranslation()
  return (
    <View style={[
      styles.row,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border },
      isNow && { backgroundColor: hexWithAlpha(theme.success, 0.08), borderRadius: 14 },
    ]}>
      <View style={[styles.timeBlock, { backgroundColor: isNow ? hexWithAlpha(theme.success, 0.14) : theme.surface }]}>
        <Text style={{ color: isNow ? theme.success : theme.text, fontFamily: theme.fonts.bold, fontSize: 13 }}>
          {slot.startTime}
        </Text>
        {slot.endTime ? (
          <Text style={{ color: theme.textSoft, fontFamily: theme.fonts.medium, fontSize: 10.5, marginTop: 1 }}>
            {slot.endTime}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, marginStart: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 14.5 }}>
            {slot.matiere || t('parent.liveCourse')}
          </Text>
          {isNow ? (
            <View style={[styles.nowPill, { backgroundColor: theme.success }]}>
              <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 8.5, letterSpacing: 0.4 }}>
                {t('parent.liveNow').toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          {slot.professeurNom ? (
            <View style={styles.metaItem}>
              <User size={11} color={theme.textSoft} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                {slot.professeurNom}
              </Text>
            </View>
          ) : null}
          {slot.salle ? (
            <View style={styles.metaItem}>
              <MapPin size={11} color={theme.textSoft} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                {slot.salle}
              </Text>
            </View>
          ) : null}
        </View>
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
  section: { paddingHorizontal: 20, marginTop: 18 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  timeBlock: {
    width: 56, paddingVertical: 8, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  nowPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginStart: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11.5 },
})
