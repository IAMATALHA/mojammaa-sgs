/**
 * EventCard - compact upcoming-event row. Left "date chip" + body.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { MapPin, Clock } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { UpcomingEvent } from '../../utils/mockData'

const TYPE_LABEL: Record<UpcomingEvent['type'], string> = {
  meeting: 'Réunion',
  exam:    'Examen',
  event:   'Sortie',
  holiday: 'Vacances',
}

function fmtMonthDay(iso: string): { day: string; month: string } {
  const d = new Date(iso)
  return {
    day:   d.toLocaleDateString('fr-FR', { day: '2-digit' }),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase().replace('.', ''),
  }
}

export default function EventCard({
  event, onPress,
}: { event: UpcomingEvent; onPress?: () => void }) {
  const theme = useTheme()
  const { day, month } = fmtMonthDay(event.date)
  const isExam = event.type === 'exam'
  const tint = isExam ? theme.primary : theme.textSoft
  const tintSurface = isExam ? theme.primarySurface : theme.surface

  const content = (
    <>
      <View style={[styles.dateChip, { backgroundColor: tintSurface }]}>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.black,
          fontSize: 18,
          letterSpacing: -0.35,
          fontVariant: ['tabular-nums'],
        }}>
          {day}
        </Text>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0.4,
          marginTop: -2,
        }}>
          {month}
        </Text>
      </View>

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.semibold,
            fontSize: 14,
          }}
        >
          {event.title}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.kind, { borderColor: tint }]}>
            <Text style={{
              color: tint,
              fontFamily: theme.fonts.medium,
              fontSize: 9.5,
              letterSpacing: 0.35,
            }}>
              {TYPE_LABEL[event.type].toUpperCase()}
            </Text>
          </View>
          {event.time ? (
            <View style={styles.metaInner}>
              <Clock size={10} color={theme.textSoft} strokeWidth={1.75} />
              <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                {event.time}
              </Text>
            </View>
          ) : null}
          {event.location ? (
            <View style={styles.metaInner}>
              <MapPin size={10} color={theme.textSoft} strokeWidth={1.75} />
              <Text
                numberOfLines={1}
                style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}
              >
                {event.location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
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
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
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
      style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       16,
    borderRadius:  16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom:  10,
  },
  dateChip: {
    width: 50, height: 54, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 8, flexWrap: 'wrap' },
  metaInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11 },
  kind: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 1,
  },
})
