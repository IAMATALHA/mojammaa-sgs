/**
 * ChildCard — warm storybook tile for one child.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { ChevronRight, BookOpen, TrendingUp } from 'lucide-react-native'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import type { Child } from '../../utils/dashboardTypes'

interface ChildCardProps {
  child: Child
  onPress?: () => void
}

export default function ChildCard({ child, onPress }: ChildCardProps) {
  const theme = useTheme()

  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.border }}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed ? 0.985 : 1, opacity: pressed ? 0.96 : 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: theme.primary,
            },
            theme.shadows.xs,
          ]}
        >
          <View style={[styles.wash, { backgroundColor: theme.watercolorA }]} />
          <View style={[styles.washSmall, { backgroundColor: theme.roseSurface }]} />

          <View style={styles.body}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.text,
                fontFamily: theme.fonts.semibold,
                fontSize: 16,
              }}
            >
              {child.firstName} {child.lastName}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.regular,
                fontSize: 12.5,
                marginTop: 4,
              }}
            >
              {child.classe} · {child.level}
            </Text>

            <View style={styles.badgesRow}>
              <Stat
                icon={<TrendingUp size={12} color={theme.green} strokeWidth={1.9} />}
                value={`${child.averageGrade.toFixed(1)}/20`}
                label="Moyenne"
                tone={theme.greenSurface}
                theme={theme}
              />
              <Stat
                icon={<BookOpen size={12} color={theme.accent} strokeWidth={1.9} />}
                value={String(child.pendingHomework)}
                label="À faire"
                tone={theme.accentSurface}
                theme={theme}
              />
            </View>
          </View>

          <View style={[styles.chevronWrap, { backgroundColor: theme.surface }]}> 
            <ChevronRight size={18} color={theme.textMuted} strokeWidth={1.9} />
          </View>
        </MotiView>
      )}
    </Pressable>
  )
}

function Stat({
  icon, value, label, tone, theme,
}: {
  icon: React.ReactNode
  value: string
  label: string
  tone: string
  theme: Theme
}) {
  return (
    <View style={[styles.stat, { backgroundColor: tone }]}> 
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
        fontFamily: theme.fonts.medium,
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
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    top: -36,
    right: -18,
  },
  washSmall: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 999,
    bottom: -18,
    left: 40,
  },
  body: { flex: 1 },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 10,
  },
})
