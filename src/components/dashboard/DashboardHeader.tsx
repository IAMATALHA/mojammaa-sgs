/**
 * DashboardHeader — top strip with welcome message + avatar + bell.
 *
 * Used on both the teacher and the parent dashboards. The avatar
 * is initials-based so we don't need to ship images.
 */

import React from 'react'
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native'
import { MotiView } from 'moti'
import { Bell } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface DashboardHeaderProps {
  greeting:      string
  fullName:      string
  roleLabel:     string
  notifications?: number
  onPressBell?:  () => void
  onPressAvatar?:() => void
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function DashboardHeader({
  greeting, fullName, roleLabel,
  notifications = 0, onPressBell, onPressAvatar,
}: DashboardHeaderProps) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPressAvatar}
        hitSlop={8}
      >
        {({ pressed }) => (
          <MotiView
            animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
            transition={{ type: 'timing', duration: 200 }}
            style={[
              styles.avatar,
              {
                backgroundColor: theme.primarySurface,
                borderColor: theme.primaryBorder,
              },
            ]}
          >
            <Text style={{
              color: theme.primary,
              fontFamily: theme.fonts.semibold,
              fontSize: 16,
            }}>
              {initialsOf(fullName)}
            </Text>
          </MotiView>
        )}
      </Pressable>

      <View style={styles.textBlock}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize.small,
          }}
        >
          {greeting}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.fontSize.h3,
            letterSpacing: -0.3,
            marginTop: 2,
          }}
        >
          {fullName}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize.caption,
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {roleLabel}
        </Text>
      </View>

      <Pressable
        onPress={onPressBell}
        hitSlop={8}
      >
        {({ pressed }) => (
          <MotiView
            animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
            transition={{ type: 'timing', duration: 200 }}
            style={[
              styles.bell,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Bell size={20} color={theme.text} strokeWidth={1.75} />
            {notifications > 0 ? (
              <View style={[styles.dot, { backgroundColor: theme.primary }]}>
                <Text style={[styles.dotText, { fontFamily: theme.fonts.black }]}>
                  {notifications > 9 ? '9+' : String(notifications)}
                </Text>
              </View>
            ) : null}
          </MotiView>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 24,
    paddingVertical:   16,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: { flex: 1, marginHorizontal: 14 },
  bell: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  dotText: { color: '#fff', fontSize: 9 },
})
