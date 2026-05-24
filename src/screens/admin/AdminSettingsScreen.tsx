import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const APP_VERSION = '1.0.0'
const ADMIN_WEB_URL = 'https://mojammaa-admin.vercel.app'

export default function AdminSettingsScreen() {
  const theme = useTheme()
  const { profile, logout } = useAuth()

  const openWebAdmin = () => {
    Linking.openURL(ADMIN_WEB_URL).catch(() =>
      Alert.alert('Erreur', "Impossible d'ouvrir le navigateur."))
  }

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Confirmer la déconnexion ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <ScreenLayout title="Paramètres">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: theme.primary }]}>
          <View style={[styles.avatar, { backgroundColor: theme.white }]}>
            <Text style={{ color: theme.primary, fontSize: 22, fontWeight: '800' }}>
              {(profile?.prenom?.[0] || '?').toUpperCase()}{(profile?.nom?.[0] || '').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.profileName}>
            {profile ? `${profile.prenom} ${profile.nom}` : '—'}
          </Text>
          <Text style={styles.profileEmail}>{profile?.email || ''}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>ADMINISTRATEUR</Text>
          </View>
        </View>

        {/* Section: Application */}
        <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>Application</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Row label="Version" value={APP_VERSION} theme={theme} />
          <Row label="Projet Firebase" value="mojammaa-sgs" theme={theme} />
          <Row label="Plateforme" value="React Native (Expo)" theme={theme} />
        </View>

        {/* Section: Actions */}
        <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>Actions</Text>

        <TouchableOpacity
          style={[styles.actionRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={openWebAdmin}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.text }]}>Ouvrir l'app web admin</Text>
            <Text style={[styles.actionSub,   { color: theme.textSoft }]}>
              mojammaa-admin.vercel.app
            </Text>
          </View>
          <Text style={{ color: theme.primary, fontSize: 18 }}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => Alert.alert('Impersonation', "Bascule vers l'écran Utilisateurs → bouton 'Voir comme'.")}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: theme.text }]}>Mode impersonation</Text>
            <Text style={[styles.actionSub, { color: theme.textSoft }]}>
              Pas encore disponible
            </Text>
          </View>
          <Text style={{ color: theme.textSoft, fontSize: 18 }}>→</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={[styles.logoutBtn, { borderColor: theme.danger }]}
        >
          <Text style={{ color: theme.danger, fontWeight: '800' }}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenLayout>
  )
}

function Row({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvLabel, { color: theme.textSoft }]}>{label}</Text>
      <Text style={[styles.kvValue, { color: theme.text }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  profileCard: { padding: 22, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  scrollContent: { paddingBottom: 28 },
  avatar:      { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  profileEmail:{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 10 },
  roleBadge:   { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  sectionTitle:{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },
  card:        { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 16 },
  kvRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0001' },
  kvLabel:     { fontSize: 13 },
  kvValue:     { fontSize: 13, fontWeight: '600', maxWidth: '55%' },

  actionRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionSub:   { fontSize: 12, marginTop: 2 },

  logoutBtn:   { padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', marginTop: 12 },
});
