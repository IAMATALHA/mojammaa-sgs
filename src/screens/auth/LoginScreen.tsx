import React, { useState } from 'react'
import {
  View, Text, TextInput, Image, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Linking, TouchableOpacity,
} from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
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
        <LinearGradient
          colors={[theme.brandCream, theme.paper, '#FFF8EC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.watermark}
          resizeMode="contain"
        />
        <View style={[styles.wash, styles.washGold, { backgroundColor: theme.brandYellowSoft }]} />
        <View style={[styles.wash, styles.washCoral, { backgroundColor: theme.brandCoralSoft }]} />
        <View style={[styles.wash, styles.washMint, { backgroundColor: theme.schoolMintSoft }]} />

        <ScrollView
          contentContainerStyle={[
            styles.root,
            { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeInUp.duration(500)}
            style={[
              styles.authPanel,
              {
                backgroundColor: 'rgba(255,255,255,0.64)',
                borderColor: 'rgba(29, 53, 87, 0.10)',
                shadowColor: theme.brandNavy,
              },
              theme.shadows.sm,
            ]}
          >
            <View style={styles.identity}>
              <View style={[styles.logoHalo, { backgroundColor: theme.white, borderColor: 'rgba(252, 191, 73, 0.42)' }]}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.brandName, { color: theme.brandNavy, fontFamily: theme.fonts.script }]}>
                Mojammaa Al Maarifa
              </Text>
              <Text style={[styles.brandArabic, { color: theme.textSoft, fontFamily: theme.fonts.arabicSemi }]}>
                مجمع المعرفة الخصوصية
              </Text>
              <View style={[styles.goldRule, { backgroundColor: theme.brandYellow }]} />
            </View>

            <View style={styles.formArea}>
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
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: 'rgba(255,255,255,0.74)' }]}
              />

              <Text style={[styles.label, { color: theme.textSoft, marginTop: 14, fontFamily: theme.fonts.medium }]}>Mot de passe</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: 'rgba(255,255,255,0.74)' }]}
              />

              <PressableScale
                onPress={submit}
                disabled={loading}
                style={[
                  styles.button,
                  {
                    backgroundColor: theme.brandNavy,
                    opacity: loading ? 0.7 : 1,
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
                <Text style={[styles.forgotText, { color: theme.brandNavy, fontFamily: theme.fonts.semibold }]}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            </View>
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
  watermark: {
    position: 'absolute',
    width: 240,
    height: 240,
    alignSelf: 'center',
    top: 78,
    opacity: 0.045,
  },
  wash: {
    position: 'absolute',
    borderRadius: 999,
  },
  washGold: {
    width: 280,
    height: 126,
    top: -36,
    right: -84,
    transform: [{ rotate: '-14deg' }],
  },
  washCoral: {
    width: 210,
    height: 104,
    top: 248,
    left: -86,
    transform: [{ rotate: '16deg' }],
  },
  washMint: {
    width: 260,
    height: 118,
    bottom: 40,
    right: -104,
    transform: [{ rotate: '-13deg' }],
  },
  root: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  authPanel: {
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  identity: {
    alignItems: 'center',
  },
  logoHalo: {
    width: 122,
    height: 122,
    borderRadius: 61,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 26,
  },
  brandName: {
    fontSize: 34,
    lineHeight: 40,
    marginTop: 12,
  },
  brandArabic: {
    fontSize: 13,
    writingDirection: 'rtl',
    marginTop: -2,
  },
  goldRule: {
    width: 64,
    height: 3,
    borderRadius: 2,
    marginTop: 13,
  },
  formArea: {
    marginTop: 24,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 15,
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
    borderRadius: 18,
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
