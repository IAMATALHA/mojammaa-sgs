/** Parent → boîte commune de l’administration. Les professeurs restent informateurs. */
import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Building2, Send } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import BottomSheet from './BottomSheet'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import { sendMessage } from '../services/messagesService'
import { dirStyle } from '../utils/arabicText'


interface Props {
  visible: boolean
  onClose: () => void
  profile: { uid: string; nom?: string; prenom?: string } | null
}

export default function ParentComposeSheet({ visible, onClose, profile }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [children, setChildren] = useState<EleveDoc[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setChildren([])
    if (!visible || !profile?.uid) return
    const unsub = subscribeChildrenOfParent(profile.uid, setChildren)
    return unsub
  }, [visible, profile?.uid])

  const guardianEleveId = children[0]?.codeMassar || children[0]?.id || ''
  const reset = () => { setSubject(''); setBody('') }

  const send = async () => {
    if (!profile || !guardianEleveId || !subject.trim() || !body.trim()) return
    setSending(true)
    try {
      await sendMessage({
        type:     'direct',
        subject:  subject.trim(),
        body:     body.trim(),
        fromId:   profile.uid,
        fromNom:  `${profile.prenom || ''} ${profile.nom || ''}`.trim(),
        fromRole: 'parent',
        eleveId: guardianEleveId,
        toType:   'administration',
        toIds:    [],
        toLabel:  t('parentCompose.school'),
        priority: 'normal',
        category: 'admin',
      })
      Alert.alert(t('teacher.messageSent'))
      reset()
      onClose()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSending(false)
    }
  }

  const canSend = !!guardianEleveId && !!subject.trim() && !!body.trim() && !sending

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose() }}>
      {/* L'évitement clavier est géré par BottomSheet (suivi de la hauteur
          du clavier + zone de contenu défilable). */}
      <View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
          {t('parentCompose.title')}
        </Text>

        <View style={[styles.recipientRow, { borderColor: theme.border, backgroundColor: theme.primarySurface, marginTop: 14 }]}>
          <Building2 size={17} color={theme.primary} />
          <Text style={{ color: theme.text, fontWeight: '700', marginStart: 8 }}>{t('parentCompose.school')}</Text>
        </View>
        <Text style={{ color: theme.textSoft, marginBottom: 8 }}>{t('parentCompose.administrationOnly')}</Text>

        {/* ── Objet + message ── */}
        <TextInput
          value={subject} onChangeText={setSubject} maxLength={120}
          accessibilityLabel={t('compose.subject')}
          placeholder={t('compose.subject')} placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(subject)]} />
        <TextInput
          value={body} onChangeText={setBody} multiline maxLength={1000}
          accessibilityLabel={t('teacher.writeMessage')}
          placeholder={t('teacher.writeMessage')} placeholderTextColor={theme.textMuted}
          style={[styles.input, styles.bodyInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(body)]} />

        <TouchableOpacity
          onPress={send} disabled={!canSend} activeOpacity={0.85}
          style={[styles.sendBtn, { backgroundColor: canSend ? theme.primary : theme.surfaceAlt }]}>
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <>
                <Send size={16} color={canSend ? '#fff' : theme.textMuted} strokeWidth={2.2} />
                <Text style={{ color: canSend ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 14 }}>
                  {t('compose.send')}
                </Text>
              </>
            )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
  recipientRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 10 },
  bodyInput: { minHeight: 90, maxHeight: 140, textAlignVertical: 'top' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
})
