import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView,
  ActivityIndicator, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { X, Send, Inbox, PenSquare, AlertCircle, Users } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeMessages, subscribeSentMessages, markAsRead, deleteMessage, broadcastToClasses,
  type MessageDoc,
} from '../../services/messagesService'
import * as Haptics from 'expo-haptics'
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '../../data/messageTemplates'
import { confirmMessageDelete } from '../../utils/messageDeletePrompt'
import { formatTimestamp } from '../../utils/format'

type Tab = 'inbox' | 'sent'

export default function TeacherMessagesScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'fr' | 'ar' | 'en'
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('inbox')
  const [inboxMsgs, setInboxMsgs] = useState<MessageDoc[]>([])
  const [sentMsgs, setSentMsgs] = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<MessageDoc | null>(null)
  const [showCompose, setShowCompose] = useState(false)

  useEffect(() => {
    if (!profile?.uid) return
    setLoading(true)
    const u1 = subscribeMessages(
      profile.uid, profile.role || 'professeur',
      list => { setInboxMsgs(list); setLoading(false) },
    )
    const u2 = subscribeSentMessages(profile.uid, list => setSentMsgs(list))
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
          setInboxMsgs(prev => prev.filter(item => item.id !== messageId))
          setSentMsgs(prev => prev.filter(item => item.id !== messageId))
          setDetail(current => current?.id === messageId ? null : current)
        } catch (e: any) {
          Alert.alert(t('common.error'), e?.message)
        }
      },
    })
  }

  const renderItem = ({ item }: { item: MessageDoc }) => {
    const isUnread = tab === 'inbox' && !(item.readBy || []).includes(profile?.uid || '')
    const isUrgent = item.priority === 'urgent'
    return (
      <Pressable onPress={() => openMessage(item)} onLongPress={() => handleDeleteMessage(item)} delayLongPress={350}
        style={[styles.card, { backgroundColor: isUnread ? theme.white : theme.surface, borderColor: isUrgent ? theme.danger : isUnread ? theme.primary : theme.border }]}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '800' : '600', fontSize: 14, flex: 1 }}>
                {tab === 'sent' ? (item.toLabel || '—') : (item.fromNom || '—')}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatTimestamp(item.createdAt)}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '700' : '500', fontSize: 13, marginTop: 2 }}>
              {isUrgent ? '🚨 ' : ''}{item.subject}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{item.body}</Text>
          </View>
        </View>
        {tab === 'sent' && item.readBy && item.readBy.length > 0 ? (
          <Text style={{ color: theme.success, fontSize: 10, fontWeight: '600', marginTop: 6 }}>✓ {item.readBy.length} lu(s)</Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <ScreenLayout title={t('tabs.messages')} showBack={false}>
      <View style={styles.tabRow}>
        <Pressable onPress={() => setTab('inbox')}
          style={[styles.tab, { borderColor: tab === 'inbox' ? theme.primary : theme.border, backgroundColor: tab === 'inbox' ? theme.primary : 'transparent' }]}>
          <View style={styles.tabContent}>
            <Inbox size={14} color={tab === 'inbox' ? '#fff' : theme.textSoft} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: tab === 'inbox' ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{t('parent.inbox')}</Text>
          </View>
          {unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: tab === 'inbox' ? 'rgba(255,255,255,0.3)' : theme.danger }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => setTab('sent')}
          style={[styles.tab, { borderColor: tab === 'sent' ? theme.primary : theme.border, backgroundColor: tab === 'sent' ? theme.primary : 'transparent' }]}>
          <View style={styles.tabContent}>
            <Send size={14} color={tab === 'sent' ? '#fff' : theme.textSoft} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: tab === 'sent' ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{t('admin.sent')}</Text>
          </View>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : displayed.length === 0 ? (
        <View style={styles.center}>
          <Inbox size={32} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={{ color: theme.textSoft, fontSize: 14, marginTop: 12 }}>{t('teacher.noMessages')}</Text>
        </View>
      ) : (
        <FlatList data={displayed} keyExtractor={item => item.id || ''} renderItem={renderItem} contentContainerStyle={{ paddingBottom: 80 }} />
      )}

      <TouchableOpacity onPress={() => setShowCompose(true)} style={[styles.fab, { backgroundColor: theme.primary }]} activeOpacity={0.85}>
        <PenSquare size={22} color="#fff" strokeWidth={2} />
      </TouchableOpacity>

      {/* ── Detail modal ── */}
      {detail && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                    {tab === 'sent' ? (detail.toLabel || '—') : (detail.fromNom || '—')}
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatTimestamp(detail.createdAt)}</Text>
                </View>
                <Pressable onPress={() => setDetail(null)} hitSlop={8}><X size={20} color={theme.text} strokeWidth={2} /></Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {detail.priority === 'urgent' && (
                  <View style={[styles.urgentTag, { backgroundColor: theme.dangerSurface }]}>
                    <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 11 }}>🚨 {t('compose.urgent')}</Text>
                  </View>
                )}
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 12 }}>{detail.subject}</Text>
                <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 10 }}>{detail.body}</Text>
                {tab === 'sent' && detail.readBy && detail.readBy.length > 0 ? (
                  <Text style={{ color: theme.success, fontSize: 12, fontWeight: '600', marginTop: 14 }}>✓ {detail.readBy.length} personne(s) ont lu</Text>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Compose modal ── */}
      {showCompose && (
        <ComposeModal
          theme={theme} t={t} lang={lang} profile={profile}
          onClose={() => setShowCompose(false)}
        />
      )}
    </ScreenLayout>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Compose modal — single-page form replacing the old 4-step wizard
   ════════════════════════════════════════════════════════════════════════ */

function ComposeModal({ theme, t, lang, profile, onClose }: {
  theme: Theme; t: any; lang: 'fr' | 'ar' | 'en'; profile: any; onClose: () => void
}) {
  const templates = useMemo(
    () => MESSAGE_TEMPLATES.filter(tmpl => tmpl.target === 'parents' || tmpl.target === 'all'),
    [],
  )
  const availableClasses = useMemo(() => {
    if (!profile) return []
    if (Array.isArray(profile.classes) && profile.classes.length > 0) return profile.classes as string[]
    if (profile.classe) return [profile.classe as string]
    return []
  }, [profile])

  const [selectedClasses, setSelectedClasses] = useState<string[]>(availableClasses)
  const [selectedTmpl, setSelectedTmpl] = useState<MessageTemplate | null>(null)
  const [tmplOpen, setTmplOpen] = useState(false)
  const [vars, setVars] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)

  const toggleClass = (c: string) => setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const pickTemplate = (tmpl: MessageTemplate) => {
    setSelectedTmpl(tmpl)
    setVars({})
    const titleKey = lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr
    setSubject(titleKey)
    const tplText = lang === 'ar' ? tmpl.template_ar : lang === 'en' ? tmpl.template_en : tmpl.template_fr
    setBody(fillTemplate(tplText, { elevePrenom: '{élève}' }))
  }

  const updateVar = (key: string, val: string) => {
    const nv = { ...vars, [key]: val }
    setVars(nv)
    if (selectedTmpl) {
      const tpl = lang === 'ar' ? selectedTmpl.template_ar : lang === 'en' ? selectedTmpl.template_en : selectedTmpl.template_fr
      setBody(fillTemplate(tpl, { ...nv, elevePrenom: '{élève}' }))
    }
  }

  const varLabel = (v: any) => lang === 'ar' ? v.label_ar : lang === 'en' ? v.label_en : v.label_fr
  const tmplTitle = (tmpl: MessageTemplate) => lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr

  const canSend = selectedClasses.length > 0 && subject.trim().length > 0 && body.trim().length > 0

  const handleSend = async () => {
    if (!profile || !canSend) return
    setSending(true)
    try {
      const result = await broadcastToClasses({
        classes: selectedClasses,
        subject: subject.trim(),
        body: body.trim(),
        urgent,
        category: 'announcement',
        teacher: { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
      })
      Alert.alert(
        t('teacher.messageSent'),
        result.parentsTargeted === 0 ? t('teacher.noParents') : `${result.parentsTargeted} parent(s) · ${result.pushSent} push`,
        [{ text: 'OK', onPress: onClose }],
      )
    } catch (e: any) {
      Alert.alert(t('teacher.sendFailed'), e?.message)
    } finally { setSending(false) }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={['top']} style={[cs.container, { backgroundColor: theme.bg }]}>
          {/* Header */}
          <View style={cs.header}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{t('teacher.newMessage')}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={theme.text} strokeWidth={2} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Classes */}
            <Text style={[cs.label, { color: theme.textSoft }]}>{t('teacher.recipients')}</Text>
            <View style={cs.chipRow}>
              {availableClasses.map(c => {
                const sel = selectedClasses.includes(c)
                return (
                  <TouchableOpacity key={c} onPress={() => toggleClass(c)}
                    style={[cs.chip, { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' }]}>
                    <Users size={12} color={sel ? '#fff' : theme.textSoft} strokeWidth={2} />
                    <Text style={{ color: sel ? '#fff' : theme.text, fontWeight: '700', fontSize: 12, marginStart: 4 }}>{c}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Templates — dropdown */}
            <Text style={[cs.label, { color: theme.textSoft, marginTop: 16 }]}>
              {lang === 'ar' ? 'نموذج' : lang === 'en' ? 'Template' : 'Modèle'}
            </Text>
            <TouchableOpacity onPress={() => setTmplOpen(o => !o)}
              style={[cs.dropdown, { borderColor: selectedTmpl ? selectedTmpl.color : theme.border, backgroundColor: selectedTmpl ? selectedTmpl.color + '10' : theme.surface }]}>
              <Text style={{ fontSize: 16 }}>{selectedTmpl ? selectedTmpl.icon : '📋'}</Text>
              <Text numberOfLines={1} style={{ flex: 1, marginStart: 8, color: selectedTmpl ? theme.text : theme.textSoft, fontWeight: '600', fontSize: 13 }}>
                {selectedTmpl ? tmplTitle(selectedTmpl) : (lang === 'ar' ? 'اختر نموذجاً...' : lang === 'en' ? 'Choose a template...' : 'Choisir un modèle...')}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>{tmplOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {tmplOpen && templates.map(tmpl => {
              const sel = selectedTmpl?.id === tmpl.id
              return (
                <TouchableOpacity key={tmpl.id} onPress={() => { Haptics.selectionAsync(); pickTemplate(tmpl); setTmplOpen(false) }}
                  style={[cs.dropdownItem, { backgroundColor: sel ? tmpl.color + '15' : theme.white, borderColor: sel ? tmpl.color : theme.border }]}>
                  <Text style={{ fontSize: 15 }}>{tmpl.icon}</Text>
                  <View style={{ flex: 1, marginStart: 8 }}>
                    <Text style={{ color: sel ? tmpl.color : theme.text, fontWeight: '700', fontSize: 13 }}>{tmplTitle(tmpl)}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 10 }}>{tmpl.categorie}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}

            {/* Template variables */}
            {selectedTmpl && selectedTmpl.variables.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {selectedTmpl.variables.map(v => (
                  <View key={v.key} style={{ marginBottom: 10 }}>
                    <Text style={[cs.label, { color: theme.textSoft }]}>{varLabel(v)}</Text>
                    {v.type === 'select' && v.options ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
                        {v.options.map(opt => {
                          const active = vars[v.key] === opt
                          return (
                            <TouchableOpacity key={opt} onPress={() => updateVar(v.key, opt)}
                              style={[cs.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600', fontSize: 11 }}>{opt}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </ScrollView>
                    ) : (
                      <TextInput
                        value={vars[v.key] || ''} onChangeText={val => updateVar(v.key, val)}
                        placeholder={v.placeholder} placeholderTextColor={theme.textMuted}
                        keyboardType={v.type === 'number' ? 'numeric' : 'default'}
                        style={[cs.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                      />
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Subject */}
            <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.subject')}</Text>
            <TextInput value={subject} onChangeText={setSubject}
              placeholder="Ex: Rappel devoirs" placeholderTextColor={theme.textMuted} maxLength={120}
              style={[cs.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]} />

            {/* Body */}
            <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.body')}</Text>
            <TextInput value={body} onChangeText={setBody}
              placeholder={t('teacher.writeMessage')} placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" maxLength={1500}
              style={[cs.input, cs.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]} />

            {/* Urgent */}
            <Pressable onPress={() => setUrgent(u => !u)}
              style={[cs.urgentRow, { backgroundColor: urgent ? theme.dangerSurface : theme.surface, borderColor: urgent ? theme.danger : theme.border }]}>
              <AlertCircle size={16} color={urgent ? theme.danger : theme.textSoft} strokeWidth={2} />
              <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('teacher.markUrgent')}</Text>
              <View style={[cs.dot, { backgroundColor: urgent ? theme.danger : theme.borderStrong }]} />
            </Pressable>
          </ScrollView>

          {/* Send */}
          <TouchableOpacity onPress={handleSend} disabled={!canSend || sending}
            style={[cs.sendBtn, { backgroundColor: canSend ? theme.primary : theme.surfaceAlt }]}>
            {sending ? <ActivityIndicator color="#fff" /> : (
              <>
                <Send size={18} color={canSend ? '#fff' : theme.textMuted} strokeWidth={2} />
                <Text style={{ color: canSend ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 15, marginStart: 8 }}>{t('compose.send')}</Text>
              </>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const cs = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  dropdown: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 4 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 4, marginStart: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14 },
  textarea: { minHeight: 100 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 14 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginBottom: 36, paddingVertical: 14, borderRadius: 12 },
})

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, position: 'relative', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden' },
  tabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  badge: { position: 'absolute', right: 8, top: '50%', marginTop: -9, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  center: { paddingVertical: 40, alignItems: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center' },
  urgentTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
})
