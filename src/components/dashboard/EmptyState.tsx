/**
 * EmptyState — friendly "nothing yet" block.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Inbox, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface EmptyStateProps {
  icon?:    LucideIcon
  title:    string
  message?: string
}

export default function EmptyState({
  icon: Icon = Inbox, title, message,
}: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: theme.surface }]}>
        <Icon size={22} color={theme.textMuted} strokeWidth={1.8} />
      </View>
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.semibold,
        fontSize: 14,
        marginTop: 10,
        textAlign: 'center',
      }}>
        {title}
      </Text>
      {message ? (
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: 12,
          marginTop: 4,
          textAlign: 'center',
          maxWidth: 260,
          lineHeight: 17,
        }}>
          {message}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
})
