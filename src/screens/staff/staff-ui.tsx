import React from 'react'
import { Pressable, Text } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
export function StaffButton({ title, onPress, disabled = false, selected = false }: { title: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  const theme = useTheme()
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: selected ? theme.primary : theme.border, backgroundColor: theme.card, opacity: disabled ? 0.5 : 1, marginVertical: 4 }}>
    <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{title}</Text>
  </Pressable>
}
