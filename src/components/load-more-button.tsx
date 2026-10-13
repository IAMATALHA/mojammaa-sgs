import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'

/** Pied de liste : demande une page de messages plus anciens. */
export default function LoadMoreButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.button, { borderColor: theme.border, backgroundColor: theme.surface }]}
    >
      <Text style={[styles.label, { color: theme.primary }]}>{t('common.seeMore')}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    marginTop: 12, marginHorizontal: 20, height: 46, borderRadius: 23, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '700' },
})
