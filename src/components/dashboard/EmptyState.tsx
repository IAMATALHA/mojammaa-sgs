/**
 * EmptyState — friendly "nothing yet" block.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
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
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.wrap, { backgroundColor: theme.paperWarm, borderColor: theme.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.white }]}>
        <Icon size={22} color={theme.brandOrange} strokeWidth={1.9} />
      </View>
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.bold,
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
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
})
