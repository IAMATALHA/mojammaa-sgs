import React from 'react'
import { View, StyleSheet, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'

interface ScreenLayoutProps {
  children: React.ReactNode
  title?: string
  showBack?: boolean
}

export default function ScreenLayout({ children, title, showBack }: ScreenLayoutProps) {
  const theme = useTheme()
  const navigation = useNavigation()
  const canGoBack = showBack ?? navigation.canGoBack()

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <View style={styles.canvas}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />

        {title ? (
          <LinearGradient
            colors={[theme.surface, theme.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, { borderColor: theme.border }, theme.shadows.xs]}
          >
            <View style={styles.headerTopRow}>
              {canGoBack ? (
                <Pressable
                  onPress={() => navigation.goBack()}
                  hitSlop={10}
                  style={[styles.backBtn, { backgroundColor: theme.surface }]}
                >
                  <ChevronLeft size={20} color={theme.primary} strokeWidth={2} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: theme.primary, fontFamily: theme.fonts.serif }]}>{title}</Text>
              </View>
            </View>
            <View style={styles.headerAccentRow}>
              <View style={[styles.decorativeLine, { backgroundColor: theme.accent }]} />
              <View style={[styles.decorativeDot, { backgroundColor: theme.success }]} />
            </View>
          </LinearGradient>
        ) : null}

        <View style={styles.container}>{children}</View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    position: 'relative',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobA: {
    width: 148,
    height: 148,
    top: -30,
    right: -24,
  },
  blobB: {
    width: 88,
    height: 88,
    top: 120,
    left: -24,
  },
  blobC: {
    width: 128,
    height: 128,
    bottom: 36,
    right: -40,
  },
  header: {
    marginHorizontal: 20,
    marginTop: 18,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  headerAccentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  decorativeLine: {
    height: 3,
    width: 36,
    borderRadius: 999,
  },
  decorativeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
})
