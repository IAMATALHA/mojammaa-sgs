import React from 'react'
import {
  View, Text, Pressable, StyleSheet,
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
      <LinearGradient
        colors={[theme.geminiSurface, theme.card, theme.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.panel,
          {
            borderColor: theme.geminiBorder,
            shadowColor: theme.geminiBlue,
          },
          theme.shadows.sm,
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.brandStrip}>
            <View style={[styles.logoWrap, { backgroundColor: theme.geminiBlue, borderColor: theme.geminiBlue }]}> 
              <Sparkles size={20} color={theme.white} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 18,
                  letterSpacing: -0.5,
                }}
              >
                Mojammaa Al Maarifa
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.geminiBlue,
                  fontFamily: theme.fonts.medium,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                }}
              >
                System Online
              </Text>
            </View>
          </View>

          <Pressable onPress={onPressBell} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.95 : 1, opacity: pressed ? 0.8 : 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                style={[
                  styles.bell,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Bell size={18} color={theme.text} strokeWidth={2} />
                {notifications > 0 ? (
                  <View style={[styles.dot, { backgroundColor: theme.geminiPurple }]}> 
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
                animate={{ scale: pressed ? 0.95 : 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                style={[
                  styles.avatarShell,
                  {
                    backgroundColor: theme.geminiSurface,
                    borderColor: theme.geminiBlue,
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.geminiBlue }]}> 
                  <Text style={{
                    color: theme.white,
                    fontFamily: theme.fonts.bold,
                    fontSize: 16,
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
                color: theme.text,
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize.h2,
                letterSpacing: -0.8,
              }}
            >
              {greeting} {fullName}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.regular,
                fontSize: 14,
                lineHeight: 20,
                marginTop: 4,
              }}
            >
              Interface {roleLabel.toLowerCase()} synchronisée. Toutes les données sont à jour.
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
  },
  panel: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginEnd: 12,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    marginStart: 16,
  },
})