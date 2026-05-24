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
  const color = progressColor ?? theme.brandOrange
  const angle = (clamped / 100) * 2 * Math.PI - Math.PI / 2
  const knobX = size / 2 + r * Math.cos(angle)
  const knobY = size / 2 + r * Math.sin(angle)

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r - stroke}
          fill={theme.paperWarm}
        />
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={trackColor ?? theme.brandNavySoft}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c}, ${c}`}
            strokeDashoffset={offset}
            fill="none"
          />
        </G>
        {clamped > 0 ? (
          <Circle
            cx={knobX}
            cy={knobY}
            r={stroke * 0.48}
            fill={theme.white}
            stroke={color}
            strokeWidth={3}
          />
        ) : null}
      </Svg>
      <View style={styles.label}>
        <Text style={{
          color: theme.brandNavy,
          fontFamily: theme.fonts.black,
          fontSize: size * 0.23,
          letterSpacing: 0,
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
            letterSpacing: 0,
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
