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
  // Direction "clay" : surfaces gonflées — très arrondies, ombre douce,
  // pas de bordure visible sur la variante par défaut.
  const base: ViewStyle = {
    backgroundColor: variant === 'flat' ? theme.surface : theme.card,
    borderRadius:    theme.radius.xxl,
    padding:         padding ?? theme.spacing.lg,
    borderWidth:     variant === 'default' ? 0 : StyleSheet.hairlineWidth,
    borderColor:     variant === 'outline' ? theme.borderStrong : theme.border,
  }
  const elevation = variant === 'flat' || variant === 'outline'
    ? null
    : theme.shadows.clay

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
              scale: pressed ? 0.95 : 1,
            }}
            transition={{ type: 'spring', damping: 15, stiffness: 260, mass: 0.7 }}
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
