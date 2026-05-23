/**
 * Card — base surface for every dashboard widget.
 *
 * Soft elevation, 16px radius, optional pressable behaviour. RTL-safe
 * because we rely on `flexDirection: 'row'` (RN auto-flips in RTL).
 */

import React from 'react'
import {
  Pressable, View, StyleSheet, ViewStyle, StyleProp,
} from 'react-native'
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
    backgroundColor: variant === 'flat' ? theme.surface : theme.card,
    borderRadius:    theme.radius.lg,
    padding:         padding ?? theme.spacing.lg,
    borderWidth:     variant === 'outline' ? 1 : 0,
    borderColor:     theme.border,
  }
  const elevation = variant === 'flat' || variant === 'outline'
    ? null
    : theme.shadows.sm

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          elevation,
          pressed && styles.pressed,
          style,
        ]}
        android_ripple={{ color: theme.border }}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={[base, elevation, style]}>{children}</View>
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
})
