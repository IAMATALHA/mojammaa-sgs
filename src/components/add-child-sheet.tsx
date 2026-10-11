/**
 * AddChildSheet — rattache un enfant au compte connecté avec le code
 * d'activation remis par l'école. Pour un prof, un chauffeur ou la direction, l'enfant
 * apparaît ensuite dans « Espace parent » (lien eleves.parentUid, aucun
 * second compte).
 */
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { UserRoundPlus } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import BottomSheet from './BottomSheet'
import {
  INVITATION_CODE_LENGTH, invitationCodeFromText, linkChildWithCode, normalizeInvitationCode,
} from '../services/parentAuthService'

interface Props {
  visible: boolean
  onClose: () => void
  /** Prof, chauffeur ou direction : l'enfant se consulte depuis « Espace parent ». */
  isStaff: boolean
  /** Code d'un lien d'activation ouvert dans l'application : prérempli, jamais envoyé d'office. */
  initialCode?: string
}

function errorKey(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  switch (code) {
    case 'functions/not-found': return 'addChild.errors.notFound'
    case 'functions/failed-precondition': return 'addChild.errors.inactive'
    case 'functions/already-exists': return 'addChild.errors.alreadyLinked'
    case 'functions/permission-denied': return 'addChild.errors.notAllowed'
    case 'functions/invalid-argument': return 'addChild.errors.format'
    default: return 'addChild.errors.generic'
  }
}

export default function AddChildSheet({ visible, onClose, isStaff, initialCode }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible && initialCode) { setCode(initialCode); setError('') }
  }, [visible, initialCode])

  const close = () => { setCode(''); setError(''); onClose() }

  const submit = async () => {
    if (normalizeInvitationCode(code).length !== INVITATION_CODE_LENGTH) {
      setError(t('addChild.errors.format'))
      return
    }
    setSending(true); setError('')
    try {
      const child = await linkChildWithCode(code)
      const name = child.studentName || t('addChild.childFallback')
      // Alerte affichée feuille encore ouverte : sur iOS, une alerte lancée
      // pendant la fermeture d'un Modal peut ne jamais apparaître.
      Alert.alert(
        t('addChild.successTitle'),
        t(isStaff ? 'addChild.successStaff' : 'addChild.successParent', {
          child: child.classe ? `${name} (${child.classe})` : name,
        }),
        [{ text: t('addChild.done'), onPress: close }],
        { cancelable: false },
      )
    } catch (e) {
      setError(t(errorKey(e)))
    } finally {
      setSending(false)
    }
  }

  const canSubmit = code.trim().length > 0 && !sending

  return (
    <BottomSheet visible={visible} onClose={close} dismissible={!sending}>
      <View>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primarySurface }]}>
            <UserRoundPlus size={18} color={theme.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.bold }]}>
            {t('addChild.title')}
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
          {t('addChild.subtitle')}
        </Text>

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('addChild.code')}</Text>
        <TextInput
          value={code}
          // Pas de maxLength natif : il tronquerait un message WhatsApp collé
          // avant d'en extraire le code. La limite de saisie reste 16 caractères.
          onChangeText={value => { setCode(invitationCodeFromText(value) ?? value.slice(0, 16)); if (error) setError('') }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!sending}
          returnKeyType="done"
          onSubmitEditing={() => { if (canSubmit) void submit() }}
          accessibilityLabel={t('addChild.code')}
          placeholder="ABC-DEFG-HIJ"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, {
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
            fontFamily: theme.fonts.semibold,
          }]}
        />
        <Text style={[styles.help, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{t('common.pasteCodeHelp')}</Text>
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger, fontFamily: theme.fonts.medium }]}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          onPress={() => { void submit() }}
          disabled={!canSubmit}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: sending }}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.surfaceAlt }]}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <Text style={{ color: canSubmit ? '#fff' : theme.textMuted, fontFamily: theme.fonts.bold, fontSize: 14 }}>
                {t('addChild.submit')}
              </Text>
            )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, letterSpacing: 1.5 },
  help: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  error: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 16 },
})
