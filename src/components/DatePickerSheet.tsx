/**
 * DatePickerSheet — lightweight, dependency-free month calendar.
 *
 * Built with Views/Pressables only (no native picker module) so it stays
 * fully themeable and works identically in Expo Go on iOS/Android. Month and
 * weekday labels come from Intl, localised via the active language.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useTranslation } from 'react-i18next'
import { localeFor } from '../utils/format'

type Props = {
  visible: boolean
  value: Date | null
  onSelect: (d: Date) => void
  onClose: () => void
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function DatePickerSheet({ visible, value, onSelect, onClose }: Props) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const locale = localeFor(i18n.language)
  const today = new Date()

  const [view, setView] = useState<Date>(startOfMonth(value ?? today))

  // Re-synchronise le mois affiché à chaque ouverture (sinon il reste figé
  // sur le mois consulté lors d'une ouverture précédente).
  useEffect(() => {
    if (visible) setView(startOfMonth(value ?? new Date()))
  }, [visible])

  // Weekday headers, Monday-first.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // 2024-01-01 is a Monday — walk 7 days from it.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 1 + i)).replace('.', ''),
    )
  }, [locale])

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view),
    [locale, view],
  )

  // Grid cells: leading blanks (Monday-first) + days of month.
  const cells = useMemo(() => {
    const first = startOfMonth(view)
    const lead = (first.getDay() + 6) % 7 // Mon=0 … Sun=6
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    const arr: (Date | null)[] = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(view.getFullYear(), view.getMonth(), d))
    return arr
  }, [view])

  const shiftMonth = (delta: number) =>
    setView(v => new Date(v.getFullYear(), v.getMonth() + delta, 1))

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }, theme.shadows.lg]}>
          {/* Header: month nav + close */}
          <View style={styles.header}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} style={[styles.navBtn, { backgroundColor: theme.surface }]}>
              <ChevronLeft size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15, textTransform: 'capitalize' }}>
              {monthLabel}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={8} style={[styles.navBtn, { backgroundColor: theme.surface }]}>
              <ChevronRight size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.navBtn, { backgroundColor: theme.surface, marginStart: 6 }]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Weekday row */}
          <View style={styles.weekRow}>
            {weekdays.map((w, i) => (
              <Text key={i} style={[styles.weekCell, { color: theme.textMuted, fontFamily: theme.fonts.semibold }]}>
                {w}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.dayCell} />
              const isSel = value ? sameDay(d, value) : false
              const isToday = sameDay(d, today)
              return (
                <Pressable
                  key={i}
                  onPress={() => { onSelect(d); onClose() }}
                  style={styles.dayCell}
                >
                  <View style={[
                    styles.dayInner,
                    isSel && { backgroundColor: theme.primary },
                    !isSel && isToday && { borderWidth: 1.5, borderColor: theme.primaryBorder },
                  ]}>
                    <Text style={{
                      color: isSel ? '#fff' : theme.text,
                      fontFamily: isSel || isToday ? theme.fonts.bold : theme.fonts.medium,
                      fontSize: 14,
                    }}>
                      {d.getDate()}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          {/* Today shortcut */}
          <Pressable
            onPress={() => { onSelect(today); onClose() }}
            style={[styles.todayBtn, { backgroundColor: theme.primarySurface }]}
          >
            <Text style={{ color: theme.primary, fontFamily: theme.fonts.bold, fontSize: 13, textTransform: 'capitalize' }}>
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const CELL = `${100 / 7}%`

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { borderRadius: 22, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  navBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { width: CELL, textAlign: 'center', fontSize: 11, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
})
