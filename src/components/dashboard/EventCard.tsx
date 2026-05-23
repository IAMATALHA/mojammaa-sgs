/**
 * EventCard — compact upcoming-event row. Left "date chip" + body.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
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
  const tint =
    event.type === 'exam'    ? theme.primary :
    event.type === 'meeting' ? theme.info    :
    event.type === 'holiday' ? theme.accent  :
    theme.success

  const tintSurface =
    event.type === 'exam'    ? theme.dangerSurface  :
    event.type === 'meeting' ? theme.infoSurface    :
    event.type === 'holiday' ? theme.accentSurface  :
    theme.successSurface

  const Wrapper: any = onPress ? Pressable : View
  const wrapperProps = onPress
    ? {
        onPress,
        android_ripple: { color: theme.border },
        style: ({ pressed }: { pressed: boolean }) => [
          styles.row,
          { backgroundColor: theme.surface },
          pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
        ],
      }
    : { style: [styles.row, { backgroundColor: theme.surface }] }

  return (
    <Wrapper {...wrapperProps}>
      <View style={[styles.dateChip, { backgroundColor: tintSurface }]}>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.black,
          fontSize: 18,
          letterSpacing: -0.6,
        }}>
          {day}
        </Text>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0.8,
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
              fontFamily: theme.fonts.semibold,
              fontSize: 9.5,
              letterSpacing: 0.4,
            }}>
              {TYPE_LABEL[event.type].toUpperCase()}
            </Text>
          </View>
          {event.time ? (
            <View style={styles.metaInner}>
              <Clock size={10} color={theme.textSoft} strokeWidth={2} />
              <Text style={[styles.metaText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                {event.time}
              </Text>
            </View>
          ) : null}
          {event.location ? (
            <View style={styles.metaInner}>
              <MapPin size={10} color={theme.textSoft} strokeWidth={2} />
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
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
    borderRadius:  14,
    marginBottom:  8,
  },
  dateChip: {
    width: 48, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' },
  metaInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11 },
  kind: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 1,
  },
})
