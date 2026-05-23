/**
 * StatCard — KPI tile.
 *
 * 2 sizes: `compact` (4-up row) and `wide` (2-up).
 * Pure presentational; icons are passed in as React nodes so callers
 * can stay free of icon-library lock-in.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import Card from './Card'

interface StatCardProps {
  icon:    React.ReactNode
  value:   string | number
  label:   string
  trend?:  { direction: 'up' | 'down' | 'flat'; value: string }
  tint?:   'primary' | 'accent' | 'success' | 'info' | 'warning'
  onPress?:() => void
}

export default function StatCard({
  icon, value, label, trend, tint = 'primary', onPress,
}: StatCardProps) {
  const theme = useTheme()
  const tints = {
    primary: { bg: theme.primarySurface, fg: theme.primary  },
    accent:  { bg: theme.accentSurface,  fg: theme.accent   },
    success: { bg: theme.successSurface, fg: theme.success  },
    info:    { bg: theme.infoSurface,    fg: theme.info     },
    warning: { bg: theme.warningSurface, fg: theme.warning  },
  }[tint]

  const trendColor =
    trend?.direction === 'up'   ? theme.success :
    trend?.direction === 'down' ? theme.danger  :
    theme.textSoft

  return (
    <Card onPress={onPress} padding={14} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: tints.bg }]}>
        {icon}
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          marginTop: 10,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.medium,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
      {trend ? (
        <Text
          numberOfLines={1}
          style={{
            color: trendColor,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.fontSize.caption,
            marginTop: 6,
          }}
        >
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '•'} {trend.value}
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 110 },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
})
