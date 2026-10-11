import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Mail } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AuthStackParamList } from '../../navigation/types'
import { auth, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import { INVITATION_CODE_LENGTH, invitationCodeFromText, normalizeInvitationCode, signInParentWithPhone } from '../../services/parentAuthService'
import { formatInvitationCode } from '../../services/teacherAccessService'
import PhoneNumberField from '../../components/PhoneNumberField'
import PasswordField from '../../components/PasswordField'
import { formatLoginPhone, formatLoginPhoneForConfirmation } from '../../utils/parentIdentity'
import { emptyPhoneFieldValue, phoneFieldValidity, type PhoneFieldValue } from '../../utils/phoneCountries'
import { rememberLoginMode } from '../../utils/loginPreferences'

type RedeemRequest = { code: string; prenom: string; nom: string; email?: string; password: string; telephone: string }
type RedeemResponse = { loginEmail?: string; loginPhone?: string | null }
/** Champ à corriger : il est encadré en rouge, le message s'affiche au-dessus du bouton. */
type Field = 'code' | 'name' | 'password' | 'confirm'

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
 * est facultatif, replié derrière « Ajouter un e-mail ».
 */
export default function ParentActivationScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const route = useRoute<RouteProp<AuthStackParamList, 'ParentActivation'>>()
  // Code déjà saisi sur « Activer mon compte » (reconnu comme code parent), ou
  // porté par le lien d'activation qui a ouvert cet écran. Chaque lien ouvre un
  // écran neuf (authRoutesForLink) : rien ne reste du lien précédent.
  const [code, setCode] = useState(() => route.params?.code ?? '')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [phone, setPhone] = useState<PhoneFieldValue>(() => emptyPhoneFieldValue())
  const [showPhoneErrors, setShowPhoneErrors] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [withEmail, setWithEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ key: string; field?: Field } | null>(null)

  const fail = (key: string, field?: Field) => setError({ key, field })
  const clearError = () => { if (error) setError(null) }

  const activate = async (typedEmail: string, phoneE164: string | null) => {
    setLoading(true); setError(null)
    const sentCode = normalizeInvitationCode(code)
    // Compte créé par le serveur : à partir de là, le code est consommé.
    let created = false
    try {
      const redeem = httpsCallable<RedeemRequest, RedeemResponse>(functions, 'redeemParentInvitation')
      const { data } = await redeem({
        code: sentCode, prenom: prenom.trim(), nom: nom.trim(),
        ...(typedEmail ? { email: typedEmail } : {}),
        password, telephone: phoneE164 ?? '',
      })
      created = true
      const loginEmail = data?.loginEmail || typedEmail
      if (!loginEmail) throw new Error('redeemParentInvitation: identifiant manquant')
      await signInWithEmailAndPassword(auth, loginEmail, password)
      // Les alertes ci-dessous sont natives : la connexion remplace déjà cet
      // écran par l'accueil, un message dans l'écran ne serait jamais vu.
      if (data?.loginPhone) {
        rememberLoginMode('phone', phone.iso)
        Alert.alert(
          t('parentActivation.successTitle'),
          t('parentActivation.successPhoneBody', { phone: formatLoginPhone(data.loginPhone) }),
        )
      } else if (phoneE164) {
        // Numéro confirmé mais refusé comme identifiant (déjà pris par un autre
        // compte, refusé par Auth) : le compte ne se connecte que par e-mail.
        // Le dire, sinon le parent réessaiera avec son numéro (audit 2026-09-28).
        rememberLoginMode('email')
        Alert.alert(
          t('parentActivation.successTitle'),
          t('parentActivation.successEmailOnlyBody', { email: loginEmail }),
        )
      } else {
        rememberLoginMode('email')
      }
    } catch (e) {
      if (created) {
        // Compte créé mais session non ouverte (réseau coupé…) : réessayer ici
        // répondrait « code déjà utilisé » alors que le compte existe.
        Alert.alert(
          t('parentActivation.successTitle'),
          t('parentActivation.createdNoSession'),
          [{ text: t('teacherActivation.goLogin'), onPress: () => navigation.popToTop() }],
        )
        return
      }
      const failure = callableFailure(e)
      if (failure.code === 'functions/already-exists') {
        // Sans motif : l'élève est déjà rattaché à un autre compte, il n'y a
        // aucun compte à ouvrir avec ce mot de passe.
        if (failure.reason !== 'phone' && failure.reason !== 'email') { fail('addChild.errors.alreadyLinked', 'code'); return }
        // Compte déjà existant (autre enfant) : on s'y connecte puis on lui
        // ajoute ce code, par le même identifiant que celui qui a collisionné.
        let signedIn = false
        try {
          const byPhone = failure.reason === 'phone' && !!phoneE164
          if (byPhone) await signInParentWithPhone(phoneE164, password)
          else if (typedEmail) await signInWithEmailAndPassword(auth, typedEmail, password)
          else throw e
          signedIn = true
          rememberLoginMode(byPhone ? 'phone' : 'email', byPhone ? phone.iso : undefined)
          await httpsCallable(functions, 'linkParentInvitation')({ code: sentCode, telephone: phoneE164 ?? '' })
          Alert.alert(t('parentActivation.linkedTitle'), t('parentActivation.linkedBody'))
        } catch {
          // Connecté mais rattachement échoué : cet écran a déjà disparu au
          // changement de session, seule une alerte native reste visible et
          // dit comment récupérer l'enfant manquant (audit 2026-09-28).
          if (signedIn) Alert.alert(t('parentActivation.linkErrorTitle'), t('parentActivation.linkErrorSignedIn'))
          else fail('parentActivation.existingAccount')
        }
      } else if (failure.code === 'functions/invalid-argument') {
        fail(failure.reason === 'phone-required' ? 'parentActivation.phoneRequired'
          : failure.reason === 'invalid-phone' ? 'parentActivation.invalidPhone'
            : 'parentActivation.invalidDetails')
      } else if (failure.code === 'functions/not-found') {
        // Mêmes réponses du serveur que pour « Ajouter un enfant » : mêmes messages.
        fail('addChild.errors.notFound', 'code')
      } else if (failure.code === 'functions/failed-precondition') {
        fail('addChild.errors.inactive', 'code')
      } else {
        fail('parentActivation.unavailable')
      }
    } finally {
      setLoading(false)
    }
  }

  const submit = () => {
    setError(null)
    // Un message par cas : le parent sait quel champ corriger.
    if (normalizeInvitationCode(code).length !== INVITATION_CODE_LENGTH) { fail('addChild.errors.format', 'code'); return }
    if (!prenom.trim() || !nom.trim()) { fail('parentActivation.nameRequired', 'name'); return }
    if (password.length < 8) { fail('teacherActivation.errWeakPassword', 'password'); return }
    if (password !== confirm) { fail('teacherActivation.errMismatch', 'confirm'); return }
    const typedEmail = withEmail ? email.trim() : ''
    const validity = phoneFieldValidity(phone)
    if (!typedEmail && validity.status === 'empty') {
      setShowPhoneErrors(true)
      fail('parentActivation.phoneRequired')
      return
    }
    // Numéro commencé mais incomplet ou invalide : le champ dit pourquoi.
    if (validity.status !== 'empty' && validity.status !== 'valid') {
      setShowPhoneErrors(true)
      fail('parentActivation.invalidPhone')
      return
    }
    if (validity.status !== 'valid') { void activate(typedEmail, null); return }
    const phoneE164 = validity.e164
    // Ce numéro devient un identifiant de connexion (et la destination d'un
    // lien de réinitialisation) : dernier contrôle du pays et des chiffres.
    Alert.alert(
      t('parentActivation.confirmPhoneTitle'),
      t('parentActivation.confirmPhoneBody', { phone: formatLoginPhoneForConfirmation(phoneE164) }),
      [
        { text: t('parentActivation.confirmPhoneEdit'), style: 'cancel' },
        { text: t('parentActivation.confirmPhoneOk'), onPress: () => { void activate(typedEmail, phoneE164) } },
      ],
    )
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card, fontFamily: theme.fonts.regular }]
  const invalid = (field: Field, empty = true) => (error?.field === field && empty ? { borderColor: theme.danger } : null)
  const label = (text: string) => <Text style={[styles.label, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{text}</Text>
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: theme.text }]}>{t('parentActivation.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSoft }]}>{t('parentActivation.subtitle')}</Text>
        {/* Un prof ou un parent déjà inscrit qui active ici obtient un SECOND compte
            si son numéro n'est pas celui du compte existant (incident du 2026-10-07). */}
        <Text style={[styles.hint, { color: theme.text, backgroundColor: theme.primarySurface }]}>{t('parentActivation.existingAccountHint')}</Text>
        <View style={styles.field}>
          {label(t('parentActivation.code'))}
          <TextInput
            value={code}
            onChangeText={next => { setCode(formatInvitationCode(invitationCodeFromText(next) ?? next)); clearError() }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            accessibilityLabel={t('parentActivation.code')}
            placeholder="ABC-DEFG-HIJ"
            placeholderTextColor={theme.textMuted}
            style={[inputStyle, invalid('code')]}
          />
          <Text style={[styles.help, { color: theme.textMuted, fontFamily: theme.fonts.regular }]}>{t('common.pasteCodeHelp')}</Text>
        </View>
        <View style={styles.field}>
          {label(t('parentActivation.firstName'))}
          <TextInput value={prenom} onChangeText={next => { setPrenom(next); clearError() }} autoComplete="given-name" accessibilityLabel={t('parentActivation.firstName')} style={[inputStyle, invalid('name', !prenom.trim())]} />
        </View>
        <View style={styles.field}>
          {label(t('parentActivation.lastName'))}
          <TextInput value={nom} onChangeText={next => { setNom(next); clearError() }} autoComplete="family-name" accessibilityLabel={t('parentActivation.lastName')} style={[inputStyle, invalid('name', !nom.trim())]} />
        </View>
        <PhoneNumberField
          value={phone}
          onChange={next => { setPhone(next); clearError() }}
          label={t('parentActivation.phone')}
          helper={t('parentActivation.phoneHelper')}
          showValidationError={showPhoneErrors}
          errorMessage={showPhoneErrors && !(withEmail && email.trim()) && phoneFieldValidity(phone).status === 'empty' ? t('parentActivation.phoneRequired') : undefined}
        />
        {/* Un seul réglage d'affichage : un appui sur l'œil montre les deux saisies à comparer. */}
        <PasswordField
          value={password}
          onChangeText={next => { setPassword(next); clearError() }}
          visible={showPassword}
          onToggleVisible={() => setShowPassword(shown => !shown)}
          kind="new"
          label={t('parentActivation.password')}
          invalid={error?.field === 'password'}
          style={styles.field}
        />
        <PasswordField
          value={confirm}
          onChangeText={next => { setConfirm(next); clearError() }}
          visible={showPassword}
          onToggleVisible={() => setShowPassword(shown => !shown)}
          kind="new"
          label={t('teacherActivation.confirmPassword')}
          invalid={error?.field === 'confirm'}
          style={styles.field}
        />
        {withEmail ? (
          <View style={styles.field}>
            {label(t('parentActivation.email'))}
            <TextInput value={email} onChangeText={next => { setEmail(next); clearError() }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" accessibilityLabel={t('parentActivation.email')} style={inputStyle} />
          </View>
        ) : (
          <Pressable onPress={() => setWithEmail(true)} hitSlop={8} accessibilityRole="button" style={styles.addEmail}>
            <Mail size={16} color={theme.primary} />
            <Text style={[styles.addEmailText, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{t('parentActivation.addEmail')}</Text>
          </Pressable>
        )}
        {/* Au-dessus du bouton : visible là où le parent vient d'appuyer, même formulaire défilé. */}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]} accessibilityLiveRegion="polite">
            <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{t(error.key)}</Text>
          </View>
        ) : null}
        <Pressable onPress={submit} disabled={loading} accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }} style={[styles.button, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('parentActivation.submit')}</Text>}
        </Pressable>
        <Pressable onPress={() => navigation.popToTop()} style={styles.back}>
          <Text style={[styles.backText, { color: theme.textSoft }]}>{t('parentActivation.haveAccount')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 28, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  hint: { fontSize: 13, lineHeight: 19, textAlign: 'center', padding: 12, borderRadius: 12, overflow: 'hidden', marginTop: -10, marginBottom: 20 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, marginStart: 4 },
  input: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 15 },
  help: { fontSize: 12, lineHeight: 17, marginTop: 6, marginStart: 6 },
  addEmail: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 40, marginBottom: 8 },
  addEmailText: { fontSize: 14, textDecorationLine: 'underline' },
  errorBox: { borderRadius: 14, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  back: { alignItems: 'center', marginTop: 18 },
  backText: { fontSize: 13, textDecorationLine: 'underline' },
})
