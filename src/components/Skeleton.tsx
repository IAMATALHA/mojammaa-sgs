/**
 * Skeleton loader avec animation "shimmer" — bien plus polished qu'un
 * ActivityIndicator au centre. Pattern utilisé par Facebook, LinkedIn,
 * Instagram pendant le chargement des feeds.
 *
 * Usage :
 *   <Skeleton width={120} height={14} radius={4} />
 *   <SkeletonRow lines={3} />
 *   <SkeletonCard />
 */
import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated'
import { useTheme } from '../contexts/ThemeContext'

interface SkeletonProps {
  width?:  number | `${number}%`
  height?: number
  radius?: number
  style?:  any
}

export function Skeleton({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) {
  const theme = useTheme()
  const opacity = useSharedValue(0.4)

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    )
  }, [opacity])

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.border },
        animStyle,
        style,
      ]}
    />
  )
}

/** Bloc de N lignes (pour faux-paragraphe) */
export function SkeletonLines({ lines = 3, gap = 6 }: { lines?: number; gap?: number }) {
  return (
    <View>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={12}
          style={{ marginBottom: i === lines - 1 ? 0 : gap }}
        />
      ))}
    </View>
  )
}

/** Card "row" — utile dans une FlatList pendant le chargement */
export function SkeletonCard() {
  const theme = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Skeleton width={44} height={44} radius={12} />
      <View style={{ flex: 1, marginStart: 14 }}>
        <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={11} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
})
