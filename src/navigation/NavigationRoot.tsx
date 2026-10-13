/**
 * Routeur de plus haut niveau. Bascule entre AuthStack et le stack du
 * rôle détecté. Affiche un splash (spinner) pendant l'auth check initial.
 */
import React, { useState } from 'react'
import { View, ActivityIndicator, Text, StyleSheet, Pressable } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/driver-workspace-context'
import { useTheme } from '../contexts/ThemeContext'
import { navigationRef } from './navigationRef'
import { usePushTapNavigation } from '../hooks/usePushTapNavigation'
import { useActivationLink } from '../hooks/use-activation-link'
import AddChildSheet from '../components/add-child-sheet'
import AuthStack    from './AuthStack'
import StudentStack from './StudentStack'
import TeacherStack from './TeacherStack'
import AdminStack   from './AdminStack'
import StaffStack from './StaffStack'
import { hasRight } from '../utils/staff-rights'
import DriverStack  from './driver-stack'

function Splash() {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <View style={[styles.splash, { backgroundColor: theme.bg }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.splashText, { color: theme.textSoft }]}>{t('common.loading')}</Text>
    </View>
  )
}

// Profil illisible (offline/permission) alors qu'on est authentifié : on NE
// retombe PAS sur l'espace parent par défaut (un prof/admin y verrait à tort
// l'UI parent). On propose de réessayer la lecture, ou de se déconnecter.
function ProfileErrorScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { refresh, logout } = useAuth()
  const [retrying, setRetrying] = useState(false)

  const onRetry = async () => {
    setRetrying(true)
    try { await refresh() } finally { setRetrying(false) }
  }

  return (
    <View style={[styles.splash, { backgroundColor: theme.bg, paddingHorizontal: 32 }]}>
      <Text style={[styles.errorTitle, { color: theme.text }]}>{t('common.profileErrorTitle')}</Text>
      <Text style={[styles.errorBody, { color: theme.textSoft }]}>
        {t('common.profileErrorBody')}
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        style={[styles.retryBtn, { backgroundColor: theme.primary, opacity: retrying ? 0.7 : 1 }]}
      >
        {retrying
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.retryText}>{t('common.retry')}</Text>}
      </Pressable>
      <Pressable onPress={logout} accessibilityRole="button" style={styles.logoutLink}>
        <Text style={[styles.logoutText, { color: theme.textSoft }]}>{t('common.logout')}</Text>
      </Pressable>
    </View>
  )
}

function DriverAccessScreen({ readError }: { readError: boolean }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const { retryDriverProfile } = useWorkspace()
  return (
    <View style={[styles.splash, { backgroundColor: theme.bg, paddingHorizontal: 32 }]}>
      <Text style={[styles.errorTitle, { color: theme.text }]}>{t('common.driverUnavailableTitle')}</Text>
      <Text style={[styles.errorBody, { color: theme.textSoft }]}>
        {readError
          ? t('common.driverUnavailableReadError')
          : t('common.driverUnavailableNotActivated')}
      </Text>
      <Pressable
        onPress={retryDriverProfile}
        accessibilityRole="button"
        style={[styles.retryBtn, { backgroundColor: theme.primary }]}
      >
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
      <Pressable onPress={logout} accessibilityRole="button" style={styles.logoutLink}>
        <Text style={[styles.logoutText, { color: theme.textSoft }]}>{t('common.logout')}</Text>
      </Pressable>
    </View>
  )
}

export default function NavigationRoot() {
  const { user, isLoading, role, profile, profileError, logout } = useAuth()
  const {
    activeWorkspace,
    canUseDriverWorkspace,
    canUseParentWorkspace,
    openParentWorkspace,
    isLoading: driverProfileLoading,
    error: driverProfileError,
  } = useWorkspace()
  const [navReady, setNavReady] = useState(false)

  // Tap push → message ciblé, ou écran Smart Pickup/transport côté parent.
  // L'espace chauffeur n'a pas de boîte Messages ; un compte hybride conserve
  // l'intention en attente jusqu'au retour dans son espace parent.
  usePushTapNavigation(
    user && activeWorkspace === 'parent'
      ? 'student'
      : user && role !== 'driver' && activeWorkspace === 'primary'
        ? role === 'staff' && !hasRight(profile || undefined, 'messages.boite') ? null : role
        : null,
    navReady && !!user && (activeWorkspace === 'parent'
      || (role !== 'driver' && activeWorkspace === 'primary')),
    {
      canOpenParentWorkspace: canUseParentWorkspace,
      openParentWorkspace,
    },
  )

  // Lien d'activation touché dans WhatsApp : écran d'activation si déconnecté,
  // « Ajouter un enfant » prérempli si un compte est déjà ouvert.
  const activationLink = useActivationLink({ signedIn: !!user, ready: navReady && !isLoading, logout })

  if (isLoading) return <Splash />

  if (user && role === 'driver' && driverProfileLoading) return <Splash />

  // Authentifié mais profil illisible (erreur, pas « parent ») : écran dédié
  // plutôt que de router vers l'espace parent par défaut (cf. AuthContext #3).
  if (user && profileError && !profile) return <ProfileErrorScreen />

  // Un chauffeur sans profil actif reste bloqué, sauf si son accès parent est
  // prouvé indépendamment par un enfant lié à son propre UID.
  if (
    user
    && role === 'driver'
    && !canUseDriverWorkspace
    && activeWorkspace !== 'parent'
  ) {
    return <DriverAccessScreen readError={Boolean(driverProfileError)} />
  }

  return (
    <>
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      {!user ? (
        <AuthStack />
      ) : activeWorkspace === 'driver' ? (
        <DriverStack />
      ) : activeWorkspace === 'parent' ? (
        <StudentStack />
      ) : role === 'staff' ? (
        <StaffStack key={`${profile?.uid}:${JSON.stringify(profile?.droits || [])}`} />
      ) : role === 'admin' ? (
        <AdminStack />
      ) : role === 'teacher' ? (
        <TeacherStack />
      ) : (
        <StudentStack />
      )}
    </NavigationContainer>
    {user && activationLink.child ? (
      // `key` : une feuille neuve à chaque lien, même sans code.
      <AddChildSheet
        key={activationLink.child.at}
        visible={activationLink.childOpen}
        initialCode={activationLink.child.code}
        onClose={activationLink.dismissChild}
        isStaff={role !== 'student'}
      />
    ) : null}
    </>
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
