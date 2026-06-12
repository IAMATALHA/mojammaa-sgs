/**
 * BehaviorSheet — saisie d'une action de comportement par le PROF :
 * mérite ou avertissement + motif (taxonomie fixe) + commentaire libre.
 * Écrit dans `comportements` et notifie le parent (push via CF).
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable,
  ActivityIndicator, Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Star, AlertTriangle, Send } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import BottomSheet from './BottomSheet'
import { recordComportement } from '../services/comportementsService'
import { BEHAVIOR_REASONS, type BehaviorKind } from '../utils/behaviorTaxonomy'
import { dirStyle } from '../utils/arabicText'

interface Props {
  visible:  boolean
  onClose:  () => void
  eleve:    { id: string; nom: string; prenom: string } | null
  classe:   string
  date:     string   // ISO 'YYYY-MM-DD'
  seance?:  string
  teacher:  { uid: string; nom: string; prenom: string } | null
}

export default function BehaviorSheet({ visible, onClose, eleve, classe, date, seance, teacher }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [kind, setKind] = useState<BehaviorKind>('merite')
  const [reason, setReason] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  const kindColor = kind === 'merite' ? theme.success : theme.danger

  const reset = () => { setKind('merite'); setReason(null); setComment('') }
  const close = () => { reset(); onClose() }

  const pickKind = (k: BehaviorKind) => {
    setKind(k)
    setReason(null)  // les motifs ne se recoupent pas entre les deux familles
  }

  const submit = async () => {
    if (!eleve || !teacher || !reason) return
    // Motif "Remarque" sans texte = entrée vide pour le parent → refuser.
    if (reason === 'other' && !comment.trim()) {
      Alert.alert(t('behavior.commentRequired'))
      return
    }
    setSending(true)
    try {
      const notified = await recordComportement({
        eleve, classe, date, seance, kind, reason,
        comment: comment.trim() || undefined,
        teacher,
      })
      Alert.alert(
        t('behavior.saved'),
        notified ? t('behavior.parentNotified') : t('behavior.noParentLinked'),
      )
      close()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSending(false)
    }
  }

  const canSubmit = !!eleve && !!teacher && !!reason && !sending

  return (
    <BottomSheet visible={visible} onClose={close}>
      <View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
          {t('behavior.sheetTitle')}
        </Text>
        {eleve ? (
          <Text style={{ color: theme.textSoft, fontWeight: '600', fontSize: 13, marginTop: 4 }}>
            {eleve.prenom} {eleve.nom} · {classe}{seance ? ` · ${seance}` : ''}
          </Text>
        ) : null}

        {/* Mérite / Avertissement */}
        <View style={[styles.kindRow, { marginTop: 16 }]}>
          <Pressable
            onPress={() => pickKind('merite')}
            style={[styles.kindBtn, {
              borderColor: kind === 'merite' ? theme.success : theme.border,
              backgroundColor: kind === 'merite' ? theme.successSurface : theme.surface,
            }]}
          >
            <Star size={16} color={kind === 'merite' ? theme.success : theme.textSoft} strokeWidth={2.2} />
            <Text style={{ color: kind === 'merite' ? theme.success : theme.textSoft, fontWeight: '800', fontSize: 13.5 }}>
              {t('behavior.merite')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => pickKind('avertissement')}
            style={[styles.kindBtn, {
              borderColor: kind === 'avertissement' ? theme.danger : theme.border,
              backgroundColor: kind === 'avertissement' ? theme.dangerSurface : theme.surface,
            }]}
          >
            <AlertTriangle size={16} color={kind === 'avertissement' ? theme.danger : theme.textSoft} strokeWidth={2.2} />
            <Text style={{ color: kind === 'avertissement' ? theme.danger : theme.textSoft, fontWeight: '800', fontSize: 13.5 }}>
              {t('behavior.avertissement')}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('behavior.reason')}</Text>
        <View style={styles.chipRow}>
          {BEHAVIOR_REASONS[kind].map(r => {
            const active = reason === r
            return (
              <Pressable key={r} onPress={() => setReason(r)}
                style={[styles.chip, {
                  borderColor: active ? kindColor : theme.border,
                  backgroundColor: active ? kindColor : theme.surface,
                }]}>
                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 12.5 }}>
                  {t(`behavior.reasons.${r}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('behavior.comment')}</Text>
        <TextInput
          value={comment} onChangeText={setComment} multiline maxLength={300}
          placeholder={t('behavior.commentPlaceholder')} placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(comment)]} />

        <TouchableOpacity onPress={submit} disabled={!canSubmit} activeOpacity={0.85}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? kindColor : theme.surfaceAlt }]}>
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <>
                <Send size={15} color={canSubmit ? '#fff' : theme.textMuted} strokeWidth={2.2} />
                <Text style={{ color: canSubmit ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 14 }}>
                  {t('behavior.submit')}
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
  kindRow: { flexDirection: 'row', gap: 10 },
  kindBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 60, maxHeight: 100, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 16 },
})
