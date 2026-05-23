import React, { useState } from 'react'
import {
  View, Text, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Linking, TouchableOpacity,
} from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import PressableScale from '../../components/PressableScale'

const PRIVACY_URL = 'https://mojammaa-sgs.web.app/privacy'

export default function LoginScreen() {
  const theme   = useTheme()
  const insets  = useSafeAreaInsets()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const forgotPassword = async () => {
    const target = email.trim()
    if (!target) {
      setError('Saisissez votre email puis cliquez à nouveau sur « Mot de passe oublié ».')
      return
    }
    try {
      await sendPasswordResetEmail(auth, target)
      Alert.alert(
        'Email envoyé',
        `Si un compte existe pour ${target}, un email de réinitialisation vient d'être envoyé.`,
      )
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer l'email.")
    }
  }

  const openPrivacy = () => {
    Linking.openURL(PRIVACY_URL).catch(() => {
      Alert.alert('Erreur', "Impossible d'ouvrir la politique de confidentialité.")
    })
  }

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Email et mot de passe sont requis.')
      return
    }
    setLoading(true); setError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      // Navigation se fera automatiquement via NavigationRoot quand
      // AuthContext détecte l'utilisateur connecté.
    } catch (e: any) {
      const code = e?.code || ''
      if (code === 'auth/invalid-email')        setError('Email invalide.')
      else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password')
        setError('Email ou mot de passe incorrect.')
      else if (code === 'auth/user-not-found')  setError('Aucun compte avec cet email.')
      else if (code === 'auth/too-many-requests') setError('Trop de tentatives. Réessayez plus tard.')
      else setError(e?.message || 'Erreur de connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.duration(500)} style={[styles.logoCircle, { backgroundColor: theme.primarySurface }]}>
          <Text style={[styles.logoText, { color: theme.primary, fontFamily: theme.fonts.black }]}>SGS</Text>
        </Animated.View>
        <Animated.Text entering={FadeInUp.delay(150).duration(500)} style={[styles.title, { color: theme.text, fontFamily: theme.fonts.black }]}>
          Mojammaa SGS
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(250).duration(500)} style={[styles.subtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
          Connectez-vous avec votre compte
        </Animated.Text>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.textSoft }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="vous@exemple.com"
          placeholderTextColor={theme.textSoft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
        />

        <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>Mot de passe</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={theme.textSoft}
          secureTextEntry
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
        />

        <PressableScale
          onPress={submit}
          disabled={loading}
          style={[styles.button, {
            backgroundColor: theme.primary,
            opacity:         loading ? 0.7 : 1,
            shadowColor:     theme.primary,
            shadowOpacity:   0.30,
            shadowRadius:    14,
            shadowOffset:    { width: 0, height: 6 },
            elevation:       4,
          }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { fontFamily: theme.fonts.black }]}>Se connecter</Text>
          )}
        </PressableScale>

        <TouchableOpacity onPress={forgotPassword} style={styles.forgot}>
          <Text style={[styles.forgotText, { color: theme.primary }]}>
            Mot de passe oublié ?
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openPrivacy} style={styles.privacy}>
          <Text style={[styles.privacyText, { color: theme.textSoft }]}>
            Politique de confidentialité
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 28, backgroundColor: '#F7F4ED' },
  logoCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24,
  },
  logoText: { fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  title:    { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 32 },

  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15,
  },

  errorBox: { borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, fontWeight: '600' },

  button: {
    marginTop: 28, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  forgot:     { marginTop: 20, alignItems: 'center' },
  forgotText: { fontSize: 14, fontWeight: '600' },

  privacy:     { marginTop: 28, alignItems: 'center' },
  privacyText: { fontSize: 12, textDecorationLine: 'underline' },
})
