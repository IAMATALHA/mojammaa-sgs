import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'

export default function ParentActivationScreen() {
  const theme = useTheme()
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
      setError('Remplissez tous les champs. Le mot de passe doit contenir au moins 8 caractères.')
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
        } catch (linkError: any) {
          setError(linkError?.message || 'Ce compte existe déjà, mais le code n’a pas pu être ajouté.')
        }
      } else setError(e?.message || 'Activation impossible. Vérifiez le code.')
    } finally { setLoading(false) }
  }

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.bg }]} keyboardShouldPersistTaps="handled"><Text style={[styles.title, { color: theme.text }]}>Activer un compte parent</Text><Text style={[styles.subtitle, { color: theme.textSoft }]}>Saisissez le code remis par l’école, puis vos propres identifiants.</Text>{error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}<TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Code d’activation" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Votre e-mail" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={40} accessibilityLabel="Téléphone (facultatif)" placeholder="Téléphone (facultatif)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Mot de passe (8 caractères minimum)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]} /><Pressable onPress={submit} disabled={loading} style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Activer mon compte</Text>}</Pressable><Pressable onPress={() => navigation.goBack()} style={styles.back}><Text style={[styles.backText, { color: theme.textSoft }]}>J’ai déjà un compte</Text></Pressable></ScrollView></KeyboardAvoidingView>
}

const styles = StyleSheet.create({ root: { flexGrow: 1, padding: 28, justifyContent: 'center' }, title: { fontSize: 26, fontWeight: '800', textAlign: 'center' }, subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 }, error: { textAlign: 'center', marginBottom: 12, lineHeight: 19 }, input: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12, fontSize: 15 }, button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' }, back: { alignItems: 'center', marginTop: 18 }, backText: { fontSize: 13, textDecorationLine: 'underline' } })
