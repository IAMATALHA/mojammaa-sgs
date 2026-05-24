import React, { useState } from 'react'
import {
  View, Text, TextInput, Image, StyleSheet,
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
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    setLoading(true)
    setError('')

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (e: any) {
      const code = e?.code || ''
      if (code === 'auth/invalid-email') setError('Email invalide.')
      else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') setError('Email ou mot de passe incorrect.')
      else if (code === 'auth/user-not-found') setError('Aucun compte avec cet email.')
      else if (code === 'auth/too-many-requests') setError('Trop de tentatives. Réessayez plus tard.')
      else setError(e?.message || 'Erreur de connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.bg }]}> 
        <View style={[styles.blob, styles.blobTop, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobLeft, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobBottom, { backgroundColor: theme.violetSurface }]} />

        <ScrollView
          contentContainerStyle={[
            styles.root,
            { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(500)} style={styles.heroCard}>
            <View style={[styles.heroSurface, { backgroundColor: theme.surface, borderColor: theme.border }, theme.shadows.sm]}>
              <View style={styles.logoRow}>
                <View style={[styles.logoShell, { backgroundColor: theme.white, borderColor: theme.border }]}> 
                  <Image
                    source={require('../../../assets/logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kicker, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>Application scolaire</Text>
                  <Text style={[styles.title, { color: theme.primary, fontFamily: theme.fonts.serif }]}>Bonjour !</Text>
                  <Text style={[styles.subtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Un espace doux, moderne et rassurant pour l'école.</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(180).duration(500)} style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.sm]}>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}> 
                <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.com"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            />

            <Text style={[styles.label, { color: theme.textSoft, marginTop: 14, fontFamily: theme.fonts.medium }]}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            />

            <PressableScale
              onPress={submit}
              disabled={loading}
              style={[
                styles.button,
                {
                  backgroundColor: theme.accent,
                  opacity: loading ? 0.7 : 1,
                  shadowColor: theme.accent,
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>Se connecter</Text>
              )}
            </PressableScale>

            <TouchableOpacity onPress={forgotPassword} style={styles.forgot}>
              <Text style={[styles.forgotText, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity onPress={openPrivacy} style={styles.privacy}>
            <Text style={[styles.privacyText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Politique de confidentialité</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: 'relative',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobTop: {
    width: 170,
    height: 170,
    top: -34,
    right: -42,
  },
  blobLeft: {
    width: 92,
    height: 92,
    top: 240,
    left: -24,
  },
  blobBottom: {
    width: 150,
    height: 150,
    bottom: 40,
    right: -34,
  },
  root: {
    flexGrow: 1,
    paddingHorizontal: 22,
  },
  heroCard: {
    marginTop: 18,
  },
  heroSurface: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoShell: {
    width: 92,
    height: 92,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  logoImage: {
    width: '88%',
    height: '88%',
  },
  kicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    marginTop: 4,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  formCard: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  errorBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  forgot: {
    marginTop: 18,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 14,
  },
  privacy: {
    marginTop: 24,
    alignItems: 'center',
    paddingBottom: 8,
  },
  privacyText: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
})
