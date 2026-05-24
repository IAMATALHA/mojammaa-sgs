/**
 * DashboardHeader — premium watercolor welcome panel for parent dashboards.
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
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 500 }}
      >
        <LinearGradient
          colors={[theme.paper, theme.brandCream, '#FFF9F0']}
          start={{ x: 0.02, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.panel,
            {
              borderColor: 'rgba(29, 53, 87, 0.12)',
              shadowColor: theme.brandNavy,
            },
            theme.shadows.md,
          ]}
        >
          <View style={[styles.wash, styles.washAmber, { backgroundColor: theme.brandYellowSoft }]} />
          <View style={[styles.wash, styles.washCoral, { backgroundColor: theme.brandCoralSoft }]} />
          <View style={[styles.wash, styles.washSky, { backgroundColor: theme.schoolSkySoft }]} />
          <View style={[styles.wash, styles.washMint, { backgroundColor: theme.schoolMintSoft }]} />

          <View style={styles.topRow}>
            <View style={[styles.brandStrip, { backgroundColor: 'rgba(255,255,255,0.68)', borderColor: theme.border }]}>
              <View style={[styles.logoWrap, { backgroundColor: theme.white, borderColor: theme.border }]}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.brandCopy}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.brandNavy,
                    fontFamily: theme.fonts.script,
                    fontSize: 25,
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
                  animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.86 : 1 }}
                  transition={{ type: 'timing', duration: 180 }}
                  style={[
                    styles.bell,
                    {
                      backgroundColor: theme.brandNavy,
                      borderColor: 'rgba(255,255,255,0.42)',
                    },
                  ]}
                >
                  <Bell size={20} color={theme.white} strokeWidth={1.9} />
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

          <View style={styles.heroRow}>
            <View style={styles.copyBlock}>
              <View style={[styles.kicker, { backgroundColor: theme.brandNavySoft }]}>
                <Sparkles size={13} color={theme.brandOrange} strokeWidth={2} />
                <Text style={{
                  color: theme.brandNavy,
                  fontFamily: theme.fonts.semibold,
                  fontSize: 11,
                }}>
                  Espace {roleLabel.toLowerCase()}
                </Text>
              </View>

              <Text
                numberOfLines={2}
                style={{
                  color: theme.brandNavy,
                  fontFamily: theme.fonts.black,
                  fontSize: 31,
                  lineHeight: 37,
                }}
              >
                {greeting} {fullName}
              </Text>

              <Text
                numberOfLines={2}
                style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 13,
                  lineHeight: 19,
                  marginTop: 6,
                }}
              >
                Tout est prêt pour suivre la journée avec calme.
              </Text>
            </View>

            <View style={styles.profileColumn}>
              <View style={[styles.profilePanel, { backgroundColor: 'rgba(255,255,255,0.58)', borderColor: theme.border }]}>
                <View style={[styles.profileWash, { backgroundColor: theme.brandYellowSoft }]} />
                <Pressable onPress={onPressAvatar} hitSlop={8}>
                  {({ pressed }) => (
                    <MotiView
                      animate={{ scale: pressed ? 0.96 : 1, opacity: pressed ? 0.9 : 1 }}
                      transition={{ type: 'timing', duration: 180 }}
                      style={[
                        styles.avatarShell,
                        {
                          backgroundColor: theme.white,
                          borderColor: theme.brandYellow,
                        },
                      ]}
                    >
                      <Text style={{
                        color: theme.brandNavy,
                        fontFamily: theme.fonts.black,
                        fontSize: 17,
                      }}>
                        {initialsOf(fullName)}
                      </Text>
                    </MotiView>
                  )}
                </Pressable>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.brandNavy,
                    fontFamily: theme.fonts.semibold,
                    fontSize: 11,
                    marginTop: 8,
                  }}
                >
                  Parent
                </Text>
              </View>
            </View>
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
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
  },
  wash: {
    position: 'absolute',
    borderRadius: 999,
  },
  washAmber: {
    width: 210,
    height: 142,
    top: -68,
    right: -56,
    transform: [{ rotate: '-18deg' }],
  },
  washCoral: {
    width: 176,
    height: 118,
    bottom: -52,
    left: -42,
    transform: [{ rotate: '14deg' }],
  },
  washSky: {
    width: 150,
    height: 96,
    top: 92,
    right: 58,
    transform: [{ rotate: '-24deg' }],
  },
  washMint: {
    width: 122,
    height: 88,
    bottom: 18,
    right: -20,
    transform: [{ rotate: '24deg' }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
  },
  logoWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  brandLogo: {
    width: 33,
    height: 33,
    borderRadius: 8,
  },
  brandCopy: {
    flex: 1,
    marginStart: 10,
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute',
    top: 5,
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  copyBlock: {
    flex: 1,
    paddingBottom: 2,
  },
  kicker: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  profileColumn: {
    width: 92,
    alignItems: 'flex-end',
  },
  profilePanel: {
    width: 86,
    minHeight: 104,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 10,
  },
  profileWash: {
    position: 'absolute',
    width: 88,
    height: 58,
    top: -18,
    right: -26,
    borderRadius: 999,
    transform: [{ rotate: '-18deg' }],
  },
  avatarShell: {
    width: 52,
    height: 52,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
})
