/**
 * DashboardHeader — warm storybook-style welcome panel.
 */

import React from 'react'
import {
  View, Text, Image, Pressable, StyleSheet,
} from 'react-native'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { Bell } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface DashboardHeaderProps {
  greeting: string
  fullName: string
  roleLabel: string
  notifications?: number
  onPressBell?: () => void
  onPressAvatar?: () => void
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
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[theme.surface, theme.cream]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.panel,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: theme.primary,
          },
          theme.shadows.sm,
        ]}
      >
        <View style={[styles.blob, styles.blobTop, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobMiddle, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobBottom, { backgroundColor: theme.violetSurface }]} />

        <View style={styles.topRow}>
          <View style={styles.brandStrip}>
            <View style={[styles.logoWrap, { backgroundColor: theme.white, borderColor: theme.border }]}> 
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.primary,
                  fontFamily: theme.fonts.script,
                  fontSize: 24,
                  lineHeight: 28,
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
                animate={{ scale: pressed ? 0.97 : 1, opacity: pressed ? 0.9 : 1 }}
                transition={{ type: 'timing', duration: 200 }}
                style={[
                  styles.bell,
                  {
                    backgroundColor: theme.white,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Bell size={20} color={theme.primary} strokeWidth={1.75} />
                {notifications > 0 ? (
                  <View style={[styles.dot, { backgroundColor: theme.accent }]}> 
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
                animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.94 : 1 }}
                transition={{ type: 'timing', duration: 200 }}
                style={[
                  styles.avatarShell,
                  {
                    backgroundColor: theme.roseSurface,
                    borderColor: theme.rose,
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.white }]}> 
                  <Text style={{
                    color: theme.primary,
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
                fontFamily: theme.fonts.serif,
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
                marginTop: 4,
              }}
            >
              Espace {roleLabel.toLowerCase()} chaleureux, clair et prêt pour la journée.
            </Text>
            <View style={styles.tagsRow}>
              <View style={[styles.tag, { backgroundColor: theme.greenSurface }]}>
                <Text style={[styles.tagText, { color: theme.green, fontFamily: theme.fonts.semibold }]}>École</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: theme.violetSurface }]}>
                <Text style={[styles.tagText, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{roleLabel}</Text>
              </View>
            </View>
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
  },
  panel: {
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 24,
    position: 'relative',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobTop: {
    width: 160,
    height: 160,
    top: -50,
    right: -20,
  },
  blobMiddle: {
    width: 110,
    height: 110,
    bottom: 10,
    right: 70,
  },
  blobBottom: {
    width: 140,
    height: 140,
    bottom: -60,
    left: -30,
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
  logoWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  brandLogo: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
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
    marginTop: 18,
  },
  avatarShell: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    marginStart: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
})
