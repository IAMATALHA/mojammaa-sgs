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
  // Carrés d'icône uniformisés : tous en navy, icône blanche.
  // Le paramètre `tint` est conservé pour la rétrocompatibilité mais
  // n'affecte plus le visuel (était autrefois la couleur du carré).
  void tint
  const iconBoxBg = theme.text       // encre du logo
  const iconColor = '#FFFFFF'
  const renderedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ color?: string; strokeWidth?: number }>, {
        color: iconColor,
        strokeWidth: 1.75,
      })
    : icon

  const trendColor =
    trend?.direction === 'up'   ? theme.textSoft :
    trend?.direction === 'down' ? theme.danger  :
    theme.textSoft

  return (
    <Card onPress={onPress} padding={16} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: iconBoxBg }]}>
        {renderedIcon}
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h3,
          marginTop: 16,
          letterSpacing: -0.35,
          fontVariant: ['tabular-nums'],
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
          marginTop: 3,
        }}
      >
        {label}
      </Text>
      {trend ? (
        <Text
          numberOfLines={1}
          style={{
            color: trendColor,
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize.caption,
            marginTop: 10,
          }}
        >
          {trend.direction === 'down' ? '↓' : trend.direction === 'up' ? '↑' : '•'} {trend.value}
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 122 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
})
