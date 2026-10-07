import React, { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, UserRoundPlus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import AddChildSheet from './add-child-sheet'

/**
 * « Ajouter un enfant », partagé par tous les écrans Réglages (parent, prof,
 * chauffeur, direction) : le code de l'école rattache l'enfant au compte
 * ouvert, sans en créer un second.
 */
export default function AddChildSettingsGroup() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { role } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('addChild.title')}
        accessibilityHint={t('addChild.rowHint')}
      >
        <View style={[styles.rowIcon, { backgroundColor: theme.primarySurface }]}>
          <UserRoundPlus size={16} color={theme.primary} strokeWidth={2} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('addChild.title')}</Text>
          <Text style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{t('addChild.rowHint')}</Text>
        </View>
        <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>

      {/* Le parent (rôle « student ») voit l'enfant sur son accueil ; les
          autres comptes l'ouvrent depuis « Espace parent ». */}
      <AddChildSheet visible={open} onClose={() => setOpen(false)} isStaff={role !== 'student'} />
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14 },
  rowSub: { fontSize: 11.5, marginTop: 2 },
})
