/**
 * ParentComposeSheet — compose parent : « Contacter un prof / l'école ».
 *
 * Destinataires possibles (depuis directory/staff, maintenu par CF) :
 *   - Administration de l'école → message aux uids admin
 *   - Professeurs des classes de SES enfants (fallback : tous les profs
 *     si aucune correspondance de classe)
 *
 * Envoi : type 'direct', toType 'user' — autorisé aux parents par les
 * rules (anti-usurpation fromId == uid). Push géré par la CF.
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Building2, GraduationCap, Send } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import BottomSheet from './BottomSheet'
import { getStaffDirectory, type StaffDirectory, type StaffTeacher } from '../services/directoryService'
import { subscribeChildrenOfParent } from '../services/elevesService'
import { sendMessage } from '../services/messagesService'
import { dirStyle } from '../utils/arabicText'

type Recipient = { kind: 'school' } | { kind: 'teacher'; teacher: StaffTeacher }

interface Props {
  visible: boolean
  onClose: () => void
  profile: { uid: string; nom?: string; prenom?: string } | null
}

export default function ParentComposeSheet({ visible, onClose, profile }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [staff, setStaff] = useState<StaffDirectory | null>(null)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [childClasses, setChildClasses] = useState<string[]>([])
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!visible) return
    setLoadingStaff(true)
    getStaffDirectory()
      .then(setStaff)
      .catch(() => setStaff(null))
      .finally(() => setLoadingStaff(false))
  }, [visible])

  useEffect(() => {
    if (!visible || !profile?.uid) return
    const unsub = subscribeChildrenOfParent(profile.uid, eleves => {
      const set = new Set<string>()
      eleves.forEach(e => { if (e.classe) set.add(e.classe) })
      setChildClasses([...set])
    })
    return unsub
  }, [visible, profile?.uid])

  const teachers = useMemo(() => {
    if (!staff) return []
    const mine = staff.teachers.filter(te => te.classes.some(c => childClasses.includes(c)))
    return mine.length > 0 ? mine : staff.teachers
  }, [staff, childClasses])

  const reset = () => { setRecipient(null); setSubject(''); setBody('') }

  const send = async () => {
    if (!profile || !recipient || !subject.trim() || !body.trim()) return
    const toIds = recipient.kind === 'school'
      ? (staff?.admins || []).map(a => a.uid)
      : [recipient.teacher.uid]
    if (toIds.length === 0) return
    const toLabel = recipient.kind === 'school'
      ? t('parentCompose.school')
      : `${recipient.teacher.prenom} ${recipient.teacher.nom}`.trim()
    setSending(true)
    try {
      await sendMessage({
        type:     'direct',
        subject:  subject.trim(),
        body:     body.trim(),
        fromId:   profile.uid,
        fromNom:  `${profile.prenom || ''} ${profile.nom || ''}`.trim(),
        fromRole: 'parent',
        toType:   'user',
        toIds,
        toLabel,
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

  const canSend = !!recipient && !!subject.trim() && !!body.trim() && !sending

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose() }}>
      {/* L'évitement clavier est géré par BottomSheet (KAV à la racine du Modal). */}
      <View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
          {t('parentCompose.title')}
        </Text>

        {/* ── Destinataire ── */}
        <Text style={[styles.label, { color: theme.textSoft }]}>{t('parentCompose.recipient')}</Text>
        {loadingStaff ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 14 }} />
        ) : !staff ? (
          <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>
            {t('parentCompose.empty')}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => setRecipient({ kind: 'school' })}
              style={[styles.recipientRow, {
                borderColor: recipient?.kind === 'school' ? theme.primary : theme.border,
                backgroundColor: recipient?.kind === 'school' ? theme.primarySurface : theme.surface,
              }]}>
              <Building2 size={17} color={theme.primary} strokeWidth={2} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, marginStart: 8 }}>
                {t('parentCompose.school')}
              </Text>
            </Pressable>
            {teachers.length > 0 && (
              <Text style={[styles.label, { color: theme.textSoft }]}>{t('parentCompose.teachers')}</Text>
            )}
            {teachers.map(te => {
              const active = recipient?.kind === 'teacher' && recipient.teacher.uid === te.uid
              return (
                <Pressable key={te.uid}
                  onPress={() => setRecipient({ kind: 'teacher', teacher: te })}
                  style={[styles.recipientRow, {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primarySurface : theme.surface,
                  }]}>
                  <GraduationCap size={17} color={theme.accent} strokeWidth={2} />
                  <View style={{ marginStart: 8, flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                      {`${te.prenom} ${te.nom}`.trim()}
                    </Text>
                    {!!te.matiere && (
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 11 }}>{te.matiere}</Text>
                    )}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        {/* ── Objet + message ── */}
        <TextInput
          value={subject} onChangeText={setSubject} maxLength={120}
          placeholder={t('compose.subject')} placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(subject)]} />
        <TextInput
          value={body} onChangeText={setBody} multiline maxLength={1000}
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
