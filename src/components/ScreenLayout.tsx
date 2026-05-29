import React from 'react'
import { View, StyleSheet, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
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
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              {canGoBack ? (
                <Pressable
                  onPress={() => navigation.goBack()}
                  hitSlop={10}
                  style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <ChevronLeft size={20} color={theme.primary} strokeWidth={2} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={2}
                  style={[styles.headerTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}
                >
                  {title}
                </Text>
              </View>
            </View>
            <View style={styles.headerAccentRow}>
              <View style={[styles.decorativeLine, { backgroundColor: theme.accent }]} />
              <View style={[styles.decorativeDot, { backgroundColor: theme.success }]} />
            </View>
          </View>
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
    marginTop: 16,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 27,
  },
  headerAccentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
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
