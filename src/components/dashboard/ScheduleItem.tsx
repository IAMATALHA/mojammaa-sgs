/**
 * ScheduleItem — single row in "Today's Schedule".
 *
 * Visual rules:
 *   - `now`      → red side-bar, soft red surface, "EN COURS" pill
 *   - `done`     → muted opacity + strikethrough subject
 *   - `upcoming` → plain card
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { Clock, MapPin } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { ScheduleEntry } from '../../utils/mockData'

export default function ScheduleItem({
  item, onPress,
}: { item: ScheduleEntry; onPress?: () => void }) {
  const theme = useTheme()
  const isNow  = item.status === 'now'
  const isDone = item.status === 'done'

  const bg     = isNow ? theme.primarySurface : theme.card
  const accent = isNow ? theme.primary : theme.borderStrong

  const baseStyle = {
    backgroundColor: bg,
    borderColor: isNow ? theme.primaryBorder : theme.border,
  }

  const content = (
    <>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <View style={styles.time}>
        <Text style={{
          color: isNow ? theme.primary : theme.text,
          fontFamily: theme.fonts.bold,
          fontSize: 13,
        }}>
          {item.startTime}
        </Text>
        <Text style={{
          color: theme.textMuted,
          fontFamily: theme.fonts.regular,
          fontSize: 11,
        }}>
          {item.endTime}
        </Text>
      </View>

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.semibold,
            fontSize: 14,
            textDecorationLine: isDone ? 'line-through' : 'none',
            opacity: isDone ? 0.55 : 1,
          }}
        >
          {item.subject}
        </Text>
        <View style={styles.meta}>
          <Clock size={11} color={theme.textSoft} strokeWidth={1.75} />
          <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
            {item.classe}
          </Text>
          <View style={[styles.dot, { backgroundColor: theme.textMuted }]} />
          <MapPin size={11} color={theme.textSoft} strokeWidth={1.75} />
          <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
            {item.room}
          </Text>
        </View>
      </View>

      {isNow ? (
        <View style={[styles.pill, { backgroundColor: theme.primary }]}>
          <View style={styles.pulse} />
          <Text style={[styles.pillText, { fontFamily: theme.fonts.black }]}>EN COURS</Text>
        </View>
      ) : null}
    </>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: theme.border }}>
        {({ pressed }) => (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
            transition={{ type: 'timing', duration: 200 }}
            style={[styles.row, baseStyle]}
          >
            {content}
          </MotiView>
        )}
      </Pressable>
    )
  }

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.row, baseStyle]}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingVertical: 14,
    paddingEnd:      14,
    borderRadius:    16,
    marginBottom:    10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow:        'hidden',
  },
  bar:  { width: 3, alignSelf: 'stretch', borderRadius: 2, marginEnd: 12 },
  time: { width: 54, alignItems: 'center' },
  body: { flex: 1, marginStart: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 4 },
  metaText: { fontSize: 11 },
  dot:  { width: 3, height: 3, borderRadius: 2, marginHorizontal: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  pulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  pillText: { color: '#fff', fontSize: 9, letterSpacing: 0.4 },
})
