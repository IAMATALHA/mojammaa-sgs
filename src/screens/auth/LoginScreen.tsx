import React, { useState } from 'react'
import {
  View, Text, TextInput, Image, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  Alert, Linking, TouchableOpacity,
} from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LockKeyhole, UserRound } from 'lucide-react-native'
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
      <View style={[styles.screen, { backgroundColor: theme.brandCream }]}>
        <LinearGradient
          colors={[theme.brandCream, '#FFF8EA', theme.paper]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.wash, styles.washTop, { backgroundColor: theme.brandYellowSoft }]} />
        <View style={[styles.wash, styles.washLeft, { backgroundColor: theme.brandOrangeSoft }]} />
        <View style={[styles.wash, styles.washRight, { backgroundColor: theme.schoolSkySoft }]} />

        <ScrollView
          contentContainerStyle={[
            styles.root,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInUp.duration(520)} style={styles.content}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.arabicLogo}
              resizeMode="contain"
            />

            <Image
              source={require('../../../mojammaa.png')}
              style={styles.calligraphy}
              resizeMode="contain"
            />

            <View style={styles.form}>
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
                  <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{error}</Text>
                </View>
              ) : null}

              <InputField
                value={email}
                onChangeText={setEmail}
                placeholder="Nom d’utilisateur"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                icon={<UserRound size={26} color={theme.brandNavy} strokeWidth={2.4} />}
                theme={theme}
              />

              <InputField
                value={password}
                onChangeText={setPassword}
                placeholder="Mot de passe"
                secureTextEntry
                icon={<LockKeyhole size={26} color={theme.brandNavy} strokeWidth={2.4} />}
                theme={theme}
              />

              <PressableScale
                onPress={submit}
                disabled={loading}
                style={[
                  styles.button,
                  {
                    backgroundColor: theme.brandNavy,
                    opacity: loading ? 0.7 : 1,
                    shadowColor: theme.brandNavy,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.buttonText, { fontFamily: theme.fonts.script }]}>Se connecter</Text>
                )}
              </PressableScale>

              <TouchableOpacity onPress={forgotPassword} style={styles.forgot}>
                <Text style={[styles.forgotText, { color: theme.textSoft, fontFamily: theme.fonts.serif }]}>
                  Mot de passe oublié?
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.childrenCrop}>
              <Image
                source={require('../../../French_mobile_app_login_page_design_for_Mojammaa.png')}
                style={styles.childrenImage}
                resizeMode="contain"
              />
            </View>

            <TouchableOpacity onPress={openPrivacy} style={styles.privacy}>
              <Text style={[styles.privacyText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                Politique de confidentialité
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

function InputField({
  value, onChangeText, placeholder, icon, theme, ...inputProps
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  icon: React.ReactNode
  theme: any
  keyboardType?: 'email-address'
  autoCapitalize?: 'none'
  autoCorrect?: boolean
  secureTextEntry?: boolean
}) {
  return (
    <View style={[styles.inputShell, { borderColor: theme.brandNavy }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.brandNavy}
        style={[styles.input, { color: theme.brandNavy, fontFamily: theme.fonts.serif }]}
        {...inputProps}
      />
      <View style={styles.inputIcon}>{icon}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    position: 'relative',
  },
  wash: {
    position: 'absolute',
    borderRadius: 999,
  },
  washTop: {
    width: 310,
    height: 128,
    top: -32,
    right: -106,
    transform: [{ rotate: '-13deg' }],
  },
  washLeft: {
    width: 238,
    height: 118,
    left: -112,
    bottom: 156,
    transform: [{ rotate: '18deg' }],
  },
  washRight: {
    width: 240,
    height: 118,
    right: -96,
    bottom: 82,
    transform: [{ rotate: '-16deg' }],
  },
  root: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  arabicLogo: {
    width: 166,
    height: 126,
    marginTop: 2,
  },
  calligraphy: {
    width: '100%',
    maxWidth: 370,
    height: 248,
    marginTop: -2,
    marginBottom: 2,
  },
  form: {
    width: '100%',
    maxWidth: 356,
    alignItems: 'center',
  },
  inputShell: {
    width: '100%',
    minHeight: 58,
    borderWidth: 1.8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 22,
    paddingEnd: 18,
    marginBottom: 13,
  },
  input: {
    flex: 1,
    fontSize: 20,
    paddingVertical: 12,
    paddingEnd: 12,
  },
  inputIcon: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    width: '100%',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    minHeight: 68,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 44,
  },
  forgot: {
    marginTop: 15,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 21,
  },
  childrenCrop: {
    width: '100%',
    height: 188,
    marginTop: 8,
    overflow: 'hidden',
    alignItems: 'center',
  },
  childrenImage: {
    width: 396,
    height: 704,
    marginTop: -515,
  },
  privacy: {
    marginTop: 4,
    alignItems: 'center',
    paddingBottom: 4,
  },
  privacyText: {
    fontSize: 11,
    textDecorationLine: 'underline',
  },
})
