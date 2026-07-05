/**
 * CompletionChip — pastille d'avancement (appel fait / devoir posté, etc.)
 *
 * Extrait de TeacherEdtScreen pour être réutilisé sur le Dashboard prof.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { CheckCircle2, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'

export default function CompletionChip({
  icon: Icon, label, done,
}: { icon: LucideIcon; label: string; done: boolean }) {
  const theme = useTheme()
  const tint = done ? theme.success : theme.textMuted
  return (
    <View style={[
      styles.chip,
      {
        backgroundColor: done ? theme.successSurface : theme.surfaceAlt,
        borderColor: done ? theme.success + '55' : theme.border,
      },
    ]}>
      <Icon size={12} color={tint} strokeWidth={2.2} />
      <Text style={{ color: tint, fontSize: 10.5, fontFamily: theme.fonts.bold }}>{label}</Text>
      {done ? <CheckCircle2 size={12} color={tint} strokeWidth={2.4} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
  },
})
