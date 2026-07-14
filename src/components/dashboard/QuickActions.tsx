import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import {
  CheckCircle, PencilLine, BookOpen, Send,
  GraduationCap, CalendarX, MessageCircle, Bell, BarChart3, FolderOpen,
  CalendarClock, CarFront, BusFront,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import type { QuickAction } from '../../utils/dashboardTypes'

const ICONS: Record<string, LucideIcon> = {
  'check-circle': CheckCircle,
  'pencil-line': PencilLine,
  'book-open': BookOpen,
  send: Send,
  'graduation-cap': GraduationCap,
  'calendar-x': CalendarX,
  'message-circle': MessageCircle,
  bell: Bell,
  'bar-chart-3': BarChart3,
  'folder-open': FolderOpen,
  'calendar-clock': CalendarClock,
  'car-front': CarFront,
  'bus-front': BusFront,
}

function actionTone(theme: Theme): Record<string, { bg: string; fg: string; border: string }> {
  return {
    primary: { bg: theme.primarySurface, fg: theme.primary, border: theme.primaryBorder },
    accent:  { bg: theme.accentSurface,  fg: theme.accent,  border: theme.accentSurface },
    info:    { bg: theme.infoSurface,    fg: theme.info,    border: theme.infoSurface },
    success: { bg: theme.successSurface, fg: theme.success, border: theme.successSurface },
    warning: { bg: theme.warningSurface, fg: theme.warning, border: theme.warningSurface },
  }
}

interface QuickActionsProps {
  actions: QuickAction[]
  onPress?: (action: QuickAction) => void
}

export default function QuickActions({ actions, onPress }: QuickActionsProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const tones = actionTone(theme)
  return (
    <View style={styles.grid}>
      {actions.map(action => {
        const Icon = ICONS[action.icon] ?? Bell
        const tint = tones[action.tint] || tones.primary
        const label = action.labelKey ? t(action.labelKey) : action.label
        return (
          <Pressable
            key={action.id}
            onPress={() => onPress?.(action)}
            accessibilityRole="button"
            accessibilityLabel={label}
            android_ripple={{ color: '#ffffff40' }}
            style={styles.tilePressable}
          >
            {({ pressed }) => (
              <MotiView
                from={{ opacity: 0 }}
                animate={{ scale: pressed ? 0.92 : 1, opacity: pressed ? 0.94 : 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 240, mass: 0.7 }}
                style={[
                  styles.tile,
                  theme.shadows.clay,
                  { backgroundColor: tint.bg },
                ]}
              >
                {action.badge != null && action.badge !== 0 ? (
                  <View style={[styles.badge, { backgroundColor: tint.fg }]}>
                    <Text style={styles.badgeText}>
                      {typeof action.badge === 'number' && action.badge > 99 ? '99+' : String(action.badge)}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.iconCircle, { backgroundColor: theme.card }]}>
                  <Icon size={21} color={tint.fg} strokeWidth={1.9} />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: theme.text,
                    fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                    fontSize: isAr ? 14 : 13,
                    marginTop: 12,
                    textAlign: isAr ? 'right' : 'left',
                    lineHeight: isAr ? 20 : 17,
                    writingDirection: isAr ? 'rtl' : 'ltr',
                  }}
                >
                  {label}
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
    minHeight: 100,
    borderRadius: 24,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
})
