/**
 * SectionHeader — title + optional "See all" action.
 * Reused across every section of every dashboard.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { ArrowUpRight } from 'lucide-react-native'
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
            color: theme.primary,
            fontFamily: theme.fonts.serif,
            fontSize: theme.fontSize.h3,
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
              style={[
                styles.action,
                {
                  backgroundColor: theme.brandOrangeSoft,
                  borderColor: 'rgba(247, 127, 0, 0.20)',
                },
              ]}
            >
              <Text style={{
                color: theme.brandOrange,
                fontFamily: theme.fonts.semibold,
                fontSize: theme.fontSize.small,
              }}>
                {actionLabel}
              </Text>
              <ArrowUpRight size={13} color={theme.brandOrange} strokeWidth={2.1} />
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
  title:      { letterSpacing: 0 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
})
