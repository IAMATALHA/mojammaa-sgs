import React, { useState } from 'react'
import {
  View, Text, TextInput, Image, StyleSheet, useWindowDimensions,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Linking, TouchableOpacity, Pressable,
} from 'react-native'
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { Globe, User, Lock } from 'lucide-react-native'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import LanguagePicker from '../../components/LanguagePicker'

const PRIVACY_URL = 'https://mojammaa-sgs.web.app/privacy'

export default function LoginScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [langOpen, setLangOpen] = useState(false)

  const forgotPassword = async () => {
    const target = email.trim()
    if (!target) {
      setError(t('login.forgotPrompt'))
      return
    }
    try {
      const sendBrandedPasswordReset = httpsCallable(functions, 'sendBrandedPasswordReset')
      await sendBrandedPasswordReset({ email: target })
      Alert.alert(
        t('login.resetSent'),
        t('login.resetSentBody', { email: target }),
      )
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || "Impossible d'envoyer l'email.")
    }
  }

  const openPrivacy = () => {
    Linking.openURL(PRIVACY_URL).catch(() => {
      Alert.alert(t('common.error'), "Impossible d'ouvrir la politique de confidentialité.")
    })
  }

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t('login.errorRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (e: any) {
      const code = e?.code || ''
      if (code === 'auth/invalid-email') setError(t('login.errorInvalidEmail'))
      // 'auth/invalid-credential' couvre désormais mauvais mot de passe ET
      // compte inexistant (protection anti-énumération de Firebase). On NE
      // distingue pas le cas « compte introuvable » pour ne pas révéler
      // l'existence d'un compte.
      else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') setError(t('login.errorWrongPassword'))
      else if (code === 'auth/too-many-requests') setError(t('login.errorTooMany'))
      else setError(e?.message || t('login.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        {/* Watercolor blobs */}
        <View style={[styles.blob, styles.blobTopRight, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobTopLeft, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobMidRight, { backgroundColor: theme.violetSurface }]} />
        <View style={[styles.blob, styles.blobBottomLeft, { backgroundColor: theme.accentSurface }]} />
        <View style={[styles.blob, styles.blobBottomCenter, { backgroundColor: theme.greenSurface }]} />

        {/* Language globe — top right */}
        <Pressable
          onPress={() => setLangOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.changeLanguage')}
          style={[
            styles.langGlobe,
            { top: insets.top + 12, backgroundColor: theme.card, borderColor: theme.border },
            theme.shadows.xs,
          ]}
        >
          <Globe size={20} color={theme.textSoft} strokeWidth={1.5} />
        </Pressable>

        <ScrollView
          contentContainerStyle={[
            styles.root,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 30 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Arabic school logo ─────────────────────────────── */}
          <Animated.View entering={FadeInUp.duration(600).delay(100)} style={styles.logoSection}>
            <Image
              source={require('../../../assets/logo.png')}
              style={[styles.arabicLogo, { width: screenWidth * 0.42, height: screenWidth * 0.42 }]}
              resizeMode="contain"
              accessible={false}
              importantForAccessibility="no"
            />
          </Animated.View>

          {/* ── Ornate calligraphy ─────────────────────────────── */}
          <Animated.View entering={FadeInUp.duration(700).delay(200)} style={styles.calligraphySection}>
            <Text style={[styles.calligraphyMain, { color: theme.primary }]} numberOfLines={2} adjustsFontSizeToFit>
              Mojammaa{'\n'}Al Maarifa
            </Text>
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: 500, delay: 500 }}
            >
              <Text style={[styles.calligraphySub, { color: theme.accent }]}>
                {t('login.connexion')}
              </Text>
            </MotiView>
          </Animated.View>

          {/* ── Login form ─────────────────────────────────────── */}
          <Animated.View entering={FadeInUp.duration(600).delay(400)} style={styles.formSection}>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
                <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{error}</Text>
              </View>
            ) : null}

            {/* Email input with icon */}
            <View style={[styles.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                accessibilityLabel={t('login.email')}
                placeholder={t('login.email')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { color: theme.text, fontFamily: theme.fonts.regular }]}
              />
              <View style={styles.inputIcon}>
                <User size={18} color={theme.textMuted} strokeWidth={1.75} />
              </View>
            </View>

            {/* Password input with icon */}
            <View style={[styles.inputWrap, { marginTop: 12, backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                accessibilityLabel={t('login.password')}
                placeholder={t('login.password')}
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                style={[styles.input, { color: theme.text, fontFamily: theme.fonts.regular }]}
              />
              <View style={styles.inputIcon}>
                <Lock size={18} color={theme.textMuted} strokeWidth={1.75} />
              </View>
            </View>

            {/* Submit button — rouge de marque */}
            <Pressable
              onPress={submit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t('login.submit')}
              accessibilityState={{ disabled: loading, busy: loading }}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: theme.primary,
                  opacity: loading ? 0.7 : pressed ? 0.92 : 1,
                },
                theme.shadows.md,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>
                  {t('login.submit')}
                </Text>
              )}
            </Pressable>

            {/* Forgot password */}
            <TouchableOpacity onPress={forgotPassword} style={styles.forgot}>
              <Text style={[styles.forgotText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
                {t('login.forgotPassword')}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Decorative ornament ────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).delay(600)} style={styles.ornamentSection}>
            <View style={styles.ornamentLine}>
              <View style={[styles.ornamentDash, { backgroundColor: theme.borderStrong }]} />
              <View style={[styles.ornamentDot, { backgroundColor: theme.accent }]} />
              <View style={[styles.ornamentDotSm, { backgroundColor: theme.success }]} />
              <View style={[styles.ornamentDot, { backgroundColor: theme.primary }]} />
              <View style={[styles.ornamentDash, { backgroundColor: theme.borderStrong }]} />
            </View>
          </Animated.View>

          {/* ── Bottom links ───────────────────────────────────── */}
          <View style={styles.bottomLinks}>
            <TouchableOpacity onPress={openPrivacy}>
              <Text style={[styles.privacyText, { color: theme.textMuted, fontFamily: theme.fonts.regular }]}>
                {t('login.privacy')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <LanguagePicker visible={langOpen} onClose={() => setLangOpen(false)} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Watercolor blobs — soft, overlapping circles
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobTopRight: {
    width: 200,
    height: 200,
    top: -50,
    right: -60,
  },
  blobTopLeft: {
    width: 140,
    height: 140,
    top: 30,
    left: -50,
  },
  blobMidRight: {
    width: 100,
    height: 100,
    top: '45%',
    right: -30,
  },
  blobBottomLeft: {
    width: 180,
    height: 180,
    bottom: 60,
    left: -60,
  },
  blobBottomCenter: {
    width: 160,
    height: 160,
    bottom: -40,
    right: 30,
  },

  // Language globe
  langGlobe: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  root: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
  },

  // Arabic logo
  logoSection: {
    alignItems: 'center',
    marginTop: 8,
  },
  arabicLogo: {
    maxWidth: 220,
    maxHeight: 220,
  },

  // Calligraphy
  calligraphySection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  calligraphyMain: {
    fontFamily: 'GreatVibes_400Regular',
    fontSize: 48,
    lineHeight: 58,
    textAlign: 'center',
    letterSpacing: 1,
    alignSelf: 'stretch',   // borne la largeur → permet à adjustsFontSizeToFit d'agir
    paddingHorizontal: 12,
  },
  calligraphySub: {
    fontFamily: 'GreatVibes_400Regular',
    fontSize: 28,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.75,
  },

  // Form
  formSection: {
    width: '100%',
    marginTop: 20,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    height: 54,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputIcon: {
    marginLeft: 8,
  },
  errorBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  button: {
    marginTop: 22,
    height: 54,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  forgot: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 13,
  },

  // Ornament
  ornamentSection: {
    marginTop: 28,
    alignItems: 'center',
  },
  ornamentLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ornamentDash: {
    width: 36,
    height: 1.5,
    borderRadius: 1,
  },
  ornamentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ornamentDotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Bottom
  bottomLinks: {
    marginTop: 16,
    alignItems: 'center',
  },
  privacyText: {
    fontSize: 11,
    textDecorationLine: 'underline',
  },
})
