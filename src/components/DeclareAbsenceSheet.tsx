/**
 * DeclareAbsenceSheet — déclaration d'absence par le PARENT :
 * enfant + date + motif → absenceRequests (status 'pending').
 * Le prof la voit sur son écran d'appel et l'absence est justifiée
 * d'office avec ce motif à l'enregistrement.
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Send } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import BottomSheet from './BottomSheet'
import DatePickerSheet from './DatePickerSheet'
import { createAbsenceRequest } from '../services/absenceRequestsService'
import type { Child } from '../utils/dashboardTypes'
import { localeFor } from '../utils/format'
import { dirStyle } from '../utils/arabicText'

interface Props {
  visible:  boolean
  onClose:  () => void
  profile:  { uid: string; nom?: string; prenom?: string } | null
  children: Child[]
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DeclareAbsenceSheet({ visible, onClose, profile, children }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [childId, setChildId] = useState<string | null>(children.length === 1 ? children[0].id : null)
  const [date, setDate] = useState<Date | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const reset = () => { setChildId(children.length === 1 ? children[0].id : null); setDate(null); setReason('') }

  const submit = async () => {
    const child = children.find(c => c.id === childId)
    if (!profile || !child || !date || !reason.trim()) return
    setSending(true)
    try {
      await createAbsenceRequest({
        eleveId:     child.id,
        eleveNom:    child.lastName,
        elevePrenom: child.firstName,
        classe:      child.classe,
        parentUid:   profile.uid,
        parentNom:   `${profile.prenom || ''} ${profile.nom || ''}`.trim(),
        date:        toISODate(date),
        reason:      reason.trim(),
      })
      Alert.alert(t('absenceRequest.submitted'))
      reset()
      onClose()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSending(false)
    }
  }

  const canSubmit = !!childId && !!date && !!reason.trim() && !sending

  return (
    <>
      <BottomSheet visible={visible} onClose={() => { reset(); onClose() }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
            {t('absenceRequest.declare')}
          </Text>

          <Text style={[styles.label, { color: theme.textSoft }]}>{t('absenceRequest.child')}</Text>
          <View style={styles.chipRow}>
            {children.map(c => {
              const active = childId === c.id
              return (
                <Pressable key={c.id} onPress={() => setChildId(c.id)}
                  style={[styles.chip, {
                    borderColor: active ? (c.avatarColor || theme.primary) : theme.border,
                    backgroundColor: active ? (c.avatarColor || theme.primary) : theme.surface,
                  }]}>
                  <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 12.5 }}>
                    {c.firstName}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={[styles.label, { color: theme.textSoft }]}>{t('absenceRequest.date')}</Text>
          <Pressable onPress={() => setShowDatePicker(true)}
            style={[styles.dateBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <CalendarDays size={16} color={theme.primary} strokeWidth={2} />
            <Text style={{ color: date ? theme.text : theme.textMuted, fontWeight: '600', fontSize: 13, marginStart: 8 }}>
              {date
                ? date.toLocaleDateString(localeFor(), { weekday: 'long', day: '2-digit', month: 'long' })
                : t('absenceRequest.date')}
            </Text>
          </Pressable>

          <Text style={[styles.label, { color: theme.textSoft }]}>{t('absenceRequest.reason')}</Text>
          <TextInput
            value={reason} onChangeText={setReason} multiline maxLength={300}
            placeholder={t('absenceRequest.reasonPlaceholder')} placeholderTextColor={theme.textMuted}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(reason)]} />

          <TouchableOpacity onPress={submit} disabled={!canSubmit} activeOpacity={0.85}
            style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.surfaceAlt }]}>
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                <>
                  <Send size={15} color={canSubmit ? '#fff' : theme.textMuted} strokeWidth={2.2} />
                  <Text style={{ color: canSubmit ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 14 }}>
                    {t('absenceRequest.submit')}
                  </Text>
                </>
              )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </BottomSheet>

      <DatePickerSheet
        visible={showDatePicker}
        value={date}
        onSelect={setDate}
        onClose={() => setShowDatePicker(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 70, maxHeight: 110, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 16 },
})
