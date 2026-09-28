import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, Image, StyleSheet, useWindowDimensions,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Linking, TouchableOpacity, Pressable, I18nManager,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Globe, Lock, Mail, Smartphone } from 'lucide-react-native'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import LanguagePicker from '../../components/LanguagePicker'
import PhoneNumberField from '../../components/PhoneNumberField'
import { signInParentWithPhone } from '../../services/parentAuthService'
import { classifyParentLoginError, isEmailIdentifier, normalizeLoginPhone } from '../../utils/parentIdentity'
import {
  OTHER_COUNTRY_ISO, emptyPhoneFieldValue, findPhoneCountry, phoneFieldValidity, type PhoneFieldValue,
} from '../../utils/phoneCountries'

const PRIVACY_URL = 'https://mojammaa-sgs.web.app/privacy'

// Mode et pays mémorisés : les parents retrouvent « Téléphone » et leur pays,
// le personnel « E-mail », sans rien rechoisir.
type LoginMode = 'phone' | 'email'
const LOGIN_MODE_KEY = '@mojammaa/login/mode'
const LOGIN_COUNTRY_KEY = '@mojammaa/login/phoneCountry'
const LOGIN_MODES: LoginMode[] = ['phone', 'email']

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const [mode, setMode] = useState<LoginMode>('phone')
  const [phone, setPhone] = useState<PhoneFieldValue>(() => emptyPhoneFieldValue())
  const [showPhoneErrors, setShowPhoneErrors] = useState(false)
  // Mode e-mail (un numéro tapé ici reste accepté, par compatibilité).
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [langOpen, setLangOpen] = useState(false)
  const [segmentWidth, setSegmentWidth] = useState(0)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.multiGet([LOGIN_MODE_KEY, LOGIN_COUNTRY_KEY]).then(entries => {
      if (cancelled) return
      const saved = Object.fromEntries(entries)
      const savedMode = saved[LOGIN_MODE_KEY]
      if (savedMode === 'phone' || savedMode === 'email') setMode(savedMode)
      const iso = saved[LOGIN_COUNTRY_KEY]
      if (iso && (iso === OTHER_COUNTRY_ISO || findPhoneCountry(iso))) {
        setPhone(current => (current.raw ? current : emptyPhoneFieldValue(iso)))
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const switchMode = (next: LoginMode) => {
    if (next === mode) return
    setMode(next)
    setError('')
    setShowPhoneErrors(false)
    Haptics.selectionAsync().catch(() => {})
    AsyncStorage.setItem(LOGIN_MODE_KEY, next).catch(() => {})
  }

  const forgotPassword = async () => {
    // Pas d'e-mail derrière un numéro : c'est l'école qui envoie le lien de
    // réinitialisation par WhatsApp (page Comptes du site d'administration).
    if (mode === 'phone') {
      Alert.alert(t('login.phoneResetTitle'), t('login.phoneResetBody'))
      return
    }
    const target = identifier.trim()
    if (!target) {
      setError(t('login.forgotPrompt'))
      return
    }
    // Pas d'e-mail derrière un numéro : c'est l'école qui envoie le lien de
    // réinitialisation par WhatsApp (page Comptes du site d'administration).
    if (!isEmailIdentifier(target)) {
      Alert.alert(t('login.phoneResetTitle'), t('login.phoneResetBody'))
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

  const submitWithPhone = async (phoneE164: string, rememberIso?: string) => {
    setLoading(true)
    setError('')
    try {
      await signInParentWithPhone(phoneE164, password)
      if (rememberIso) AsyncStorage.setItem(LOGIN_COUNTRY_KEY, rememberIso).catch(() => {})
    } catch (e) {
      const failure = classifyParentLoginError(e)
      if (failure === 'invalid-phone') setError(t('login.errorInvalidPhone'))
      else if (failure === 'wrong-credentials') setError(t('login.errorWrongPassword'))
      else if (failure === 'rate-limited') setError(t('login.errorTooMany'))
      else setError(t('login.errorUnavailable'))
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (mode === 'phone') {
      const validity = phoneFieldValidity(phone)
      if (validity.status !== 'valid') {
        // Le champ affiche lui-même pourquoi le numéro n'est pas accepté.
        setShowPhoneErrors(true)
        setError(validity.status === 'empty' ? t('login.errorRequired') : '')
        return
      }
      if (!password) {
        setError(t('login.errorRequired'))
        return
      }
      await submitWithPhone(validity.e164, phone.iso)
      return
    }

    const target = identifier.trim()
    if (!target || !password) {
      setError(t('login.errorRequired'))
      return
    }
    if (!isEmailIdentifier(target)) {
      const phoneE164 = normalizeLoginPhone(target)
      if (!phoneE164) {
        setError(t('login.errorInvalidPhone'))
        return
      }
      await submitWithPhone(phoneE164)
      return
    }

    setLoading(true)
    setError('')

    try {
      await signInWithEmailAndPassword(auth, target, password)
      // Le journal des sessions n'est PAS appelé ici : AuthContext le fait au
      // chargement du profil, ce qui couvre à la fois ce login et les reprises
      // de session. Deux points d'appel écriraient dans la même entrée.
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

            {/* Téléphone | E-mail — pastille coulissante */}
            <View
              accessibilityRole="tablist"
              onLayout={e => setSegmentWidth(e.nativeEvent.layout.width)}
              style={[styles.segment, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
              {segmentWidth > 0 ? (
                <MotiView
                  animate={{ translateX: (mode === 'email' ? 1 : 0) * ((segmentWidth - 8) / 2) * (I18nManager.isRTL ? -1 : 1) }}
                  transition={{ type: 'spring', damping: 18, stiffness: 220 }}
                  style={[styles.segmentThumb, { width: (segmentWidth - 8) / 2, backgroundColor: theme.card }, theme.shadows.xs]}
                />
              ) : null}
              {LOGIN_MODES.map(item => {
                const active = mode === item
                const Icon = item === 'phone' ? Smartphone : Mail
                return (
                  <Pressable
                    key={item}
                    onPress={() => switchMode(item)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={styles.segmentItem}
                  >
                    <Icon size={16} color={active ? theme.primary : theme.textMuted} strokeWidth={2} />
                    <Text style={{ fontSize: 14, color: active ? theme.text : theme.textSoft, fontFamily: active ? theme.fonts.semibold : theme.fonts.medium }}>
                      {t(item === 'phone' ? 'login.modePhone' : 'login.modeEmail')}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {mode === 'phone' ? (
              <PhoneNumberField
                value={phone}
                onChange={next => { setPhone(next); if (error) setError('') }}
                shape="pill"
                showValidationError={showPhoneErrors}
                returnKeyType="next"
              />
            ) : (
              <View style={[styles.inputWrap, { marginBottom: 12, backgroundColor: theme.card, borderColor: theme.border }]}>
                <TextInput
                  value={identifier}
                  onChangeText={setIdentifier}
                  accessibilityLabel={t('login.email')}
                  placeholder={t('login.email')}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="username"
                  keyboardType="email-address"
                  style={[styles.input, { color: theme.text, fontFamily: theme.fonts.regular }]}
                />
                <View style={styles.inputIcon}>
                  <Mail size={18} color={theme.textMuted} strokeWidth={1.75} />
                </View>
              </View>
            )}

            {/* Password input with icon */}
            <View style={[styles.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
            <TouchableOpacity onPress={() => navigation.navigate('ParentActivation')} style={styles.forgot}>
              <Text style={[styles.forgotText, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{t('parentActivation.title')}</Text>
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
  segment: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    marginBottom: 16,
  },
  segmentThumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    start: 4,
    borderRadius: 24,
  },
  segmentItem: {
    flex: 1,
    height: 42,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
