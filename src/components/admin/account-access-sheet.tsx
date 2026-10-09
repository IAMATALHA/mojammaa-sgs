/**
 * Accès d'un compte, géré par un superadmin depuis l'app (même logique que la
 * page Enseignants / Comptes du site) :
 * - professeur : invitation à activer son compte (code + lien, 7 jours, usage
 *   unique), remplacement, révocation ; récupération accompagnée d'un compte
 *   déjà actif, après vérification d'identité ;
 * - parent : lien de réinitialisation du mot de passe (1 h).
 * Les boutons WhatsApp et Partager PRÉPARENT un message : rien ne part tout seul.
 */
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CheckSquare, KeyRound, MessageCircle, Share2, ShieldCheck, Square, Ticket, X } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import BottomSheet from '../BottomSheet'
import PhoneNumberField from '../PhoneNumberField'
import {
  AdminActionError, createParentPasswordResetLink, createTeacherInvitation, createTeacherRecoveryLink,
  revokeTeacherInvitation, setTeacherLoginPhone,
} from '../../services/adminAccessService'
import {
  resetLinkMessage, teacherInvitationMessage, whatsAppUrl,
  type CreatedTeacherInvitation, type ResetLink, type TeacherAccessRow,
} from '../../utils/admin-access'
import { formatLoginPhone, normalizeLoginPhone } from '../../utils/parentIdentity'
import { emptyPhoneFieldValue, phoneFieldFromE164, phoneFieldValidity, type PhoneFieldValue } from '../../utils/phoneCountries'
import { hexWithAlpha } from '../../utils/format'

export interface AccessAccount {
  uid: string
  prenom: string
  nom: string
  role: string
  telephone?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  account: AccessAccount | null
  /** État d'accès du professeur (listTeacherAccess) ; absent pour un parent. */
  row?: TeacherAccessRow
  loading?: boolean
  onChanged: () => void
}

type Busy = '' | 'create' | 'revoke' | 'phone' | 'recovery'

const KNOWN_REASONS = new Set(['phone-taken', 'already-linked', 'invalid-phone', 'account-unavailable', 'not-eligible', 'permission-denied', 'unavailable'])

function initialPhone(account: AccessAccount | null, row?: TeacherAccessRow): PhoneFieldValue {
  const pendingPhone = row?.invitation?.status === 'pending' ? row.invitation.phoneE164 : null
  const known = pendingPhone || row?.account.loginPhone || account?.telephone || ''
  const e164 = known ? normalizeLoginPhone(known) : null
  return e164 ? phoneFieldFromE164(e164) : emptyPhoneFieldValue()
}

