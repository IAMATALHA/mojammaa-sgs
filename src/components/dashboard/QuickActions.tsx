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
    { bg: theme.geminiSurface, icon: theme.geminiBlue },
    { bg: theme.surfaceAlt, icon: theme.geminiPurple },
    { bg: theme.geminiSurface, icon: theme.geminiCyan },
    { bg: theme.surfaceAlt, icon: theme.text },
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
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                style={[
                  styles.tile,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                  theme.shadows.xs,
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: tint.bg, borderColor: theme.geminiBorder }]}> 
                  <Icon size={20} color={tint.icon} strokeWidth={2} />
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
    minHeight: 120,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
})
