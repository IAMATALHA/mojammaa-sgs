/**
 * PerformanceBars — minimalist bar-chart placeholder for class averages.
 *
 * Uses plain Views for the bars so we don't need a chart library.
 * Animation-ready: the heights are computed from `value/max` so wrapping
 * each bar in a Moti view later is trivial.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { ClassPerformance } from '../../utils/mockData'

interface Props {
  data: ClassPerformance[]
  max?: number   // upper bound for normalisation (default 20)
  height?: number
}

export default function PerformanceBars({ data, max = 20, height = 140 }: Props) {
  const theme = useTheme()
  return (
    <View style={[styles.wrap, { height }]}>
      {data.map(d => {
        const pct = Math.max(0, Math.min(1, d.average / max))
        const trendColor =
          d.trend === 'up'   ? theme.success :
          d.trend === 'down' ? theme.danger  :
          theme.textMuted
        return (
          <View key={d.classe} style={styles.col}>
            <View style={styles.barTrack}>
              <View style={[
                styles.barFill,
                {
                  height: `${pct * 100}%`,
                  backgroundColor: theme.primary,
                },
              ]}/>
              <View style={[
                styles.topMark,
                {
                  bottom: `${(d.topMark / max) * 100}%`,
                  backgroundColor: theme.accent,
                },
              ]}/>
            </View>
            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.bold,
              fontSize: 12,
              marginTop: 6,
            }}>
              {d.average.toFixed(1)}
            </Text>
            <Text style={{
              color: theme.textSoft,
              fontFamily: theme.fonts.medium,
              fontSize: 10.5,
            }}>
              {d.classe}
            </Text>
            <Text style={{
              color: trendColor,
              fontFamily: theme.fonts.semibold,
              fontSize: 10,
              marginTop: 2,
            }}>
              {d.trend === 'up' ? '▲' : d.trend === 'down' ? '▼' : '•'} top {d.topMark}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    justifyContent:'space-around',
  },
  col: { flex: 1, alignItems: 'center' },
  barTrack: {
    width: 26, height: '70%',
    borderRadius: 8,
    backgroundColor: '#F1F3F7',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  topMark: {
    position: 'absolute',
    width: '100%', height: 2,
  },
})
