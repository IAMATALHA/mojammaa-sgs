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

// Quick Actions = cards solides : chaque tuile a sa propre couleur de fond
// Le texte/icône passe en blanc (ou navy sur le jaune clair).
const SOLID_COLORS: Record<string, { bg: string; fg: string }> = {
  primary: { bg: '#E63946', fg: '#FFFFFF' },  // coral
  accent:  { bg: '#F77F00', fg: '#FFFFFF' },  // orange
  info:    { bg: '#457B9D', fg: '#FFFFFF' },  // info blue
  warning: { bg: '#FCBF49', fg: '#1D3557' },  // yellow → navy text (contraste)
  success: { bg: '#1D3557', fg: '#FFFFFF' },  // navy
}

export default function QuickActions({ actions, onPress }: QuickActionsProps) {
  const theme = useTheme()
  return (
    <View style={styles.grid}>
      {actions.map(action => {
        const Icon = ICONS[action.icon] ?? Bell
        const tint = SOLID_COLORS[action.tint] || SOLID_COLORS.primary
        return (
          <Pressable
            key={action.id}
            onPress={() => onPress?.(action)}
            android_ripple={{ color: '#ffffff40' }}
            style={styles.tilePressable}
          >
            {({ pressed }) => (
              <MotiView
                from={{ opacity: 0 }}
                animate={{ scale: pressed ? 0.97 : 1, opacity: pressed ? 0.92 : 1 }}
                transition={{ type: 'timing', duration: 200 }}
                style={[
                  styles.tile,
                  { backgroundColor: tint.bg },
                ]}
              >
                <View style={styles.iconCircle}>
                  <Icon size={22} color={tint.fg} strokeWidth={1.75} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: tint.fg,
                    fontFamily: theme.fonts.bold,
                    fontSize: 13,
                    marginTop: 10,
                    textAlign: 'center',
                    lineHeight: 17,
                    letterSpacing: -0.1,
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
    minHeight:    112,
    borderRadius: 16,
    padding:      16,
    alignItems:   'center',
    justifyContent:'center',
  },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',  // halo léger sur le fond solide
  },
})
