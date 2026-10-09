import React, { useState } from 'react'
import {
  ActivityIndicator, Alert, I18nManager, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ArrowLeft, Eye, EyeOff, GraduationCap, KeyRound, Mail, Smartphone } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AuthStackParamList } from '../../navigation/types'
import { useTheme } from '../../contexts/ThemeContext'
import PhoneNumberField from '../../components/PhoneNumberField'
import {
  TeacherAccessFailure, activateTeacher, formatInvitationCode, previewActivationCode, signInAndLinkTeacher,
  teacherAccessReason, type TeacherAccessReason,
} from '../../services/teacherAccessService'
import { INVITATION_CODE_LENGTH, normalizeInvitationCode } from '../../services/parentAuthService'
import { formatLoginPhone } from '../../utils/parentIdentity'
import { emptyPhoneFieldValue, phoneFieldValidity, type PhoneFieldValue } from '../../utils/phoneCountries'
import { rememberLoginMode } from '../../utils/loginPreferences'

type Step = 'code' | 'activate' | 'link' | 'activated-no-session'
type ErrorKey = TeacherAccessReason | 'mismatch' | 'required'

const ERROR_KEY: Record<ErrorKey, string> = {
  'invalid-code': 'teacherActivation.errInvalidCode',
  'expired': 'teacherActivation.errExpired',
  'used': 'teacherActivation.errUsed',
  'revoked': 'teacherActivation.errRevoked',
  'busy': 'teacherActivation.errBusy',
  'account-active': 'teacherActivation.errAccountActive',
  'account-unavailable': 'teacherActivation.errAccountUnavailable',
  'wrong-account': 'teacherActivation.errWrongAccount',
  'phone-unavailable': 'teacherActivation.errPhoneUnavailable',
  'too-many-attempts': 'teacherActivation.errTooMany',
  'parent-invitation': 'teacherActivation.errGeneric',
  'invalid-phone': 'teacherActivation.errInvalidPhone',
  'weak-password': 'teacherActivation.errWeakPassword',
  'signin': 'teacherActivation.errSignin',
  'generic': 'teacherActivation.errGeneric',
  'mismatch': 'teacherActivation.errMismatch',
  'required': 'teacherActivation.errRequired',
}

/**
 * « Première connexion ? Activer mon compte » : le code remis par l'école
 * décide du parcours (validé par le serveur). Professeur : numéro + mot de
 * passe choisi, sans e-mail à connaître ; compte déjà actif : connexion
 * habituelle puis rattachement, mot de passe inchangé ; code parent : écran
 * d'activation parent, code prérempli.
 *
 * Aucun lien vers l'application n'est configuré : un lien d'invitation ouvre
 * le site (mojammaa.com/activer), et ici le code se saisit à la main.
 */
