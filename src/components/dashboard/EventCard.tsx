/**
 * EventCard - compact upcoming-event row. Left "date chip" + body.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Clock, PartyPopper } from 'lucide-react-native'
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
    event.type === 'exam'    ? theme.brandCoral :
    event.type === 'holiday' ? theme.schoolMint :
    event.type === 'event'   ? theme.brandOrange :
    theme.brandNavy
  const tintSurface =
    event.type === 'exam'    ? theme.brandCoralSoft :
    event.type === 'holiday' ? theme.schoolMintSoft :
    event.type === 'event'   ? theme.brandOrangeSoft :
    theme.brandNavySoft

  const content = (
    <>
      <LinearGradient
        colors={[tintSurface, theme.paperWarm]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.dateChip, { borderColor: tint }]}
      >
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.black,
          fontSize: 18,
          letterSpacing: 0,
          fontVariant: ['tabular-nums'],
        }}>
          {day}
        </Text>
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.semibold,
          fontSize: 10,
          letterSpacing: 0,
          marginTop: -2,
        }}>
          {month}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.typeRow}>
          <PartyPopper size={11} color={tint} strokeWidth={2} />
          <Text style={{
            color: tint,
            fontFamily: theme.fonts.semibold,
            fontSize: 10.5,
          }}>
            {TYPE_LABEL[event.type]}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.bold,
            fontSize: 14.5,
            marginTop: 3,
          }}
        >
          {event.title}
        </Text>
        <View style={styles.meta}>
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
            style={[styles.row, { backgroundColor: theme.paper, borderColor: theme.border }]}
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
      style={[styles.row, { backgroundColor: theme.paper, borderColor: theme.border }]}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       13,
    borderRadius:  18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom:  9,
  },
  dateChip: {
    width: 52, height: 58, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 9, flexWrap: 'wrap' },
  metaInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11 },
})
