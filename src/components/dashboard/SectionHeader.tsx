/**
 * SectionHeader — title + optional "See all" action.
 * Reused across every section of every dashboard.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { useTranslation } from 'react-i18next'
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
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  return (
    <View style={[styles.container, isAr && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.titleBlock, isAr && { alignItems: 'flex-end' }]}>
        <Text
          numberOfLines={1}
          style={[styles.title, {
            color: theme.primary,
            fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.serif,
            fontSize: theme.fontSize.h3,
            writingDirection: isAr ? 'rtl' : 'ltr',
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
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.regular,
              fontSize: theme.fontSize.small,
              writingDirection: isAr ? 'rtl' : 'ltr',
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
                color: theme.accent,
                fontFamily: theme.fonts.semibold,
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
    marginBottom:  16,
  },
  titleBlock: { flex: 1, marginEnd: 16 },
  title:      { letterSpacing: -0.45 },
})