export default function AccountAccessSheet({ visible, onClose, account, row, loading = false, onChanged }: Props) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const rtl = i18n.language.startsWith('ar')
  const locale = rtl ? 'ar-MA' : i18n.language.startsWith('en') ? 'en-GB' : 'fr-FR'
  const isTeacher = account?.role === 'professeur'
  const [phone, setPhone] = useState<PhoneFieldValue>(() => initialPhone(account, row))
  const [showPhoneErrors, setShowPhoneErrors] = useState(false)
  const [created, setCreated] = useState<CreatedTeacherInvitation | null>(null)
  const [reset, setReset] = useState<ResetLink | null>(null)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [busy, setBusy] = useState<Busy>('')
  const [error, setError] = useState('')
  const phoneEdited = useRef(false)
  const busyRef = useRef(false)

  // Nouveau compte affiché : on repart d'une feuille vierge.
  useEffect(() => {
    phoneEdited.current = false
    setPhone(initialPhone(account, row))
    setCreated(null); setReset(null); setIdentityChecked(false); setPhoneSaved(false); setError(''); setShowPhoneErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement au changement de compte
  }, [account?.uid, visible])

  // L'état serveur peut arriver après l'ouverture de la feuille. Préremplir
  // alors le bon numéro, sans écraser une saisie déjà commencée.
  useEffect(() => {
    if (!phoneEdited.current) setPhone(initialPhone(account, row))
  }, [account, row])

  if (!account) return null

  const text = { color: theme.text, textAlign: rtl ? 'right' as const : 'left' as const, writingDirection: rtl ? 'rtl' as const : 'ltr' as const }
  const font = (weight: 'regular' | 'semibold' | 'bold') => ({
    fontFamily: rtl ? (weight === 'regular' ? theme.fonts.arabic : weight === 'semibold' ? theme.fonts.arabicSemi : theme.fonts.arabicBold) : theme.fonts[weight],
  })
  const row_ = { flexDirection: rtl ? 'row-reverse' as const : 'row' as const }
  const formatDate = (ms: number) => new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  const fail = (failure: unknown) => {
    const reason = failure instanceof AdminActionError ? failure.reason : 'generic'
    if (reason === 'phone-taken' && failure instanceof AdminActionError && failure.conflict) {
      const other = failure.conflict
      setError(t('adminAccess.conflict', {
        name: `${other.prenom} ${other.nom}`.trim() || other.uid,
        role: t(`adminAccess.roles.${other.role}`, { defaultValue: other.role }),
      }))
      return
    }
    if (KNOWN_REASONS.has(reason)) { setError(t(`adminAccess.errors.${reason}`)); return }
    setError(failure instanceof AdminActionError && failure.message ? failure.message : t('adminAccess.errors.generic'))
  }

  const validPhone = (): string | null => {
    const validity = phoneFieldValidity(phone)
    if (validity.status === 'valid') return validity.e164
    setShowPhoneErrors(true)
    setError(t('adminAccess.errors.invalid-phone'))
    return null
  }

  const run = async (kind: Busy, action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind); setError('')
    try { await action() } catch (failure) { fail(failure) } finally { busyRef.current = false; setBusy('') }
  }

  // Le code reçu est immédiatement révocable, même si la relecture de la liste
  // est lente : ne pas révoquer l'invitation précédente restée dans `row`.
  const invitation = created ? {
    id: created.invitationId, status: 'pending' as const, expiresAtMs: created.expiresAtMs,
    createdAtMs: 0, usedAtMs: null, revokedAtMs: null,
  } : row?.invitation ?? null
  const pending = invitation?.status === 'pending'
  const statusText = !invitation ? t('adminAccess.status.none')
    : invitation.status === 'pending' ? t('adminAccess.status.pending', { date: formatDate(invitation.expiresAtMs) })
      : invitation.status === 'used' ? t('adminAccess.status.used', { date: formatDate(invitation.usedAtMs ?? invitation.createdAtMs) })
        : invitation.status === 'expired' ? t('adminAccess.status.expired', { date: formatDate(invitation.expiresAtMs) })
          : t('adminAccess.status.revoked', { date: formatDate(invitation.revokedAtMs ?? invitation.createdAtMs) })
  // Teintes : seules les couleurs hexadécimales passent par hexWithAlpha ; état neutre = surfaces du thème.
  const tone = !invitation || invitation.status === 'expired' ? null
    : invitation.status === 'pending' ? theme.warning : invitation.status === 'used' ? theme.success : theme.danger
  const statusStyle = tone
    ? { color: tone, backgroundColor: hexWithAlpha(tone, 0.1), borderColor: hexWithAlpha(tone, 0.28) }
    : { color: theme.textSoft, backgroundColor: theme.surfaceAlt, borderColor: theme.border }

  const invitationText = created ? teacherInvitationMessage(account.prenom, created, formatDate(created.expiresAtMs)) : ''
  const resetText = reset ? resetLinkMessage(account.prenom, reset) : ''
  const shareMessage = async (message: string, phone: string | null) => {
    setError('')
    try {
      if (phone) await Linking.openURL(whatsAppUrl(phone, message))
      else await Share.share({ message })
    } catch {
      setError(t('common.shareError'))
    }
  }
  // Récupération : professeur déjà actif, ou parent (lien de réinitialisation).
  const showRecovery = isTeacher ? row?.account.everSignedIn === true && !row.account.disabled : account.role === 'parent'

  const shareButtons = (message: string, whatsappPhone: string | null) => (
    <View style={[styles.actions, row_]}>
      {whatsappPhone ? (
        <Pressable accessibilityRole="button" disabled={busy !== ''} onPress={() => { void shareMessage(message, whatsappPhone) }}
          style={({ pressed }) => [styles.action, styles.whatsapp, row_, pressed && styles.pressed]}>
          <MessageCircle size={17} color="#FFFFFF" />
          <Text style={[styles.actionText, font('bold'), { color: '#FFFFFF' }]}>{t('adminAccess.whatsapp')}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" disabled={busy !== ''} onPress={() => { void shareMessage(message, null) }}
        style={({ pressed }) => [styles.action, row_, { backgroundColor: theme.surface, borderColor: theme.borderStrong, borderWidth: 1 }, pressed && styles.pressed]}>
        <Share2 size={17} color={theme.text} />
        <Text style={[styles.actionText, font('bold'), { color: theme.text }]}>{t('adminAccess.share')}</Text>
      </Pressable>
    </View>
  )

  const primaryButton = (label: string, kind: Busy, onPress: () => void, Icon = Ticket, tone: 'primary' | 'ghost' | 'danger' = 'primary') => (
    <Pressable accessibilityRole="button" disabled={busy !== ''} accessibilityState={{ disabled: busy !== '', busy: busy === kind }} onPress={onPress}
      style={({ pressed }) => [styles.action, row_,
        tone === 'primary' ? { backgroundColor: theme.primary }
          : { backgroundColor: theme.card, borderWidth: 1, borderColor: tone === 'danger' ? hexWithAlpha(theme.danger, 0.4) : theme.borderStrong },
        (pressed || busy !== '') && styles.pressed]}>
      {busy === kind ? <ActivityIndicator size="small" color={tone === 'primary' ? '#FFFFFF' : theme.primary} />
        : <Icon size={17} color={tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? theme.danger : theme.text} />}
      <Text style={[styles.actionText, font('bold'), { color: tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? theme.danger : theme.text }]}>{label}</Text>
    </Pressable>
  )

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={busy === ''}>
      <View style={[styles.header, row_]}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primarySurface }]}>
          {isTeacher ? <Ticket size={18} color={theme.primary} /> : <KeyRound size={18} color={theme.primary} />}
        </View>
        <View style={styles.flex}>
          <Text style={[text, font('bold'), styles.title]}>{t(isTeacher ? 'adminAccess.teacherTitle' : 'adminAccess.parentTitle')}</Text>
          <Text style={[text, font('regular'), styles.name, { color: theme.textSoft }]}>{account.prenom} {account.nom}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close', { defaultValue: 'Fermer' })} onPress={onClose} hitSlop={10} disabled={busy !== ''}>
          <X size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {isTeacher && !row ? (
        <View style={styles.section}>
          {loading ? <ActivityIndicator color={theme.primary} /> : (
            <>
              <Text style={[text, font('regular')]}>{t('adminAccess.loadError')}</Text>
              <Pressable accessibilityRole="button" onPress={onChanged} style={styles.action}>
                <Text style={[text, font('bold')]}>{t('common.retry')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : isTeacher ? (
        <View style={styles.section}>
          <Text style={[text, font('bold'), styles.sectionTitle]}>{t('adminAccess.invitation')}</Text>
          <View style={[styles.status, { backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }]}>
            <Text style={[text, font('semibold'), { color: statusStyle.color, fontSize: 13.5, lineHeight: 19 }]}>{statusText}</Text>
            {row?.account.disabled ? <Text style={[text, font('regular'), styles.small, { color: theme.danger }]}>{t('adminAccess.accountDisabled')}</Text> : null}
            {row?.account.loginPhone ? (
              <Text style={[text, font('regular'), styles.small, { color: theme.textSoft }]}>{t('adminAccess.phoneLogin', { phone: formatLoginPhone(row.account.loginPhone) })}</Text>
            ) : null}
          </View>

          {created ? (
            <View style={[styles.created, { borderColor: hexWithAlpha(theme.primary, 0.24), backgroundColor: theme.primarySurface }]}>
              <Text style={[text, font('semibold'), styles.small, { color: theme.textSoft }]}>
                {t(created.mode === 'activation' ? 'adminAccess.createdActivation' : 'adminAccess.createdLink')}
              </Text>
              <Text selectable style={[styles.code, { color: theme.text, fontFamily: theme.fonts.bold }]}>{created.code}</Text>
              <Text style={[text, font('regular'), styles.small, { color: theme.textSoft }]}>
                {t('adminAccess.createdUntil', { date: formatDate(created.expiresAtMs), phone: formatLoginPhone(created.phoneE164) })}
              </Text>
              {shareButtons(invitationText, created.phoneE164)}
              <View style={[row_, styles.notice]}>
                <ShieldCheck size={16} color={theme.warning} />
                <Text style={[text, font('regular'), styles.small, styles.flex, { color: theme.textSoft }]}>{t('adminAccess.handover')}</Text>
              </View>
            </View>
          ) : null}

          <PhoneNumberField
            value={phone}
            disabled={busy !== ''}
            onChange={next => { phoneEdited.current = true; setPhone(next); setPhoneSaved(false); if (error) setError('') }}
            label={t('adminAccess.teacherPhone')}
            helper={t('adminAccess.teacherPhoneHelp')}
            showValidationError={showPhoneErrors}
          />
          <View style={[styles.actions, row_]}>
            {primaryButton(t(pending ? 'adminAccess.replace' : 'adminAccess.create'), 'create', () => {
              const e164 = validPhone()
              if (!e164) return
              void run('create', async () => {
                setCreated(await createTeacherInvitation(account.uid, e164))
                onChanged()
              })
            })}
            {pending && invitation ? primaryButton(t('adminAccess.revoke'), 'revoke', () => {
              void run('revoke', async () => {
                await revokeTeacherInvitation(invitation.id)
                setCreated(null)
                onChanged()
              })
            }, X, 'danger') : null}
          </View>
          {pending ? <Text style={[text, font('regular'), styles.small, { color: theme.textMuted }]}>{t('adminAccess.replaceHelp')}</Text> : null}
        </View>
      ) : null}

      {showRecovery ? (
        <View style={styles.section}>
          <Text style={[text, font('bold'), styles.sectionTitle]}>{t(isTeacher ? 'adminAccess.recoveryTitle' : 'adminAccess.resetTitle')}</Text>
          <Text style={[text, font('regular'), styles.small, { color: theme.textSoft }]}>{t(isTeacher ? 'adminAccess.recoveryHelp' : 'adminAccess.resetHelp')}</Text>
          <Pressable accessibilityRole="checkbox" disabled={busy !== ''} accessibilityState={{ checked: identityChecked, disabled: busy !== '' }} onPress={() => setIdentityChecked(value => !value)}
            style={[styles.check, row_]}>
            {identityChecked ? <CheckSquare size={22} color={theme.primary} /> : <Square size={22} color={theme.textMuted} />}
            <Text style={[text, font('semibold'), styles.flex, { fontSize: 14 }]}>{t('adminAccess.identityChecked', { name: account.prenom })}</Text>
          </Pressable>
          {identityChecked ? (
            <View style={[styles.actions, row_]}>
              {isTeacher ? primaryButton(t(phoneSaved ? 'adminAccess.phoneSaved' : 'adminAccess.saveLoginPhone'), 'phone', () => {
                const e164 = validPhone()
                if (!e164) return
                void run('phone', async () => {
                  await setTeacherLoginPhone(account.uid, e164)
                  // Cette opération révoque les invitations en attente. Les
                  // messages de récupération précédents citent aussi l'ancien numéro.
                  setCreated(null); setReset(null)
                  setPhoneSaved(true)
                  onChanged()
                })
              }, ShieldCheck, 'ghost') : null}
              {primaryButton(t('adminAccess.generateReset'), 'recovery', () => {
                void run('recovery', async () => {
                  setReset(isTeacher ? await createTeacherRecoveryLink(account.uid) : await createParentPasswordResetLink(account.uid))
                })
              }, KeyRound)}
            </View>
          ) : null}
          {reset ? (
            <View style={[styles.created, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              {!reset.phoneIsLogin ? (
                <Text style={[text, font('regular'), styles.small, { color: theme.warning }]}>
                  {t(reset.phone ? 'adminAccess.resetContactPhone' : 'adminAccess.resetNoPhone')}
                </Text>
              ) : null}
              {shareButtons(resetText, reset.phone)}
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: theme.dangerSurface }]}>
          <Text style={[text, font('semibold'), { color: theme.danger, fontSize: 13.5, lineHeight: 19 }]}>{error}</Text>
        </View>
      ) : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { alignItems: 'center', gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17 },
  name: { fontSize: 13.5, marginTop: 2 },
  section: { marginTop: 18, gap: 10 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  status: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  small: { fontSize: 12.5, lineHeight: 18 },
  created: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  code: { fontSize: 26, letterSpacing: 3, textAlign: 'center', marginVertical: 2 },
  notice: { alignItems: 'flex-start', gap: 8, marginTop: 4 },
  actions: { flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, minHeight: 46, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 14 },
  whatsapp: { backgroundColor: '#1F8F4E' },
  pressed: { opacity: 0.75 },
  check: { alignItems: 'center', gap: 10, minHeight: 44 },
  error: { marginTop: 14, borderRadius: 12, padding: 12 },
})
