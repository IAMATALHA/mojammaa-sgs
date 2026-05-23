/**
 * Skeleton — minimal animated placeholder using Moti.
 *
 * Used to indicate loading state on cards, lines, avatars.
 * Falls back gracefully when Moti is unavailable (static block).
 */

import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../contexts/ThemeContext'

interface SkeletonProps {
  width?:  number | string
  height?: number
  radius?: number
  style?:  ViewStyle
}

export function Skeleton({
  width = '100%', height = 16, radius = 8, style,
}: SkeletonProps) {
  const theme = useTheme()
  return (
    <MotiView
      from={{ opacity: 0.55 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true }}
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: theme.surfaceAlt,
        },
        style,
      ]}
    />
  )
}

export function SkeletonCard({ height = 110 }: { height?: number }) {
  const theme = useTheme()
  return (
    <View style={[
      styles.card,
      { backgroundColor: theme.card, borderColor: theme.border },
    ]}>
      <Skeleton width={34} height={34} radius={10} />
      <Skeleton width="60%" height={22} radius={6} style={{ marginTop: 12 }} />
      <Skeleton width="40%" height={12} radius={6} style={{ marginTop: 6 }} />
    </View>
  )
}

export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={34} height={34} radius={10} />
      <View style={{ flex: 1, marginStart: 12 }}>
        <Skeleton width="70%" height={14} radius={6} />
        <Skeleton width="40%" height={11} radius={6} style={{ marginTop: 6 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1, padding: 14, borderRadius: 16, borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingVertical: 10,
  },
})
