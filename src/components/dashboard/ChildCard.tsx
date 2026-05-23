/**
 * ChildCard — parent dashboard tile for one of the children.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { ChevronRight, BookOpen, TrendingUp } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { Child } from '../../utils/mockData'

interface ChildCardProps {
  child: Child
  onPress?: () => void
}

function initialsOf(c: Child): string {
  return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()
}

export default function ChildCard({ child, onPress }: ChildCardProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.border }}
    >
      {({ pressed }) => (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
          transition={{ type: 'timing', duration: 200 }}
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor:     theme.border,
            },
            theme.shadows.xs,
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: theme.primarySurface }]}>
            <Text style={{
              color: theme.primary,
              fontFamily: theme.fonts.semibold,
              fontSize: 18,
            }}>
              {initialsOf(child)}
            </Text>
          </View>

          <View style={styles.body}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.text,
                fontFamily: theme.fonts.semibold,
                fontSize: 15,
              }}
            >
              {child.firstName} {child.lastName}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.regular,
                fontSize: 12,
                marginTop: 3,
              }}
            >
              {child.classe} · {child.level}
            </Text>
            <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
              <Stat icon={<TrendingUp size={11} color={theme.textSoft} strokeWidth={1.75} />}
                    value={`${child.averageGrade.toFixed(1)}/20`} label="Moyenne" theme={theme} />
              <Stat icon={<BookOpen   size={11} color={theme.textSoft} strokeWidth={1.75} />}
                    value={String(child.pendingHomework)}            label="À faire"  theme={theme} />
            </View>
          </View>

          <ChevronRight size={20} color={theme.textMuted} strokeWidth={1.75} />
        </MotiView>
      )}
    </Pressable>
  )
}

function Stat({ icon, value, label, theme }: {
  icon: React.ReactNode; value: string; label: string; theme: any
}) {
  return (
    <View style={styles.stat}>
      {icon}
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
      }}>
        {value}
      </Text>
      <Text style={{
        color: theme.textMuted,
        fontFamily: theme.fonts.regular,
        fontSize: 10.5,
      }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       16,
    borderRadius:  22,
    borderWidth:   StyleSheet.hairlineWidth,
    marginBottom:  12,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginEnd:  12,
  },
  body: { flex: 1 },
  statsRow: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
