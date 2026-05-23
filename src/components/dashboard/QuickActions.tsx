/**
 * QuickActions — 4-up button grid (2x2 on phone widths).
 *
 * Icon names come from `lucide-react-native`. We resolve at runtime via a
 * tiny lookup map so callers can pass strings (mock data stays clean).
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
    accent:  { bg: theme.accentSurface, fg: theme.accent },
    success: { bg: theme.successSurface, fg: theme.success },
    info:    { bg: theme.infoSurface, fg: theme.info },
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
            style={styles.tilePressable}
          >
            {({ pressed }) => (
              <MotiView
                from={{ opacity: 0 }}
                animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
                transition={{ type: 'timing', duration: 200 }}
                style={[
                  styles.tile,
                  {
                    backgroundColor: theme.card,
                    borderColor:     theme.border,
                  },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: tint.bg }]}>
                  <Icon size={20} color={tint.fg} strokeWidth={1.75} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: theme.text,
                    fontFamily: theme.fonts.medium,
                    fontSize: 12.5,
                    marginTop: 10,
                    textAlign: 'center',
                    lineHeight: 17,
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
    flexWrap:      'wrap',
    gap:           12,
  },
  tilePressable: {
    width:        '47%',
    flexGrow:     1,
  },
  tile: {
    flex:         1,
    minHeight:    108,
    borderRadius: 16,
    borderWidth:  StyleSheet.hairlineWidth,
    padding:      16,
    alignItems:   'center',
    justifyContent:'center',
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
})
