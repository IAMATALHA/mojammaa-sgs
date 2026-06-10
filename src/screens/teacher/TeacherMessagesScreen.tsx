import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView,
  ActivityIndicator, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRoute } from '@react-navigation/native'
import { X, Send, Inbox, PenSquare, AlertCircle, Users, CalendarDays, Check, Lock } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeMessages, subscribeSentMessages, markAsRead, deleteMessage,
  broadcastToParents, broadcastPersonalized,
  type MessageDoc,
} from '../../services/messagesService'
import { listEleves, type EleveDoc } from '../../services/elevesService'
import DatePickerSheet from '../../components/DatePickerSheet'
import * as Haptics from 'expo-haptics'
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '../../data/messageTemplates'
import { confirmMessageDelete } from '../../utils/messageDeletePrompt'
import { formatTimestamp, formatLongDate } from '../../utils/format'
import { ELEVE_PLACEHOLDER, eleveKey, eleveName, elevePrenom } from '../../utils/eleveLabels'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import ReadReceipts from '../../components/ReadReceipts'

type Tab = 'inbox' | 'sent'

export default function TeacherMessagesScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'fr' | 'ar' | 'en'
  const { profile } = useAuth()
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const [tab, setTab] = useState<Tab>('inbox')
  const [inboxMsgs, setInboxMsgs] = useState<MessageDoc[]>([])
  const [sentMsgs, setSentMsgs] = useState<MessageDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [detail, setDetail] = useState<MessageDoc | null>(null)
  const [showCompose, setShowCompose] = useState(false)

  useEffect(() => {
    if (!profile?.uid) return
    setLoading(true)
    setLoadError(false)
    const u1 = subscribeMessages(
      profile.uid, profile.role || 'professeur',
      list => { setInboxMsgs(list); setLoadError(false); setLoading(false) },
      () => { setLoadError(true); setLoading(false) },
    )
    // L'échec de la requête « envoyés » ne doit pas alarmer toute la messagerie
    // (seul l'inbox pilote la bannière).
    const u2 = subscribeSentMessages(profile.uid, list => setSentMsgs(list))
    return () => { u1(); u2() }
  }, [profile?.uid])


  // Arrivée via tap sur une notification push : basculer sur l'inbox et
  // ouvrir le message ciblé dès qu'il est chargé, puis consommer le param.
  useEffect(() => {
    const mid = route.params?.messageId
    if (!mid || inboxMsgs.length === 0) return
    const msg = inboxMsgs.find(m => m.id === mid)
    if (msg) {
      setTab('inbox')
      setDetail(msg)
      if (profile?.uid && msg.id) { markAsRead(msg.id, profile.uid).catch(() => {}) }
      navigation.setParams({ messageId: undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.messageId, inboxMsgs])

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
        {tab === 'sent' && item.toType === 'user' && Array.isArray(item.toIds) && item.toIds.length > 0 ? (
          <Text style={{
            color: item.toIds.every(uid => (item.readBy || []).includes(uid)) ? theme.success : theme.textSoft,
            fontSize: 10, fontWeight: '700', marginTop: 6,
          }}>
            ✓ {t('receipts.readOf', { read: item.toIds.filter(uid => (item.readBy || []).includes(uid)).length, total: item.toIds.length })}
          </Text>
        ) : tab === 'sent' && item.readBy && item.readBy.length > 0 ? (
          <Text style={{ color: theme.success, fontSize: 10, fontWeight: '600', marginTop: 6 }}>✓ {t('receipts.readCount', { count: item.readBy.length })}</Text>
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

      {loadError && displayed.length === 0 && <MessagesErrorBanner />}

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
                {tab === 'sent' && profile?.uid ? (
                  <ReadReceipts
                    message={sentMsgs.find(m => m.id === detail.id) || detail}
                    theme={theme}
                    sender={{ uid: profile.uid, nom: profile.nom, prenom: profile.prenom, role: profile.role }}
                  />
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

  // A subject teacher (collège/lycée) teaches one matière → auto-fill it and
  // hide the picker. Primaire teachers cover several subjects, so they choose.
  const teacherMatiere = profile?.matiere as string | undefined
  const isPrimaire = profile?.cycle === 'primaire'
  const lockMatiere = !isPrimaire && !!teacherMatiere

  // Smart default: 1 class → preselect it; several → none (teacher chooses).
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    availableClasses.length === 1 ? availableClasses : [],
  )
  const [selectedTmpl, setSelectedTmpl] = useState<MessageTemplate | null>(null)
  const [tmplOpen, setTmplOpen] = useState(false)
  const [vars, setVars] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)

  // Student selection
  const [eleves, setEleves] = useState<EleveDoc[]>([])
  const [selectedEleveIds, setSelectedEleveIds] = useState<Set<string>>(new Set())
  const [loadingEleves, setLoadingEleves] = useState(false)

  // Date picker (template variables of type 'date')
  const [datePickerKey, setDatePickerKey] = useState<string | null>(null)
  const [dateValues, setDateValues] = useState<Record<string, Date>>({})

  // Load students whenever the class set changes; default = all selected.
  useEffect(() => {
    let cancelled = false
    if (selectedClasses.length === 0) { setEleves([]); setSelectedEleveIds(new Set()); return }
    setLoadingEleves(true)
    listEleves({ classes: selectedClasses })
      .then(list => {
        if (cancelled) return
        setEleves(list)
        setSelectedEleveIds(new Set())   // start empty — teacher picks who to send to
      })
      .catch(() => { if (!cancelled) setEleves([]) })
      .finally(() => { if (!cancelled) setLoadingEleves(false) })
    return () => { cancelled = true }
  }, [selectedClasses])

  const elevesByClasse = useMemo(() => {
    const map: Record<string, EleveDoc[]> = {}
    eleves.forEach(e => { (map[e.classe] ||= []).push(e) })
    Object.values(map).forEach(l => l.sort((a, b) => eleveName(a).localeCompare(eleveName(b), 'fr')))
    return map
  }, [eleves])

  const selectedEleves = useMemo(() => eleves.filter(e => selectedEleveIds.has(eleveKey(e))), [eleves, selectedEleveIds])
  const parentUids = useMemo(
    () => [...new Set(selectedEleves.map(e => (e as any).parentUid as string | undefined).filter(Boolean) as string[])],
    [selectedEleves],
  )

  const toggleEleve = (id: string) => setSelectedEleveIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const allSelected = eleves.length > 0 && eleves.every(e => selectedEleveIds.has(eleveKey(e)))
  const selectAll = (on: boolean) => setSelectedEleveIds(on ? new Set(eleves.map(eleveKey)) : new Set())

  const toggleClass = (c: string) => setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  // Variables shown to the teacher (locked matière is injected, not asked).
  const visibleVariables = (tmpl: MessageTemplate) =>
    tmpl.variables.filter(v => !(v.key === 'matiere' && lockMatiere))

  // Merge the locked matière into the variable map used to fill templates.
  const fillVars = (nv: Record<string, string>) => ({
    ...nv,
    ...(lockMatiere && teacherMatiere ? { matiere: teacherMatiere } : {}),
    elevePrenom: ELEVE_PLACEHOLDER,
  })

  const pickTemplate = (tmpl: MessageTemplate) => {
    setSelectedTmpl(tmpl)
    setVars({})
    setDateValues({})
    const titleKey = lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr
    setSubject(titleKey)
    const tplText = lang === 'ar' ? tmpl.template_ar : lang === 'en' ? tmpl.template_en : tmpl.template_fr
    setBody(fillTemplate(tplText, fillVars({})))
  }

  const updateVar = (key: string, val: string) => {
    const nv = { ...vars, [key]: val }
    setVars(nv)
    if (selectedTmpl) {
      const tpl = lang === 'ar' ? selectedTmpl.template_ar : lang === 'en' ? selectedTmpl.template_en : selectedTmpl.template_fr
      setBody(fillTemplate(tpl, fillVars(nv)))
    }
  }

  const onPickDate = (key: string, d: Date) => {
    setDateValues(prev => ({ ...prev, [key]: d }))
    updateVar(key, formatLongDate(d, lang, true))
  }

  const varLabel = (v: any) => lang === 'ar' ? v.label_ar : lang === 'en' ? v.label_en : v.label_fr
  const tmplTitle = (tmpl: MessageTemplate) => lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr

  const recipientLabel =
    `${selectedEleves.length} ${lang === 'ar' ? 'تلميذ' : lang === 'en' ? 'student(s)' : 'élève(s)'} · ${selectedClasses.join(', ')}`

  const canSend = parentUids.length > 0 && subject.trim().length > 0 && body.trim().length > 0

  const handleSend = async () => {
    if (!profile || !canSend) return
    setSending(true)
    const teacher = { uid: profile.uid, nom: profile.nom, prenom: profile.prenom }
    try {
      let parentsTargeted = 0

      if (body.includes(ELEVE_PLACEHOLDER)) {
        // Personalised: one message per student with their first name filled in.
        const recipients = selectedEleves
          .filter(e => (e as any).parentUid)
          .map(e => ({
            parentUid: (e as any).parentUid as string,
            body:      body.split(ELEVE_PLACEHOLDER).join(elevePrenom(e)).trim(),
            label:     `${eleveName(e)} · ${e.classe}`,
            eleveId:   e.codeMassar,
          }))
        const r = await broadcastPersonalized({
          recipients, subject: subject.trim(), classe: selectedClasses.join(', '),
          urgent, category: 'announcement', teacher,
        })
        parentsTargeted = r.parentsTargeted
      } else {
        // Generic: a single message to all selected parents.
        const r = await broadcastToParents({
          parentUids, label: recipientLabel, classe: selectedClasses.join(', '),
          subject: subject.trim(), body: body.trim(), urgent, category: 'announcement', teacher,
        })
        parentsTargeted = r.parentsTargeted
      }

      Alert.alert(
        t('teacher.messageSent'),
        parentsTargeted === 0 ? t('teacher.noParents') : `${parentsTargeted} parent(s)`,
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

            {/* Students of the selected classes — pick one or more */}
            <View style={cs.studentsHeader}>
              <Text style={[cs.label, { color: theme.textSoft, marginBottom: 0 }]}>
                {lang === 'ar' ? 'التلاميذ' : lang === 'en' ? 'Students' : 'Élèves'}
              </Text>
              {selectedEleves.length > 0 && (
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>
                  {selectedEleves.length} · {parentUids.length} {lang === 'ar' ? 'ولي' : 'parent(s)'}
                </Text>
              )}
            </View>

            {loadingEleves ? (
              <ActivityIndicator color={theme.primary} style={{ alignSelf: 'flex-start', marginVertical: 10 }} />
            ) : selectedClasses.length === 0 ? (
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                {lang === 'ar' ? 'اختر قسماً أولاً' : lang === 'en' ? 'Select a class first' : 'Choisis d’abord une classe'}
              </Text>
            ) : eleves.length === 0 ? (
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                {lang === 'ar' ? 'لا يوجد تلاميذ' : lang === 'en' ? 'No students found' : 'Aucun élève trouvé'}
              </Text>
            ) : (
              <>
                {/* Whole-class shortcut at the top */}
                <TouchableOpacity onPress={() => selectAll(!allSelected)}
                  style={[cs.wholeClassBtn, { borderColor: allSelected ? theme.primary : theme.border, backgroundColor: allSelected ? theme.primary : theme.surface }]}>
                  <Users size={15} color={allSelected ? '#fff' : theme.textSoft} strokeWidth={2} />
                  <Text style={{ flex: 1, marginStart: 8, color: allSelected ? '#fff' : theme.text, fontWeight: '800', fontSize: 13 }}>
                    {lang === 'ar' ? 'كل القسم' : lang === 'en' ? 'Whole class' : 'Toute la classe'}
                  </Text>
                  {allSelected && <Check size={16} color="#fff" strokeWidth={3} />}
                </TouchableOpacity>

                {Object.keys(elevesByClasse).sort().map(classe => (
                  <View key={classe} style={{ marginTop: 8 }}>
                    {selectedClasses.length > 1 && (
                      <Text style={{ color: theme.textMuted, fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginVertical: 6 }}>{classe}</Text>
                    )}
                    {elevesByClasse[classe].map(e => {
                      const id = eleveKey(e)
                      const on = selectedEleveIds.has(id)
                      const hasParent = !!(e as any).parentUid
                      return (
                        <TouchableOpacity key={id} onPress={() => toggleEleve(id)}
                          style={[cs.eleveRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySurface : theme.white }]}>
                          <View style={[cs.checkbox, { borderColor: on ? theme.primary : theme.borderStrong, backgroundColor: on ? theme.primary : 'transparent' }]}>
                            {on && <Check size={12} color="#fff" strokeWidth={3} />}
                          </View>
                          <Text numberOfLines={1} style={{ flex: 1, marginStart: 10, color: theme.text, fontSize: 13, fontWeight: '600' }}>{eleveName(e)}</Text>
                          {!hasParent && (
                            <Text style={{ color: theme.warning, fontSize: 10, fontWeight: '700' }}>
                              {lang === 'ar' ? 'بدون ولي' : lang === 'en' ? 'no parent' : 'sans parent'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ))}
              </>
            )}

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
            {selectedTmpl && (
              <View style={{ marginTop: 12 }}>
                {/* Locked subject for single-subject teachers */}
                {lockMatiere && selectedTmpl.variables.some(v => v.key === 'matiere') && (
                  <View style={[cs.lockedRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Lock size={13} color={theme.textSoft} strokeWidth={2} />
                    <Text style={{ flex: 1, marginStart: 8, color: theme.textSoft, fontSize: 12, fontWeight: '600' }}>
                      {lang === 'ar' ? 'المادة' : lang === 'en' ? 'Subject' : 'Matière'}
                    </Text>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{teacherMatiere}</Text>
                  </View>
                )}

                {visibleVariables(selectedTmpl).map(v => (
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
                    ) : v.type === 'date' ? (
                      <TouchableOpacity onPress={() => setDatePickerKey(v.key)}
                        style={[cs.input, cs.dateBtn, { borderColor: theme.border, backgroundColor: theme.white }]}>
                        <CalendarDays size={17} color={dateValues[v.key] ? theme.primary : theme.textMuted} strokeWidth={2} />
                        <Text style={{ flex: 1, marginStart: 10, fontSize: 14, color: dateValues[v.key] ? theme.text : theme.textMuted }}>
                          {dateValues[v.key]
                            ? formatLongDate(dateValues[v.key], lang, true)
                            : (lang === 'ar' ? 'اختر التاريخ' : lang === 'en' ? 'Choose a date' : 'Choisir une date')}
                        </Text>
                      </TouchableOpacity>
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
            {body.includes(ELEVE_PLACEHOLDER) && (
              <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                {lang === 'ar'
                  ? 'سيُستبدل {élève} باسم كل تلميذ.'
                  : lang === 'en'
                    ? '"{élève}" is replaced by each student’s first name.'
                    : '« {élève} » sera remplacé par le prénom de chaque élève.'}
              </Text>
            )}

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

          <DatePickerSheet
            visible={datePickerKey != null}
            value={datePickerKey ? dateValues[datePickerKey] ?? null : null}
            onSelect={d => { if (datePickerKey) onPickDate(datePickerKey, d) }}
            onClose={() => setDatePickerKey(null)}
          />
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

  studentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  wholeClassBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 4 },
  eleveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 5 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  dateBtn: { flexDirection: 'row', alignItems: 'center' },
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
