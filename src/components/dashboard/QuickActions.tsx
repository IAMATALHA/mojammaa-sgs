import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import {
  CheckCircle, PencilLine, BookOpen, Send,
  GraduationCap, CalendarX, MessageCircle, Bell,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
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

const SOLID_COLORS: Record<string, { bg: string; fg: string }> = {
  primary: { bg: '#E63946', fg: '#FFFFFF' },  // rouge corail (M logo)
  accent:  { bg: '#D95B00', fg: '#FFFFFF' },  // ambre foncé (fleur logo)
  info:    { bg: '#1D3557', fg: '#FFFFFF' },  // navy (brand)
  success: { bg: '#D4A017', fg: '#FFFFFF' },  // jaune doré (M logo)
  warning: { bg: '#F77F00', fg: '#FFFFFF' },  // orange
}

interface QuickActionsProps {
  actions: QuickAction[]
  onPress?: (action: QuickAction) => void
}

export default function QuickActions({ actions, onPress }: QuickActionsProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
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
                style={[styles.tile, { backgroundColor: tint.bg }]}
              >
                {action.badge != null && action.badge !== 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {typeof action.badge === 'number' && action.badge > 99 ? '99+' : String(action.badge)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.iconCircle}>
                  <Icon size={22} color={tint.fg} strokeWidth={1.75} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: tint.fg,
                    fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                    fontSize: isAr ? 14 : 13,
                    marginTop: 10,
                    textAlign: 'center',
                    lineHeight: isAr ? 20 : 17,
                    letterSpacing: -0.1,
                    writingDirection: isAr ? 'rtl' : 'ltr',
                  }}
                >
                  {action.labelKey ? t(action.labelKey) : action.label}
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
    flex: 1,
    minHeight: 112,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#1D3557',
    fontSize: 11,
    fontWeight: '800',
  },
})
