/**
 * QuickActions — storybook-style quick access square cards.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import {
  CheckCircle, PencilLine, BookOpen, Send,
  GraduationCap, CalendarX, MessageCircle, Bell,
  ChevronRight,
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

  const paletteFor = (tint: QuickAction['tint']) => {
    switch (tint) {
      case 'accent':
        return { wash: theme.brandCoralSoft, circle: theme.brandCoral, icon: theme.white }
      case 'warning':
        return { wash: theme.brandOrangeSoft, circle: theme.brandOrange, icon: theme.white }
      case 'success':
        return { wash: theme.schoolMintSoft, circle: theme.schoolMint, icon: theme.brandNavy }
      case 'info':
        return { wash: theme.schoolSkySoft, circle: theme.schoolSky, icon: theme.brandNavy }
      case 'primary':
      default:
        return { wash: theme.brandNavySoft, circle: theme.brandNavy, icon: theme.white }
    }
  }

  return (
    <View style={styles.grid}>
      {actions.map(action => {
        const Icon = ICONS[action.icon] ?? Bell
        const tint = paletteFor(action.tint)

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
                    backgroundColor: theme.paper,
                    borderColor: 'rgba(29, 53, 87, 0.11)',
                    shadowColor: theme.brandNavy,
                  },
                  theme.shadows.xs,
                ]}
              >
                <View style={[styles.cornerWash, { backgroundColor: tint.wash }]} />
                <View style={[styles.bottomWash, { backgroundColor: tint.wash }]} />
                <View style={[styles.iconCircle, { backgroundColor: tint.circle }]}> 
                  <Icon size={21} color={tint.icon} strokeWidth={1.9} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: theme.text,
                    fontFamily: theme.fonts.bold,
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
                    letterSpacing: 0,
                  }}
                >
                  Ouvrir
                </Text>
                <View style={[styles.arrow, { backgroundColor: theme.paperWarm }]}>
                  <ChevronRight size={13} color={theme.textMuted} strokeWidth={2} />
                </View>
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
    borderRadius: 22,
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
  bottomWash: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    bottom: -34,
    left: -18,
    opacity: 0.6,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
