/**
 * ChildCard — parent dashboard tile for one of the children.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
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
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor:     theme.border,
        },
        theme.shadows.sm,
        pressed && { opacity: 0.94 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: child.avatarColor + '22' }]}>
        <Text style={{
          color: child.avatarColor,
          fontFamily: theme.fonts.bold,
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
            fontFamily: theme.fonts.bold,
            fontSize: 15,
          }}
        >
          {child.firstName} {child.lastName}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.medium,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {child.classe} · {child.level}
        </Text>
        <View style={styles.statsRow}>
          <Stat icon={<TrendingUp size={11} color={theme.success} strokeWidth={2} />}
                value={`${child.averageGrade.toFixed(1)}/20`} label="Moyenne" theme={theme} />
          <Stat icon={<BookOpen   size={11} color={theme.warning} strokeWidth={2} />}
                value={String(child.pendingHomework)}            label="À faire"  theme={theme} />
        </View>
      </View>

      <ChevronRight size={20} color={theme.textMuted} strokeWidth={2} />
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
        fontFamily: theme.fonts.bold,
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
    padding:       14,
    borderRadius:  16,
    borderWidth:   1,
    marginBottom:  10,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginEnd:  12,
  },
  body: { flex: 1 },
  statsRow: { flexDirection: 'row', marginTop: 8, gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