export default function AccountActivationScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const [step, setStep] = useState<Step>('code')
  const [addsTeacherRole, setAddsTeacherRole] = useState(false)
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState<PhoneFieldValue>(() => emptyPhoneFieldValue())
  const [showPhoneErrors, setShowPhoneErrors] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [withEmail, setWithEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [activatedPhone, setActivatedPhone] = useState('')

  const fail = (reason: ErrorKey) => {
    setError(reason)
    if (reason === 'invalid-phone') setShowPhoneErrors(true)
  }

  const checkCode = async () => {
    setError(null)
    if (normalizeInvitationCode(code).length !== INVITATION_CODE_LENGTH) { fail('invalid-code'); return }
    setWorking(true)
    try {
      const preview = await previewActivationCode(code)
      if (preview.kind === 'parent') {
        navigation.replace('ParentActivation', { code: formatInvitationCode(code) })
        return
      }
      setAddsTeacherRole(preview.addsTeacherRole)
      // Professeur déjà actif : il se connecte d'habitude avec son e-mail ;
      // parent : avec son numéro, celui de l'invitation.
      setWithEmail(preview.mode === 'link' && !preview.addsTeacherRole)
      setStep(preview.mode === 'activation' ? 'activate' : 'link')
    } catch (failure) {
      fail(teacherAccessReason(failure))
    } finally {
      setWorking(false)
    }
  }

  const validPhone = (): string | null => {
    const validity = phoneFieldValidity(phone)
    if (validity.status === 'valid') return validity.e164
    fail('invalid-phone')
    return null
  }

  const activate = async () => {
    setError(null)
    const phoneE164 = validPhone()
    if (!phoneE164) return
    if (password.length < 8) { fail('weak-password'); return }
    if (password !== confirm) { fail('mismatch'); return }
    setWorking(true)
    try {
      const { signedIn } = await activateTeacher(code, phoneE164, password)
      rememberLoginMode('phone', phone.iso)
      if (signedIn) {
        // La session remplace déjà cet écran par l'espace professeur : seule
        // une alerte native reste visible.
        Alert.alert(t('teacherActivation.doneTitle'), t('teacherActivation.doneBody', { phone: formatLoginPhone(phoneE164) }))
        return
      }
      setActivatedPhone(phoneE164)
      setStep('activated-no-session')
    } catch (failure) {
      const reason = failure instanceof TeacherAccessFailure ? failure.reason : 'generic'
      if (reason === 'parent-invitation') { navigation.replace('ParentActivation', { code: formatInvitationCode(code) }); return }
      if (reason === 'account-active') {
        // Compte utilisé entre-temps : connexion habituelle, mot de passe inchangé.
        setPassword(''); setConfirm(''); setWithEmail(true); setStep('link')
      }
      fail(reason)
    } finally {
      setWorking(false)
    }
  }

  const link = async () => {
    setError(null)
    const phoneE164 = validPhone()
    if (!phoneE164) return
    if (!password || (withEmail && !email.trim())) { fail('required'); return }
    setWorking(true)
    try {
      const result = await signInAndLinkTeacher(code, phoneE164, password, withEmail ? email : '')
      rememberLoginMode('phone', phone.iso)
      Alert.alert(
        t(result.addedTeacherRole ? 'teacherActivation.doneRoleTitle' : 'teacherActivation.doneLinkTitle'),
        t(result.addedTeacherRole ? 'teacherActivation.doneRoleBody' : 'teacherActivation.doneBody', { phone: formatLoginPhone(phoneE164) }),
      )
    } catch (failure) {
      // Connecté mais rattachement refusé : cet écran a déjà laissé place à
      // l'espace du compte ; l'alerte dit quoi faire.
      const reason = failure instanceof TeacherAccessFailure ? failure.reason : 'generic'
      if (reason !== 'signin') Alert.alert(t('teacherActivation.linkFailedTitle'), t(ERROR_KEY[reason]))
      fail(reason)
    } finally {
      setWorking(false)
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.card, fontFamily: theme.fonts.regular }]
  const label = (text: string) => <Text style={[styles.label, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{text}</Text>
  const passwordField = (value: string, onChange: (next: string) => void, text: string, isNew: boolean) => (
    <View style={styles.field}>
      {label(text)}
      <View>
        <TextInput
          value={value}
          onChangeText={next => { onChange(next); if (error) setError(null) }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          textContentType={isNew ? 'newPassword' : 'password'}
          accessibilityLabel={text}
          style={[inputStyle, styles.passwordInput]}
        />
        <Pressable
          onPress={() => setShowPassword(shown => !shown)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(showPassword ? 'teacherActivation.hidePassword' : 'teacherActivation.showPassword')}
          style={styles.eye}
        >
          {showPassword ? <EyeOff size={20} color={theme.textMuted} /> : <Eye size={20} color={theme.textMuted} />}
        </Pressable>
      </View>
    </View>
  )
  const button = (text: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={working}
      accessibilityRole="button"
      accessibilityState={{ disabled: working, busy: working }}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.primary, opacity: working ? 0.7 : pressed ? 0.92 : 1 }, theme.shadows.md]}
    >
      {working ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.buttonText, { fontFamily: theme.fonts.bold }]}>{text}</Text>}
    </Pressable>
  )
  const errorBox = error ? (
    <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]} accessibilityLiveRegion="polite">
      <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{t(ERROR_KEY[error])}</Text>
    </View>
  ) : null
  const codeBadge = (
    <View style={[styles.badge, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}>
      <GraduationCap size={18} color={theme.primary} />
      <Text style={[styles.badgeText, { color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('teacherActivation.badge')}</Text>
      <Text style={[styles.badgeCode, { color: theme.text, borderColor: theme.primaryBorder, backgroundColor: theme.card }]}>{formatInvitationCode(code)}</Text>
      <Pressable onPress={() => { setStep('code'); setError(null); setPassword(''); setConfirm('') }} hitSlop={8} accessibilityRole="button" style={styles.badgeChange}>
        <Text style={[styles.link, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{t('teacherActivation.changeCode')}</Text>
      </Pressable>
    </View>
  )

  let body: React.ReactNode
  if (step === 'code') {
    body = (
      <>
        <View style={styles.field}>
          {label(t('teacherActivation.code'))}
          <TextInput
            value={code}
            onChangeText={next => { setCode(formatInvitationCode(next)); if (error) setError(null) }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            placeholder="ABC-DEFG-HIJ"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={t('teacherActivation.code')}
            returnKeyType="next"
            onSubmitEditing={() => { void checkCode() }}
            style={[inputStyle, styles.codeInput, { fontFamily: theme.fonts.bold }]}
          />
          <Text style={[styles.help, { color: theme.textMuted }]}>{t('teacherActivation.codeHelp')}</Text>
        </View>
        {errorBox}
        {button(t('teacherActivation.continue'), () => { void checkCode() })}
      </>
    )
  } else if (step === 'activate') {
    body = (
      <>
        {codeBadge}
        <PhoneNumberField
          value={phone}
          onChange={next => { setPhone(next); if (error) setError(null) }}
          label={t('teacherActivation.phone')}
          helper={t('teacherActivation.phoneHelp')}
          showValidationError={showPhoneErrors}
        />
        {passwordField(password, setPassword, t('teacherActivation.newPassword'), true)}
        {passwordField(confirm, setConfirm, t('teacherActivation.confirmPassword'), true)}
        <Text style={[styles.help, styles.helpTight, { color: theme.textMuted }]}>{t('teacherActivation.passwordRule')}</Text>
        <View style={[styles.note, { backgroundColor: theme.accentSurface }]}>
          <Text style={[styles.noteText, { color: theme.textSoft }]}>{t('teacherActivation.identityNote')}</Text>
        </View>
        {errorBox}
        {button(t('teacherActivation.activate'), () => { void activate() })}
      </>
    )
  } else if (step === 'link') {
    body = (
      <>
        {codeBadge}
        <View style={[styles.note, { backgroundColor: theme.surfaceAlt, flexDirection: 'row', gap: 10 }]}>
          <KeyRound size={18} color={theme.primary} />
          <Text style={[styles.noteText, { color: theme.textSoft, flex: 1 }]}>{t(addsTeacherRole ? 'teacherActivation.linkRoleIntro' : 'teacherActivation.linkActiveIntro')}</Text>
        </View>
        <PhoneNumberField
          value={phone}
          onChange={next => { setPhone(next); if (error) setError(null) }}
          label={t('teacherActivation.phone')}
          helper={t(addsTeacherRole ? 'teacherActivation.linkPhoneHelpRole' : 'teacherActivation.linkPhoneHelp')}
          showValidationError={showPhoneErrors}
        />
        {withEmail ? (
          <View style={styles.field}>
            {label(t('teacherActivation.usualEmail'))}
            <TextInput
              value={email}
              onChangeText={next => { setEmail(next); if (error) setError(null) }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="username"
              accessibilityLabel={t('teacherActivation.usualEmail')}
              style={inputStyle}
            />
          </View>
        ) : null}
        <Pressable onPress={() => setWithEmail(value => !value)} hitSlop={8} accessibilityRole="button" style={styles.inlineLink}>
          {withEmail ? <Smartphone size={16} color={theme.primary} /> : <Mail size={16} color={theme.primary} />}
          <Text style={[styles.link, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{t(withEmail ? 'teacherActivation.usePhone' : 'teacherActivation.useEmail')}</Text>
        </Pressable>
        {passwordField(password, setPassword, t('teacherActivation.currentPassword'), false)}
        {errorBox}
        {button(t(addsTeacherRole ? 'teacherActivation.linkRoleSubmit' : 'teacherActivation.linkSubmit'), () => { void link() })}
        <Text style={[styles.help, { color: theme.textMuted, marginTop: 14 }]}>{t('teacherActivation.linkForgot')}</Text>
      </>
    )
  } else {
    body = (
      <>
        <View style={[styles.note, { backgroundColor: theme.successSurface }]}>
          <Text style={[styles.doneTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{t('teacherActivation.doneTitle')}</Text>
          <Text style={[styles.noteText, { color: theme.textSoft }]}>{t('teacherActivation.doneNoSession')}</Text>
          <Text style={[styles.donePhone, { color: theme.text, fontFamily: theme.fonts.bold }]}>{formatLoginPhone(activatedPhone)}</Text>
        </View>
        {button(t('teacherActivation.goLogin'), () => navigation.goBack())}
      </>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('teacherActivation.back')} style={styles.back}>
          <ArrowLeft size={20} color={theme.textSoft} style={I18nManager.isRTL ? styles.flip : undefined} />
          <Text style={[styles.backText, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{t('teacherActivation.back')}</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.black }]}>{t('teacherActivation.title')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
          {t(step === 'code' ? 'teacherActivation.leadCode' : step === 'activate' ? 'teacherActivation.leadActivate' : step === 'link' ? 'teacherActivation.leadLink' : 'teacherActivation.leadDone')}
        </Text>
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  flip: { transform: [{ scaleX: -1 }] },
  backText: { fontSize: 14 },
  title: { fontSize: 28, marginTop: 12, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, marginBottom: 6, marginStart: 4 },
  input: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 },
  codeInput: { fontSize: 20, letterSpacing: 2.5, textAlign: 'center' },
  passwordInput: { paddingEnd: 52 },
  eye: { position: 'absolute', end: 6, top: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 12.5, lineHeight: 18, marginTop: 6, marginStart: 4 },
  helpTight: { marginTop: -6, marginBottom: 12 },
  note: { borderRadius: 14, padding: 14, marginBottom: 16 },
  noteText: { fontSize: 13.5, lineHeight: 20 },
  badge: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 16 },
  badgeText: { fontSize: 14 },
  badgeCode: { fontSize: 13, letterSpacing: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeChange: { marginStart: 'auto' },
  link: { fontSize: 14, textDecorationLine: 'underline' },
  inlineLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 40, marginBottom: 8 },
  errorBox: { borderRadius: 14, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { color: '#FFFFFF', fontSize: 16 },
  doneTitle: { fontSize: 18, marginBottom: 6 },
  donePhone: { fontSize: 20, marginTop: 10, letterSpacing: 0.5 },
})
