/**
 * Card — base surface for every dashboard widget.
 *
 * Flat, quiet surface with optional pressable behaviour.
 */

import React from 'react'
import {
  Pressable, StyleSheet, ViewStyle, StyleProp,
} from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../contexts/ThemeContext'

interface CardProps {
  children:  React.ReactNode
  onPress?:  () => void
  padding?:  number
  style?:    StyleProp<ViewStyle>
  variant?:  'default' | 'flat' | 'outline'
}

export default function Card({
  children, onPress, padding, style, variant = 'default',
}: CardProps) {
  const theme = useTheme()
  const base: ViewStyle = {
    backgroundColor: variant === 'flat' ? theme.paperWarm : theme.paper,
    borderRadius:    theme.radius.xl,
    padding:         padding ?? 20,
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     variant === 'outline' ? theme.borderStrong : 'rgba(29, 53, 87, 0.11)',
    overflow:        'hidden',
  }
  const elevation = variant === 'flat' || variant === 'outline'
    ? null
    : theme.shadows.xs

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.border }}
        style={style}
      >
        {({ pressed }) => (
          <MotiView
            from={{ opacity: 0 }}
            animate={{
              opacity: pressed ? 0.96 : 1,
              scale: pressed ? 0.98 : 1,
            }}
            transition={{ type: 'timing', duration: 200 }}
            style={[base, elevation, style]}
          >
            {children}
          </MotiView>
        )}
      </Pressable>
    )
  }
  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[base, elevation, style]}
    >
      {children}
    </MotiView>
  )
}
