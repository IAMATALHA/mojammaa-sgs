import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { X, Send, Inbox } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeMessages, subscribeSentMessages, markAsRead,
  type MessageDoc,
} from '../../services/messagesService'

type Tab = 'inbox' | 'sent'

export default function AdminMessagesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('inbox')
  const [inboxMsgs, setInboxMsgs] = useState<MessageDoc[]>([])
  const [sentMsgs, setSentMsgs] = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<MessageDoc | null>(null)

  useEffect(() => {
    if (!profile?.uid) return
    setLoading(true)
    const u1 = subscribeMessages(
      profile.uid,
      profile.role || 'admin',
      list => { setInboxMsgs(list); setLoading(false) },
    )
    const u2 = subscribeSentMessages(
      profile.uid,
      list => setSentMsgs(list),
    )
    return () => { u1(); u2() }
  }, [profile?.uid])

  const displayed = tab === 'inbox' ? inboxMsgs : sentMsgs
  const unreadCount = useMemo(
    () => inboxMsgs.filter(m => !(m.readBy || []).includes(profile?.uid || '')).length,
    [inboxMsgs, profile?.uid],
  )

  const openMessage = async (msg: MessageDoc) => {
    setDetail(msg)
    if (tab === 'inbox' && profile?.uid && msg.id) {
      try { await markAsRead(msg.id, profile.uid) } catch {}
    }
  }

  const formatDate = (ts: any) => {
    if (!ts) return ''
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const renderItem = ({ item }: { item: MessageDoc }) => {
    const isUnread = tab === 'inbox' && !(item.readBy || []).includes(profile?.uid || '')
    const isUrgent = item.priority === 'urgent'
    return (
      <Pressable
        onPress={() => openMessage(item)}
        style={[styles.card, {
          backgroundColor: isUnread ? theme.white : theme.surface,
          borderColor: isUrgent ? theme.danger : isUnread ? theme.primary : theme.border,
        }]}
      >
        <View style={styles.cardRow}>
          <View style={[styles.avatar, { backgroundColor: tab === 'sent' ? theme.primary : '#52B788' }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
              {tab === 'sent' ? (item.toLabel?.[0] || '→').toUpperCase() : (item.fromNom?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginStart: 10 }}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '800' : '600', fontSize: 14, flex: 1 }}>
                {tab === 'sent' ? (item.toLabel || '—') : (item.fromNom || '—')}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatDate(item.createdAt)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '700' : '500', fontSize: 13, marginTop: 2 }}>
              {isUrgent ? '🚨 ' : ''}{item.subject}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
              {item.body}
            </Text>
          </View>
        </View>
        {tab === 'sent' && item.readBy && item.readBy.length > 0 ? (
          <Text style={{ color: theme.success, fontSize: 10, fontWeight: '600', marginTop: 6, marginStart: 46 }}>
            ✓ {item.readBy.length} lu(s)
          </Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <ScreenLayout title={t('tabs.messages')} showBack={false}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable onPress={() => setTab('inbox')}
          style={[styles.tab, { borderColor: tab === 'inbox' ? theme.primary : theme.border, backgroundColor: tab === 'inbox' ? theme.primary : 'transparent' }]}>
          <Inbox size={14} color={tab === 'inbox' ? '#fff' : theme.textSoft} strokeWidth={2} />
          <Text style={{ color: tab === 'inbox' ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginStart: 6 }}>
            {t('parent.inbox')}
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: tab === 'inbox' ? 'rgba(255,255,255,0.3)' : theme.danger }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setTab('sent')}
          style={[styles.tab, { borderColor: tab === 'sent' ? theme.primary : theme.border, backgroundColor: tab === 'sent' ? theme.primary : 'transparent' }]}>
          <Send size={14} color={tab === 'sent' ? '#fff' : theme.textSoft} strokeWidth={2} />
          <Text style={{ color: tab === 'sent' ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginStart: 6 }}>
            {t('admin.sent')}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : displayed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>{t('teacher.noMessages')}</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id || ''}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textSoft, fontWeight: '600', fontSize: 12 }}>
                    {tab === 'sent' ? `→ ${detail.toLabel || ''}` : detail.fromNom || ''}
                  </Text>
                </View>
                <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                  <X size={20} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {detail.priority === 'urgent' && (
                  <View style={[styles.urgentBadge, { backgroundColor: theme.dangerSurface }]}>
                    <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 11 }}>🚨 {t('compose.urgent')}</Text>
                  </View>
                )}
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 8 }}>{detail.subject}</Text>
                <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>
                  {formatDate(detail.createdAt)}
                  {detail.toLabel ? ` · → ${detail.toLabel}` : ''}
                </Text>
                <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 14 }}>{detail.body}</Text>
                {tab === 'sent' && detail.readBy && detail.readBy.length > 0 ? (
                  <Text style={{ color: theme.success, fontSize: 12, fontWeight: '600', marginTop: 14 }}>
                    ✓ {detail.readBy.length} personne(s) ont lu ce message
                  </Text>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, gap: 4 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginStart: 4 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  urgentBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
})
