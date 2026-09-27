import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'

export default function ParentActivationScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const [code, setCode] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!code.trim() || !prenom.trim() || !nom.trim() || !email.trim() || password.length < 8) {
      setError(t('parentActivation.required'))
      return
    }
    setLoading(true); setError('')
    try {
      const redeem = httpsCallable(functions, 'redeemParentInvitation')
      await redeem({ code: code.trim(), prenom: prenom.trim(), nom: nom.trim(), email: email.trim(), password, telephone: telephone.trim() })
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (e: any) {
      const codeValue = e?.code || ''
      if (codeValue === 'functions/already-exists') {
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password)
          await httpsCallable(functions, 'linkParentInvitation')({ code: code.trim(), telephone: telephone.trim() })
        } catch {
          setError(t('parentActivation.linkError'))
        }
      } else setError(t('parentActivation.error'))
    } finally { setLoading(false) }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.bg }]} keyboardShouldPersistTaps="handled"><Text style={[styles.title, { color: theme.text }]}>{t('parentActivation.title')}</Text><Text style={[styles.subtitle, { color: theme.textSoft }]}>{t('parentActivation.subtitle')}</Text>{error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}<TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder={t('parentActivation.code')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={prenom} onChangeText={setPrenom} placeholder={t('parentActivation.firstName')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={nom} onChangeText={setNom} placeholder={t('parentActivation.lastName')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('parentActivation.email')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={40} accessibilityLabel={t('parentActivation.phone')} placeholder={t('parentActivation.phone')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder={t('parentActivation.password')} placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><Pressable onPress={submit} disabled={loading} style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('parentActivation.submit')}</Text>}</Pressable><Pressable onPress={() => navigation.goBack()} style={styles.back}><Text style={[styles.backText, { color: theme.textSoft }]}>{t('parentActivation.haveAccount')}</Text></Pressable></ScrollView></KeyboardAvoidingView>
}

const styles = StyleSheet.create({ root: { flexGrow: 1, padding: 28, justifyContent: 'center' }, title: { fontSize: 26, fontWeight: '800', textAlign: 'center' }, subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 }, error: { textAlign: 'center', marginBottom: 12, lineHeight: 19 }, input: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12, fontSize: 15 }, button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' }, back: { alignItems: 'center', marginTop: 18 }, backText: { fontSize: 13, textDecorationLine: 'underline' } })
