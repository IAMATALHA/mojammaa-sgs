/**
 * Routeur de plus haut niveau. Bascule entre AuthStack et le stack du
 * rôle détecté. Affiche un splash (spinner) pendant l'auth check initial.
 */
import React from 'react'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
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

export default function NavigationRoot() {
  const { user, isLoading, role } = useAuth()

  if (isLoading) return <Splash />

  return (
    <NavigationContainer>
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
})
