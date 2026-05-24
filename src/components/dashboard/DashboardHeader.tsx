/**
 * DashboardHeader — top strip with welcome message + avatar + bell.
 *
 * Used on both the teacher and the parent dashboards. The avatar
 * is initials-based so we don't need to ship images.
 */

import React from 'react'
import {
  View, Text, Image, Pressable, StyleSheet,
} from 'react-native'
import { MotiView } from 'moti'
import { Bell } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../contexts/ThemeContext'

interface DashboardHeaderProps {
  greeting:      string
  fullName:      string
  roleLabel:     string
  notifications?: number
  tint?:         string
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

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex) return `rgba(29, 53, 87, ${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function DashboardHeader({
  greeting, fullName, roleLabel,
  notifications = 0, tint, onPressBell, onPressAvatar,
}: DashboardHeaderProps) {
  const theme = useTheme()
  const activeTint = tint || theme.primary

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[hexWithAlpha(activeTint, 0.15), theme.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.panel,
          {
            backgroundColor: theme.card,
            borderColor: hexWithAlpha(activeTint, 0.25),
            shadowColor: activeTint,
          },
          theme.shadows.sm,
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.brandStrip}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.primary,
                  fontFamily: theme.fonts.script,
                  fontSize: 26,
                  lineHeight: 30,
                }}
              >
                Mojammaa Al Maarifa
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.arabicSemi,
                  fontSize: 11,
                  marginTop: -2,
                  writingDirection: 'rtl',
                }}
              >
                مجمع المعرفة الخصوصية
              </Text>
            </View>
          </View>

          <Pressable onPress={onPressBell} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.9 : 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                style={[
                  styles.bell,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Bell size={20} color={theme.primary} strokeWidth={1.75} />
                {notifications > 0 ? (
                  <View style={[styles.dot, { backgroundColor: activeTint }]}> 
                    <Text style={[styles.dotText, { fontFamily: theme.fonts.black }]}>
                      {notifications > 9 ? '9+' : String(notifications)}
                    </Text>
                  </View>
                ) : null}
              </MotiView>
            )}
          </Pressable>
        </View>

        <View style={styles.bottomRow}>
          <Pressable onPress={onPressAvatar} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.94 : 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                style={[
                  styles.avatarShell,
                  {
                    backgroundColor: hexWithAlpha(activeTint, 0.15),
                    borderColor: hexWithAlpha(activeTint, 0.4),
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.white }]}> 
                  <Text style={{
                    color: activeTint,
                    fontFamily: theme.fonts.bold,
                    fontSize: 18,
                  }}>
                    {initialsOf(fullName)}
                  </Text>
                </View>
              </MotiView>
            )}
          </Pressable>

          <View style={styles.textBlock}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.primary,
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize.h1,
                lineHeight: 40,
                letterSpacing: -0.6,
              }}
            >
              {greeting} {fullName}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.regular,
                fontSize: theme.fontSize.body,
                lineHeight: 22,
                marginTop: 2,
              }}
            >
              Espace {roleLabel.toLowerCase()} chaleureux et premium.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  panel: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 22,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginEnd: 12,
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    color: '#FFFFFF',
    fontSize: 9,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  avatarShell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    marginStart: 16,
  },
})
