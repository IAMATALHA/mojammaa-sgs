/**
 * DashboardHeader — institutional watercolor brand panel.
 */

import React from 'react'
import {
  View, Text, Image, Pressable, StyleSheet,
} from 'react-native'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { Bell, Sparkles } from 'lucide-react-native'
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
      <MotiView
        from={{ opacity: 0, translateY: 14 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 480 }}
      >
        <LinearGradient
          colors={[theme.paper, '#FFF8EC', theme.brandCream]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.panel,
            {
              borderColor: 'rgba(29, 53, 87, 0.10)',
              shadowColor: theme.brandNavy,
            },
            theme.shadows.md,
          ]}
        >
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.iconWatermark}
            resizeMode="contain"
          />
          <View style={[styles.wash, styles.washGold, { backgroundColor: theme.brandYellowSoft }]} />
          <View style={[styles.wash, styles.washCoral, { backgroundColor: theme.brandCoralSoft }]} />
          <View style={[styles.wash, styles.washMint, { backgroundColor: theme.schoolMintSoft }]} />

          <View style={styles.actionRow}>
            <View style={[styles.roleChip, { backgroundColor: 'rgba(255,255,255,0.58)' }]}>
              <Sparkles size={13} color={theme.brandOrange} strokeWidth={2} />
              <Text style={{
                color: theme.brandNavy,
                fontFamily: theme.fonts.semibold,
                fontSize: 11,
              }}>
                Espace {roleLabel.toLowerCase()}
              </Text>
            </View>

            <Pressable onPress={onPressBell} hitSlop={8}>
              {({ pressed }) => (
                <MotiView
                  animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.84 : 1 }}
                  transition={{ type: 'timing', duration: 180 }}
                  style={[
                    styles.bell,
                    {
                      backgroundColor: 'rgba(255,255,255,0.68)',
                      borderColor: 'rgba(29, 53, 87, 0.12)',
                    },
                  ]}
                >
                  <Bell size={20} color={theme.brandNavy} strokeWidth={1.9} />
                  {notifications > 0 ? (
                    <View style={[styles.dot, { backgroundColor: theme.brandCoral }]}>
                      <Text style={[styles.dotText, { fontFamily: theme.fonts.black }]}>
                        {notifications > 9 ? '9+' : String(notifications)}
                      </Text>
                    </View>
                  ) : null}
                </MotiView>
              )}
            </Pressable>
          </View>

          <View style={styles.brandCenter}>
            <View style={[styles.logoHalo, { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(252, 191, 73, 0.42)' }]}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: theme.brandNavy,
                fontFamily: theme.fonts.script,
                fontSize: 31,
                lineHeight: 36,
                marginTop: 10,
              }}
            >
              Mojammaa Al Maarifa
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.arabicSemi,
                fontSize: 13,
                writingDirection: 'rtl',
                marginTop: -2,
              }}
            >
              مجمع المعرفة الخصوصية
            </Text>
          </View>

          <View style={[styles.goldRule, { backgroundColor: theme.brandYellow }]} />

          <View style={styles.greetingRow}>
            <View style={styles.copyBlock}>
              <Text
                numberOfLines={2}
                style={{
                  color: theme.brandNavy,
                  fontFamily: theme.fonts.black,
                  fontSize: 27,
                  lineHeight: 33,
                }}
              >
                {greeting} {fullName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Suivi parent clair, élégant et essentiel.
              </Text>
            </View>

            <Pressable onPress={onPressAvatar} hitSlop={8}>
              {({ pressed }) => (
                <MotiView
                  animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.88 : 1 }}
                  transition={{ type: 'timing', duration: 180 }}
                  style={[
                    styles.avatarSeal,
                    {
                      backgroundColor: theme.brandNavy,
                      borderColor: 'rgba(252, 191, 73, 0.62)',
                    },
                  ]}
                >
                  <Text style={{
                    color: theme.white,
                    fontFamily: theme.fonts.black,
                    fontSize: 15,
                  }}>
                    {initialsOf(fullName)}
                  </Text>
                </MotiView>
              )}
            </Pressable>
          </View>
        </LinearGradient>
      </MotiView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  panel: {
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 18,
    position: 'relative',
  },
  iconWatermark: {
    position: 'absolute',
    width: 158,
    height: 158,
    right: -36,
    top: 38,
    opacity: 0.055,
  },
  wash: {
    position: 'absolute',
    borderRadius: 999,
  },
  washGold: {
    width: 250,
    height: 116,
    top: -54,
    left: -72,
    transform: [{ rotate: '-10deg' }],
  },
  washCoral: {
    width: 190,
    height: 96,
    right: -54,
    bottom: 92,
    transform: [{ rotate: '-15deg' }],
  },
  washMint: {
    width: 176,
    height: 92,
    left: 36,
    bottom: -38,
    transform: [{ rotate: '9deg' }],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dotText: {
    color: '#FFFFFF',
    fontSize: 9,
  },
  brandCenter: {
    alignItems: 'center',
    marginTop: 10,
  },
  logoHalo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  brandLogo: {
    width: 78,
    height: 78,
    borderRadius: 22,
  },
  goldRule: {
    alignSelf: 'center',
    width: 58,
    height: 3,
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 14,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  copyBlock: {
    flex: 1,
  },
  avatarSeal: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
})
