/**
 * DashboardHeader — warm bilingual welcome panel for parent dashboards.
 */

import React from 'react'
import {
  View, Text, Image, Pressable, StyleSheet,
} from 'react-native'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { Bell, HeartHandshake } from 'lucide-react-native'
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg'
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
        from={{ opacity: 0, translateY: 18 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 520 }}
      >
        <LinearGradient
          colors={[theme.paper, theme.brandCream, theme.paperWarm]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.panel,
            {
              borderColor: theme.border,
              shadowColor: theme.brandNavy,
            },
            theme.shadows.md,
          ]}
        >
          <View style={[styles.blob, styles.blobSun, { backgroundColor: theme.brandYellowSoft }]} />
          <View style={[styles.blob, styles.blobCoral, { backgroundColor: theme.brandCoralSoft }]} />
          <View style={[styles.blob, styles.blobSky, { backgroundColor: theme.schoolSkySoft }]} />

          <View style={styles.topRow}>
            <View style={[styles.brandStrip, { backgroundColor: 'rgba(255,255,255,0.64)', borderColor: theme.border }]}>
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
                <HeartHandshake size={13} color={theme.brandNavy} strokeWidth={2} />
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
                  fontSize: 30,
                  lineHeight: 36,
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
                Une journée claire, douce et bien suivie.
              </Text>
            </View>

            <View style={styles.sideColumn}>
              <SchoolYardIllustration theme={theme} />
              <Pressable onPress={onPressAvatar} hitSlop={8} style={styles.avatarPressable}>
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
                      fontSize: 15,
                    }}>
                      {initialsOf(fullName)}
                    </Text>
                  </MotiView>
                )}
              </Pressable>
            </View>
          </View>
        </LinearGradient>
      </MotiView>
    </View>
  )
}

function SchoolYardIllustration({ theme }: { theme: any }) {
  return (
    <Svg width={124} height={104} viewBox="0 0 124 104">
      <Circle cx={94} cy={20} r={13} fill={theme.brandYellow} opacity={0.95} />
      <Path d="M14 81C31 62 48 70 63 53C77 37 97 44 112 30" stroke={theme.schoolSky} strokeWidth={9} strokeLinecap="round" opacity={0.34} />
      <G>
        <Path d="M23 52L62 24L101 52V88H23V52Z" fill={theme.white} stroke={theme.brandNavy} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M62 24L105 55H98L62 31L26 55H19L62 24Z" fill={theme.brandCoral} />
        <Rect x={51} y={62} width={22} height={26} rx={4} fill={theme.brandNavy} />
        <Rect x={34} y={57} width={12} height={12} rx={3} fill={theme.schoolSky} />
        <Rect x={78} y={57} width={12} height={12} rx={3} fill={theme.schoolSky} />
        <Line x1={62} y1={62} x2={62} y2={88} stroke={theme.white} strokeWidth={1.2} opacity={0.5} />
      </G>
      <G>
        <Circle cx={25} cy={87} r={7} fill={theme.brandOrange} />
        <Path d="M18 101C19 92 31 92 32 101" stroke={theme.brandNavy} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={99} cy={87} r={7} fill={theme.schoolMint} />
        <Path d="M92 101C93 92 105 92 106 101" stroke={theme.brandNavy} strokeWidth={4} strokeLinecap="round" />
      </G>
      <Circle cx={16} cy={27} r={4} fill={theme.brandCoral} opacity={0.8} />
      <Circle cx={111} cy={75} r={4} fill={theme.brandYellow} opacity={0.9} />
    </Svg>
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
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobSun: {
    width: 170,
    height: 170,
    top: -72,
    right: -48,
  },
  blobCoral: {
    width: 128,
    height: 128,
    bottom: -56,
    left: -32,
  },
  blobSky: {
    width: 94,
    height: 94,
    top: 86,
    right: 40,
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
    marginTop: 18,
    gap: 8,
  },
  copyBlock: {
    flex: 1,
    paddingBottom: 4,
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
  sideColumn: {
    width: 126,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatarPressable: {
    position: 'absolute',
    right: 2,
    bottom: 0,
  },
  avatarShell: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
})
