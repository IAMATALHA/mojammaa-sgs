import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView,
  ActivityIndicator, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRoute } from '@react-navigation/native'
import { X, Search, Inbox, Send, PenSquare } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeMessages, markAsRead, deleteMessage, sendMessage,
  type MessageDoc,
} from '../../services/messagesService'
import { confirmMessageDelete } from '../../utils/messageDeletePrompt'
import { formatTimestamp } from '../../utils/format'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import BottomSheet from '../../components/BottomSheet'
import ParentComposeSheet from '../../components/ParentComposeSheet'
import { dirStyle, localizedSubject, localizedBody } from '../../utils/arabicText'

type Filter = 'all' | 'urgent' | 'school' | 'event'

export default function ParentMessagesScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const [messages, setMessages] = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [detail, setDetail] = useState<MessageDoc | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [showCompose, setShowCompose] = useState(false)

  useEffect(() => {
    if (!profile?.uid) return
    setLoading(true)
    setLoadError(false)
    const unsub = subscribeMessages(
      profile.uid, profile.role || 'parent',
      list => { setMessages(list); setLoadError(false); setLoading(false) },
      () => { setLoadError(true); setLoading(false) },
    )
    return unsub
  }, [profile?.uid])

  // Arrivée via tap sur une notification push : ouvrir le message ciblé
  // dès qu'il est présent dans la liste, puis consommer le param.
  useEffect(() => {
    const mid = route.params?.messageId
    if (!mid || messages.length === 0) return
    const msg = messages.find(m => m.id === mid)
    if (msg) {
      openMessage(msg)
      navigation.setParams({ messageId: undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.messageId, messages])

  const unreadCount = useMemo(
    () => messages.filter(m => !(m.readBy || []).includes(profile?.uid || '')).length,
    [messages, profile?.uid],
  )

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: t('parent.all') },
    { id: 'urgent', label: t('parent.urgent') },
    { id: 'school', label: t('parent.school') },
    { id: 'event', label: t('parent.events') },
  ]

  const filtered = useMemo(() => {
    let list = messages
    if (filter === 'urgent') list = list.filter(m => m.priority === 'urgent')
    else if (filter === 'school') list = list.filter(m => m.category === 'attendance' || m.category === 'homework' || m.category === 'grade' || m.category === 'admin' || m.category === 'announcement')
    else if (filter === 'event') list = list.filter(m => m.category === 'event')
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(m =>
      (m.subject || '').toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q) ||
      (m.subjectAr || '').toLowerCase().includes(q) ||
      (m.bodyAr || '').toLowerCase().includes(q) ||
      (m.fromNom || '').toLowerCase().includes(q),
    )
    return list
  }, [messages, filter, query])

  const openMessage = async (msg: MessageDoc) => {
    setDetail(msg)
    setReplyText('')
    if (profile?.uid && msg.id) {
      try { await markAsRead(msg.id, profile.uid) } catch {}
    }
  }

  const handleDeleteMessage = (msg: MessageDoc) => {
    if (!profile?.uid || !msg.id) return
    const messageId = msg.id
    confirmMessageDelete({
      title: t('common.delete'),
      message: t('common.deleteConfirm'),
      cancelText: t('common.cancel'),
      deleteText: t('common.delete'),
      onDelete: async () => {
        try {
          await deleteMessage(messageId, profile.uid)
          setMessages(prev => prev.filter(item => item.id !== messageId))
          setDetail(current => current?.id === messageId ? null : current)
        } catch (e: any) {
          Alert.alert(t('common.error'), e?.message)
        }
      },
    })
  }

  const handleReply = async () => {
    if (!profile || !detail || !replyText.trim()) return
    setReplying(true)
    try {
      const fromNom = `${profile.prenom} ${profile.nom}`.trim()
      await sendMessage({
        type: 'direct',
        subject: `RE: ${detail.subject}`,
        body: replyText.trim(),
        fromId: profile.uid,
        fromNom,
        fromRole: 'parent',
        toType: 'user',
        toIds: [detail.fromId],
        toLabel: detail.fromNom || '',
        priority: 'normal',
        category: 'admin',
      })
      Alert.alert(t('teacher.messageSent'))
      setReplyText('')
      setDetail(null)
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setReplying(false) }
  }

  const renderItem = ({ item }: { item: MessageDoc }) => {
    const isUnread = !(item.readBy || []).includes(profile?.uid || '')
    const isUrgent = item.priority === 'urgent'
    return (
      <Pressable onPress={() => openMessage(item)} onLongPress={() => handleDeleteMessage(item)} delayLongPress={350}
        style={[styles.card, { backgroundColor: isUnread ? theme.white : theme.surface, borderColor: isUrgent ? theme.danger : isUnread ? theme.primary : theme.border }]}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '800' : '600', fontSize: 14, flex: 1 }}>
                {item.fromNom || t('parent.school')}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatTimestamp(item.createdAt)}</Text>
            </View>
            <Text numberOfLines={1} style={[{ color: theme.text, fontWeight: isUnread ? '700' : '500', fontSize: 13, marginTop: 2 }, dirStyle(localizedSubject(item, lang))]}>
              {isUrgent ? '🚨 ' : ''}{localizedSubject(item, lang)}
            </Text>
            <Text numberOfLines={1} style={[{ color: theme.textSoft, fontSize: 12, marginTop: 2 }, dirStyle(localizedBody(item, lang))]}>{localizedBody(item, lang)}</Text>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <ScreenLayout title={`${t('tabs.messages')}${unreadCount > 0 ? ` (${unreadCount})` : ''}`} showBack={false}>
      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Search size={16} color={theme.textSoft} strokeWidth={2} />
        <TextInput value={query} onChangeText={setQuery}
          placeholder={t('parent.searchMessages')} placeholderTextColor={theme.textMuted}
          style={{ flex: 1, color: theme.text, fontSize: 13, marginStart: 8, paddingVertical: 0 }} />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><X size={16} color={theme.textSoft} strokeWidth={2} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => {
          const active = filter === f.id
          return (
            <Pressable key={f.id} onPress={() => setFilter(f.id)}
              style={[styles.filterChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600', fontSize: 12 }}>{f.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {loadError && filtered.length === 0 && <MessagesErrorBanner />}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Inbox size={32} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={{ color: theme.textSoft, fontSize: 14, marginTop: 12 }}>{t('parent.noMessage')}</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={item => item.id || ''} renderItem={renderItem} contentContainerStyle={{ paddingBottom: 80 }} />
      )}

      {/* ── Compose : contacter un prof / l'école ── */}
      <TouchableOpacity onPress={() => setShowCompose(true)} style={[styles.fab, { backgroundColor: theme.primary }]} activeOpacity={0.85}>
        <PenSquare size={22} color="#fff" strokeWidth={2} />
      </TouchableOpacity>
      <ParentComposeSheet visible={showCompose} onClose={() => setShowCompose(false)} profile={profile} />


      {/* Detail + Reply — bottom sheet à ressort */}
      <BottomSheet visible={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                  {detail.fromNom || t('parent.school')}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatTimestamp(detail.createdAt)}</Text>
              </View>
              <Pressable onPress={() => setDetail(null)} hitSlop={8}><X size={20} color={theme.text} strokeWidth={2} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {detail.priority === 'urgent' && (
                <View style={[styles.urgentBadge, { backgroundColor: theme.dangerSurface }]}>
                  <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 11 }}>🚨 {t('compose.urgent')}</Text>
                </View>
              )}
              <Text style={[{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 12 }, dirStyle(localizedSubject(detail, lang))]}>{localizedSubject(detail, lang)}</Text>
              <Text style={[{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 10 }, dirStyle(localizedBody(detail, lang))]}>{localizedBody(detail, lang)}</Text>
            </ScrollView>

            {/* Reply bar */}
            {detail.fromId && detail.type !== 'announcement' && (
              <View style={[styles.replyBar, { borderTopColor: theme.border }]}>
                <TextInput value={replyText} onChangeText={setReplyText}
                  placeholder={t('teacher.writeMessage')} placeholderTextColor={theme.textMuted}
                  style={[styles.replyInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(replyText)]}
                  multiline maxLength={500} />
                <TouchableOpacity onPress={handleReply} disabled={!replyText.trim() || replying}
                  style={[styles.replyBtn, { backgroundColor: replyText.trim() ? theme.primary : theme.surfaceAlt }]}>
                  {replying ? <ActivityIndicator color="#fff" size="small" /> :
                    <Send size={18} color={replyText.trim() ? '#fff' : theme.textMuted} strokeWidth={2} />}
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        )}
      </BottomSheet>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  filterRow: { gap: 6, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  center: { paddingVertical: 60, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  urgentBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  replyInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, maxHeight: 80 },
  replyBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
})
