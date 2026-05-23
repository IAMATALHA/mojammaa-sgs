/**
 * QuickActions — 4-up button grid (2x2 on phone widths).
 *
 * Icon names come from `lucide-react-native`. We resolve at runtime via a
 * tiny lookup map so callers can pass strings (mock data stays clean).
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import {
  CheckCircle, PencilLine, BookOpen, Send,
  GraduationCap, CalendarX, MessageCircle, Bell,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { QuickAction } from '../../utils/mockData'

const ICONS: Record<string, LucideIcon> = {
  'check-circle':   CheckCircle,
  'pencil-line':    PencilLine,
  'book-open':      BookOpen,
  'send':           Send,
  'graduation-cap': GraduationCap,
  'calendar-x':     CalendarX,
  'message-circle': MessageCircle,
  'bell':           Bell,
}

interface QuickActionsProps {
  actions: QuickAction[]
  onPress?: (action: QuickAction) => void
}

export default function QuickActions({ actions, onPress }: QuickActionsProps) {
  const theme = useTheme()
  const tints = {
    primary: { bg: theme.primarySurface, fg: theme.primary },
    accent:  { bg: theme.accentSurface,  fg: theme.accent  },
    success: { bg: theme.successSurface, fg: theme.success },
    info:    { bg: theme.infoSurface,    fg: theme.info    },
    warning: { bg: theme.warningSurface, fg: theme.warning },
  }
  return (
    <View style={styles.grid}>
      {actions.map(action => {
        const Icon = ICONS[action.icon] ?? Bell
        const tint = tints[action.tint]
        return (
          <Pressable
            key={action.id}
            onPress={() => onPress?.(action)}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: theme.card,
                borderColor:     theme.border,
              },
              pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: tint.bg }]}>
              <Icon size={20} color={tint.fg} strokeWidth={2.2} />
            </View>
            <Text
              numberOfLines={2}
              style={{
                color: theme.text,
                fontFamily: theme.fonts.semibold,
                fontSize: 12.5,
                marginTop: 8,
                textAlign: 'center',
                lineHeight: 16,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  tile: {
    width:        '47%',
    flexGrow:     1,
    minHeight:    96,
    borderRadius: 14,
    borderWidth:  1,
    padding:      12,
    alignItems:   'center',
    justifyContent:'center',
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
})
