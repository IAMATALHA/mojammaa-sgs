import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'

/**
 * Bandeau affiché quand l'abonnement temps-réel aux messages échoue
 * (ex: requête refusée par les règles Firestore sur une build dépassée).
 * Évite le faux « aucun message » silencieux.
 */
export default function MessagesErrorBanner({ messageKey = 'common.messagesLoadError' }: { messageKey?: string }) {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <View style={[styles.banner, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
      <AlertTriangle size={16} color={theme.danger} strokeWidth={2} />
      <Text style={[styles.text, { color: theme.danger }]}>{t(messageKey)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  text: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
})
