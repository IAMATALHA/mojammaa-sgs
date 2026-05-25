/**
 * Placeholder réutilisable affiché par défaut pour chaque rôle tant que
 * les vraies tabs ne sont pas implémentées. Garantit que la navigation
 * par rôle marche bout en bout avant qu'on commence le contenu des
 * écrans (Phase 7 = prof, Phase 8 = admin, etc.).
 */
import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

interface Props {
  title:    string
  subtitle?: string
  tabKey:   string
}

export default function RolePlaceholderScreen({ title, subtitle, tabKey }: Props) {
  const { profile, role, logout } = useAuth()
  const theme  = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.header, { backgroundColor: theme.primary, paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.roleCard, { borderColor: theme.primaryBorder, backgroundColor: theme.primarySurface }]}>
          <Text style={[styles.roleLabel, { color: theme.primary }]}>RÔLE ACTIF</Text>
          <Text style={[styles.roleValue, { color: theme.text }]}>
            {role === 'admin' ? 'Administrateur' : role === 'teacher' ? 'Professeur' : 'Parent / Élève'}
          </Text>
          {profile ? (
            <Text style={[styles.roleSub, { color: theme.textSoft }]}>
              {profile.prenom} {profile.nom} · {profile.email}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.tabKey, { color: theme.textSoft }]}>Tab : {tabKey}</Text>
        <Text style={[styles.placeholder, { color: theme.text }]}>
          Cet écran est un placeholder. Le contenu réel sera implémenté dans
          la phase suivante.
        </Text>

        <TouchableOpacity
          onPress={logout}
          style={[styles.logoutBtn, { borderColor: theme.danger }]}
        >
          <Text style={[styles.logoutText, { color: theme.danger }]}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },

  body: { padding: 20 },

  roleCard: {
    borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 24,
  },
  roleLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  roleValue: { fontSize: 18, fontWeight: '700' },
  roleSub:   { fontSize: 13, marginTop: 4 },

  tabKey:      { fontSize: 12, marginBottom: 10, fontFamily: 'monospace' },
  placeholder: { fontSize: 14, lineHeight: 22, marginBottom: 32 },

  logoutBtn: {
    borderWidth: 1.5, borderRadius: 12, padding: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 14, fontWeight: '700' },
})
