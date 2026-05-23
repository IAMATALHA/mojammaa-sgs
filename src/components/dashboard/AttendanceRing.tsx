/**
 * AttendanceRing — circular progress ring rendered with react-native-svg.
 *
 * Pure presentational. `value` is 0-100. We compute the dash offset so the
 * arc fills clockwise from the top. The center label is configurable
 * (e.g. "93%" or a child's name).
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import { useTheme } from '../../contexts/ThemeContext'

interface AttendanceRingProps {
  value:    number
  size?:    number
  stroke?:  number
  label?:   string
  caption?: string
  trackColor?: string
  progressColor?: string
}

export default function AttendanceRing({
  value,
  size = 140,
  stroke = 10,
  label,
  caption,
  trackColor,
  progressColor,
}: AttendanceRingProps) {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={trackColor ?? theme.surfaceAlt}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={progressColor ?? theme.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c}, ${c}`}
            strokeDashoffset={offset}
            fill="none"
          />
        </G>
      </Svg>
      <View style={styles.label}>
        <Text style={{
            color: theme.text,
            fontFamily: theme.fonts.black,
          fontSize: size * 0.23,
          letterSpacing: -0.4,
          fontVariant: ['tabular-nums'],
        }}>
          {label ?? `${Math.round(clamped)}%`}
        </Text>
        {caption ? (
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
})
