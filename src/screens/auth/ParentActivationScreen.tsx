import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import { signInParentWithPhone } from '../../services/parentAuthService'
import { formatLoginPhone, formatLoginPhoneForConfirmation, normalizeLoginPhone } from '../../utils/parentIdentity'

type RedeemRequest = { code: string; prenom: string; nom: string; email?: string; password: string; telephone: string }
type RedeemResponse = { loginEmail?: string; loginPhone?: string | null }

function callableFailure(error: unknown): { code: string; reason: string } {
  const e = error as { code?: unknown; details?: { reason?: unknown } } | null
  return {
    code: typeof e?.code === 'string' ? e.code : '',
    reason: typeof e?.details?.reason === 'string' ? e.details.reason : '',
  }
}

/**
 * Activation d'un compte parent avec le code remis par l'école. Le numéro de
 * téléphone (Maroc ou étranger) suffit pour se connecter ensuite ; l'e-mail
 * est facultatif.
 */
export default function ParentActivationScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const [code, setCode] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activate = async (typedEmail: string, phone: string | null) => {
    setLoading(true); setError('')
    try {
      const redeem = httpsCallable<RedeemRequest, RedeemResponse>(functions, 'redeemParentInvitation')
      const { data } = await redeem({
        code: code.trim(), prenom: prenom.trim(), nom: nom.trim(),
        ...(typedEmail ? { email: typedEmail } : {}),
        password, telephone: telephone.trim(),
      })
      const loginEmail = data?.loginEmail || typedEmail
      if (!loginEmail) throw new Error('redeemParentInvitation: identifiant manquant')
      await signInWithEmailAndPassword(auth, loginEmail, password)
      if (data?.loginPhone) {
        Alert.alert(
          t('parentActivation.successTitle'),
          t('parentActivation.successPhoneBody', { phone: formatLoginPhone(data.loginPhone) }),
        )
      }
    } catch (e) {
      const failure = callableFailure(e)
      if (failure.code === 'functions/already-exists') {
        // Compte déjà existant (autre enfant) : on s'y connecte puis on lui
        // ajoute ce code, par le même identifiant que celui qui a collisionné.
        try {
          if (failure.reason === 'phone' && phone) await signInParentWithPhone(phone, password)
          else if (typedEmail) await signInWithEmailAndPassword(auth, typedEmail, password)
          else throw e
          await httpsCallable(functions, 'linkParentInvitation')({ code: code.trim(), telephone: telephone.trim() })
        } catch {
          setError(t('parentActivation.linkError'))
        }
      } else if (failure.code === 'functions/invalid-argument') {
        setError(t(failure.reason === 'phone-required' ? 'parentActivation.phoneRequired'
          : failure.reason === 'invalid-phone' ? 'parentActivation.invalidPhone'
            : 'parentActivation.invalidDetails'))
      } else {
        setError(t('parentActivation.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  const submit = () => {
    setError('')
    if (!code.trim() || !prenom.trim() || !nom.trim() || password.length < 8) {
      setError(t('parentActivation.required'))
      return
    }
    const typedEmail = email.trim()
    const phone = telephone.trim() ? normalizeLoginPhone(telephone) : null
    if (!typedEmail && !telephone.trim()) { setError(t('parentActivation.phoneRequired')); return }
    if (!typedEmail && !phone) { setError(t('parentActivation.invalidPhone')); return }
    // Avec un e-mail, un numéro non reconnu reste un simple contact.
    if (!phone) { void activate(typedEmail, null); return }
    // Ce numéro devient un identifiant de connexion (et la destination d'un
    // lien de réinitialisation) : une faute de frappe, ou un « 06… » français
    // tapé sans +33 (donc lu comme marocain), se corrige ici.
    Alert.alert(
      t('parentActivation.confirmPhoneTitle'),
      t('parentActivation.confirmPhoneBody', { phone: formatLoginPhoneForConfirmation(phone) }),
      [
        { text: t('parentActivation.confirmPhoneEdit'), style: 'cancel' },
        { text: t('parentActivation.confirmPhoneOk'), onPress: () => { void activate(typedEmail, phone) } },
      ],
    )
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.bg }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>{t('parentActivation.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSoft }]}>{t('parentActivation.subtitle')}</Text>
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" accessibilityLabel={t('parentActivation.code')} placeholder={t('parentActivation.code')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <TextInput value={prenom} onChangeText={setPrenom} accessibilityLabel={t('parentActivation.firstName')} placeholder={t('parentActivation.firstName')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <TextInput value={nom} onChangeText={setNom} accessibilityLabel={t('parentActivation.lastName')} placeholder={t('parentActivation.lastName')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <TextInput value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={40} accessibilityLabel={t('parentActivation.phone')} placeholder={t('parentActivation.phone')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel={t('parentActivation.password')} placeholder={t('parentActivation.password')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" accessibilityLabel={t('parentActivation.email')} placeholder={t('parentActivation.email')} placeholderTextColor={theme.textMuted} style={inputStyle} />
        <Pressable onPress={submit} disabled={loading} accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }} style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('parentActivation.submit')}</Text>}
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={[styles.backText, { color: theme.textSoft }]}>{t('parentActivation.haveAccount')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({ root: { flexGrow: 1, padding: 28, justifyContent: 'center' }, title: { fontSize: 26, fontWeight: '800', textAlign: 'center' }, subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 }, error: { textAlign: 'center', marginBottom: 12, lineHeight: 19 }, input: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12, fontSize: 15 }, button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' }, back: { alignItems: 'center', marginTop: 18 }, backText: { fontSize: 13, textDecorationLine: 'underline' } })
