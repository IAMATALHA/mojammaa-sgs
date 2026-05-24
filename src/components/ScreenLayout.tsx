import React from 'react'
import { View, StyleSheet, SafeAreaView, Text, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../contexts/ThemeContext'

interface ScreenLayoutProps {
  children: React.ReactNode
  title?: string
}

export default function ScreenLayout({ children, title }: ScreenLayoutProps) {
  const theme = useTheme()

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}> 
      <StatusBar barStyle="dark-content" />
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
            <Text style={[styles.headerEyebrow, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>Espace école</Text>
            <Text style={[styles.headerTitle, { color: theme.primary, fontFamily: theme.fonts.serif }]}>{title}</Text>
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
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 31,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  headerAccentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  decorativeLine: {
    height: 4,
    width: 42,
    borderRadius: 999,
  },
  decorativeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 96,
  },
})
