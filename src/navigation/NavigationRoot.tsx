/**
 * Routeur de plus haut niveau. Bascule entre AuthStack et le stack du
 * rôle détecté. Affiche un splash (spinner) pendant l'auth check initial.
 */
import React, { useState } from 'react'
import { View, ActivityIndicator, Text, StyleSheet, Pressable } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { navigationRef } from './navigationRef'
import { usePushTapNavigation } from '../hooks/usePushTapNavigation'
import AuthStack    from './AuthStack'
import StudentStack from './StudentStack'
import TeacherStack from './TeacherStack'
import AdminStack   from './AdminStack'

function Splash() {
  const theme = useTheme()
  return (
    <View style={[styles.splash, { backgroundColor: theme.bg }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.splashText, { color: theme.textSoft }]}>Chargement…</Text>
    </View>
  )
}

// Profil illisible (offline/permission) alors qu'on est authentifié : on NE
// retombe PAS sur l'espace parent par défaut (un prof/admin y verrait à tort
// l'UI parent). On propose de réessayer la lecture, ou de se déconnecter.
function ProfileErrorScreen() {
  const theme = useTheme()
  const { refresh, logout } = useAuth()
  const [retrying, setRetrying] = useState(false)

  const onRetry = async () => {
    setRetrying(true)
    try { await refresh() } finally { setRetrying(false) }
  }

  return (
    <View style={[styles.splash, { backgroundColor: theme.bg, paddingHorizontal: 32 }]}>
      <Text style={[styles.errorTitle, { color: theme.text }]}>Connexion au profil impossible</Text>
      <Text style={[styles.errorBody, { color: theme.textSoft }]}>
        Vérifiez votre connexion internet puis réessayez.
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        style={[styles.retryBtn, { backgroundColor: theme.primary, opacity: retrying ? 0.7 : 1 }]}
      >
        {retrying
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.retryText}>Réessayer</Text>}
      </Pressable>
      <Pressable onPress={logout} accessibilityRole="button" style={styles.logoutLink}>
        <Text style={[styles.logoutText, { color: theme.textSoft }]}>Se déconnecter</Text>
      </Pressable>
    </View>
  )
}

export default function NavigationRoot() {
  const { user, isLoading, role, profile, profileError } = useAuth()
  const [navReady, setNavReady] = useState(false)

  // Tap sur une notification push → écran Messages du rôle (+ détail).
  usePushTapNavigation(user ? role : null, navReady && !!user)

  if (isLoading) return <Splash />

  // Authentifié mais profil illisible (erreur, pas « parent ») : écran dédié
  // plutôt que de router vers l'espace parent par défaut (cf. AuthContext #3).
  if (user && profileError && !profile) return <ProfileErrorScreen />

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      {!user ? (
        <AuthStack />
      ) : role === 'admin' ? (
        <AdminStack />
      ) : role === 'teacher' ? (
        <TeacherStack />
      ) : (
        <StudentStack />
      )}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashText: { marginTop: 16, fontSize: 13 },
  errorTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBody: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: {
    marginTop: 24, height: 50, borderRadius: 25, alignSelf: 'stretch',
    alignItems: 'center', justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  logoutLink: { marginTop: 16, padding: 8 },
  logoutText: { fontSize: 13, textDecorationLine: 'underline' },
})
