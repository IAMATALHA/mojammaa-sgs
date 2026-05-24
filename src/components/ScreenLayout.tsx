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
        {title ? (
          <LinearGradient
            colors={[theme.geminiSurface, theme.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, { borderColor: theme.geminiBorder }, theme.shadows.xs]}
          >
            <Text style={[styles.headerEyebrow, { color: theme.geminiBlue, fontFamily: theme.fonts.medium }]}>System Interface</Text>
            <Text style={[styles.headerTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{title}</Text>
            <View style={styles.headerAccentRow}>
              <View style={[styles.decorativeLine, { backgroundColor: theme.geminiCyan }]} />
              <View style={[styles.decorativeDot, { backgroundColor: theme.geminiPurple }]} />
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
  header: {
    marginHorizontal: 20,
    marginTop: 18,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
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
  },
})
