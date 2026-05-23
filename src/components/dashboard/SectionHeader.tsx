/**
 * SectionHeader — title + optional "See all" action.
 * Reused across every section of every dashboard.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../contexts/ThemeContext'

interface SectionHeaderProps {
  title:     string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

export default function SectionHeader({
  title, subtitle, actionLabel, onAction,
}: SectionHeaderProps) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text
          numberOfLines={1}
          style={[styles.title, {
            color: theme.text,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.fontSize.title,
          }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              color: theme.textSoft,
              fontFamily: theme.fonts.regular,
              fontSize: theme.fontSize.small,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onAction && actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          {({ pressed }) => (
            <MotiView
              animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.78 : 1 }}
              transition={{ type: 'timing', duration: 200 }}
            >
              <Text style={{
                color: theme.primary,
                fontFamily: theme.fonts.medium,
                fontSize: theme.fontSize.small,
              }}>
                {actionLabel}
              </Text>
            </MotiView>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    justifyContent:'space-between',
    marginBottom:  14,
  },
  titleBlock: { flex: 1, marginEnd: 16 },
  title:      { letterSpacing: -0.25 },
})
