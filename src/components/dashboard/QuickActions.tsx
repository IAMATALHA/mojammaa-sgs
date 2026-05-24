/**
 * QuickActions — storybook-style quick access square cards.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import {
  CheckCircle, PencilLine, BookOpen, Send,
  GraduationCap, CalendarX, MessageCircle, Bell,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { QuickAction } from '../../utils/mockData'

const ICONS: Record<string, LucideIcon> = {
  'check-circle': CheckCircle,
  'pencil-line': PencilLine,
  'book-open': BookOpen,
  send: Send,
  'graduation-cap': GraduationCap,
  'calendar-x': CalendarX,
  'message-circle': MessageCircle,
  bell: Bell,
}

interface QuickActionsProps {
  actions: QuickAction[]
  onPress?: (action: QuickAction) => void
}

export default function QuickActions({ actions, onPress }: QuickActionsProps) {
  const theme = useTheme()

  const palettes = [
    { bg: theme.roseSurface, circle: theme.rose, icon: theme.primary },
    { bg: theme.violetSurface, circle: theme.violet, icon: theme.primary },
    { bg: theme.greenSurface, circle: theme.green, icon: theme.primary },
    { bg: theme.accentSurface, circle: theme.accent, icon: theme.primary },
  ]

  return (
    <View style={styles.grid}>
      {actions.map((action, index) => {
        const Icon = ICONS[action.icon] ?? Bell
        const tint = palettes[index % palettes.length]

        return (
          <Pressable
            key={action.id}
            onPress={() => onPress?.(action)}
            android_ripple={{ color: theme.border }}
            style={styles.tilePressable}
          >
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.97 : 1, opacity: pressed ? 0.92 : 1 }}
                transition={{ type: 'timing', duration: 180 }}
                style={[
                  styles.tile,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    shadowColor: theme.primary,
                  },
                  theme.shadows.xs,
                ]}
              >
                <View style={[styles.cornerWash, { backgroundColor: tint.bg }]} />
                <View style={[styles.iconCircle, { backgroundColor: tint.circle }]}> 
                  <Icon size={21} color={tint.icon} strokeWidth={1.9} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: theme.text,
                    fontFamily: theme.fonts.semibold,
                    fontSize: 13,
                    lineHeight: 18,
                    marginTop: 12,
                    textAlign: 'center',
                  }}
                >
                  {action.label}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.textMuted,
                    fontFamily: theme.fonts.medium,
                    fontSize: 10.5,
                    marginTop: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  Accès rapide
                </Text>
              </MotiView>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tilePressable: {
    width: '47%',
    flexGrow: 1,
  },
  tile: {
    minHeight: 132,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cornerWash: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    top: -18,
    right: -12,
    opacity: 0.9,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
