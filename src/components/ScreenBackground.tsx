/**
 * ScreenBackground — the soft watercolor blobs used behind every role's
 * dashboard and the parent sub-screens. Absolutely positioned and
 * non-interactive; drop it as the first child inside a screen container.
 */
import React from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

export default function ScreenBackground() {
  const theme = useTheme()
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
      <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
      <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
      <Image
        source={require('../../assets/logo.png')}
        resizeMode="contain"
        style={styles.watermark}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  watermark: { width: 240, height: 240, opacity: 0.05 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },
})
