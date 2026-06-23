import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, ExternalLink, ChevronRight } from 'lucide-react-native';
import Constants from 'expo-constants';
import ScreenLayout from '../../components/ScreenLayout';
import LanguagePicker from '../../components/LanguagePicker';
import { useTheme, type Theme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const APP_VERSION = Constants.expoConfig?.version ?? '—'
const ADMIN_WEB_URL = 'https://mojammaa-admin.vercel.app'

export default function AdminSettingsScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const { profile, logout } = useAuth()
  const [langOpen, setLangOpen] = useState(false)

  const langLabel = i18n.language === 'ar' ? 'العربية' : i18n.language === 'en' ? 'English' : 'Français'

  const fullName = profile ? `${profile.prenom} ${profile.nom}`.trim() : '—'
  const initials = profile
    ? `${profile.prenom?.[0] ?? ''}${profile.nom?.[0] ?? ''}`.toUpperCase() || '—'
    : '—'

  const openWebAdmin = () => {
    Linking.openURL(ADMIN_WEB_URL).catch(() =>
      Alert.alert(t('common.error'), "Impossible d'ouvrir le navigateur."))
  }

  const handleLogout = () => {
    Alert.alert(t('common.logoutTitle'), t('common.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <ScreenLayout title={t('tabs.settings')}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profil */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <View style={[styles.row, styles.rowLast]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.white, fontFamily: theme.fonts.bold, fontSize: 15 }}>{initials}</Text>
            </View>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15 }]}>{fullName}</Text>
              <Text numberOfLines={1} style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
                {profile?.email || ''} · {t('admin.administrator')}
              </Text>
            </View>
          </View>
        </View>

        {/* Langue + outils admin */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => setLangOpen(true)}>
            <RowIcon bg={theme.primarySurface}><Globe size={16} color={theme.primary} strokeWidth={2} /></RowIcon>
            <Text style={[styles.rowTitle, { flex: 1, color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('common.language')}</Text>
            <Text style={[styles.rowValue, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{langLabel}</Text>
            <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={openWebAdmin}>
            <RowIcon bg={theme.accentSurface}><ExternalLink size={16} color={theme.accent} strokeWidth={2} /></RowIcon>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('admin.openWebAdmin')}</Text>
              <Text style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>mojammaa-admin.vercel.app</Text>
            </View>
            <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Application */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={[styles.rowTitle, { flex: 1, color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('admin.version')}</Text>
            <Text style={[styles.rowValue, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{APP_VERSION}</Text>
          </View>
        </View>

        {/* Déconnexion */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <TouchableOpacity style={[styles.row, styles.rowLast, { justifyContent: 'center' }]} onPress={handleLogout}>
            <Text style={{ color: theme.danger, fontFamily: theme.fonts.bold, fontSize: 14 }}>{t('common.logout')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
          Mojammaa Al Maarifa · v{APP_VERSION}
        </Text>
      </ScrollView>

      <LanguagePicker visible={langOpen} onClose={() => setLangOpen(false)} />
    </ScreenLayout>
  )
}

function RowIcon({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <View style={[styles.rowIcon, { backgroundColor: bg }]}>{children}</View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 14 },
  rowSub:   { fontSize: 11.5, marginTop: 2 },
  rowValue: { fontSize: 13 },
  footer: { textAlign: 'center', fontSize: 10.5, letterSpacing: 0.4, marginTop: 10 },
});
