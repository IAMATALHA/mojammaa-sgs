/**
 * ReadReceipts — panneau « accusés de lecture » d'un message ENVOYÉ
 * (onglet Envoyés des écrans Messages prof/admin).
 *
 *  - toType 'user' (toIds connus) : barre de progression Lu X / Y +
 *    bouton « Relancer les non-lus » → écrit un message-rappel ciblant
 *    UNIQUEMENT les non-lecteurs (la CF onMessageCreated fait le push).
 *  - diffusions par rôle ('all'/'parents'/'teachers') : compteur de
 *    lectures seul — le client ne peut pas énumérer les destinataires
 *    (rules) donc ni total ni relance.
 *
 * Fiable car les rules rendent readBy infalsifiable (append-only, son
 * propre uid seulement) depuis le Batch 0.
 */
import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { CheckCheck, BellRing } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Theme } from '../contexts/ThemeContext'
import { sendMessage, type MessageDoc } from '../services/messagesService'

interface Props {
  message: MessageDoc
  theme:   Theme
  sender:  { uid: string; nom?: string; prenom?: string; role?: string }
}

export default function ReadReceipts({ message, theme, sender }: Props) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [resent, setResent] = useState(false)

  const readBy = message.readBy || []
  const targeted = message.toType === 'user' && Array.isArray(message.toIds) && message.toIds.length > 0

  const readCount = targeted
    ? message.toIds.filter(uid => readBy.includes(uid)).length
    : readBy.filter(uid => uid !== sender.uid).length
  const unreadIds = targeted ? message.toIds.filter(uid => !readBy.includes(uid)) : []
  const total = targeted ? message.toIds.length : null

  const resendUnread = () => {
    Alert.alert(
      t('receipts.resend'),
      t('receipts.resendConfirm', { count: unreadIds.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('compose.send'),
          onPress: async () => {
            setSending(true)
            try {
              const fromNom = `${sender.prenom || ''} ${sender.nom || ''}`.trim() || message.fromNom
              await sendMessage({
                type:     message.type || 'announcement',
                subject:  `${t('receipts.reminderPrefix')}${message.subject}`,
                body:     message.body,
                fromId:   sender.uid,
                fromNom,
                fromRole: sender.role || message.fromRole,
                toType:   'user',
                toIds:    unreadIds,
                toLabel:  message.toLabel,
                priority: message.priority || 'normal',
                category: message.category,
                classe:   message.classe,
                eleveId:  message.eleveId,
              })
              setResent(true)
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message)
            } finally {
              setSending(false)
            }
          },
        },
      ],
    )
  }

  const allRead = targeted && unreadIds.length === 0
  const ratio = total ? readCount / total : 0

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.titleRow}>
        <CheckCheck size={15} color={allRead ? theme.success : theme.textSoft} strokeWidth={2.2} />
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12, marginStart: 6 }}>
          {t('receipts.title')}
        </Text>
      </View>

      {targeted ? (
        <>
          <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
            <View style={[styles.fill, { backgroundColor: theme.success, width: `${Math.round(ratio * 100)}%` }]} />
          </View>
          <View style={styles.countsRow}>
            <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '600' }}>
              {t('receipts.readOf', { read: readCount, total })}
            </Text>
            {!allRead && (
              <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>
                {t('receipts.unread', { count: unreadIds.length })}
              </Text>
            )}
          </View>
          {allRead && (
            <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
              {t('receipts.allRead')}
            </Text>
          )}
          {!allRead && (resent ? (
            <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700', marginTop: 10 }}>
              {t('receipts.resent')}
            </Text>
          ) : (
            <TouchableOpacity
              onPress={resendUnread} disabled={sending} activeOpacity={0.85}
              style={[styles.resendBtn, { backgroundColor: theme.primary }]}>
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <>
                    <BellRing size={14} color="#fff" strokeWidth={2.2} />
                    <Text style={styles.resendLabel}>{t('receipts.resend')}</Text>
                  </>
                )}
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
          {t('receipts.readCount', { count: readCount })}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999 },
  countsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  resendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 10, marginTop: 10, gap: 6,
  },
  resendLabel: { color: '#fff', fontWeight: '700', fontSize: 12 },
})
