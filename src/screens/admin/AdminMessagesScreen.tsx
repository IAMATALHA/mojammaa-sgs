import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView,
  ActivityIndicator, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRoute } from '@react-navigation/native'
import {
  X, Send, Inbox, PenSquare, AlertCircle, Users,
  GraduationCap, Search, CalendarDays, Check, Languages, ImagePlus,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeMessages, subscribeSentMessages, markAsRead, deleteMessage,
  broadcast, broadcastToParents, broadcastPersonalized, getRecipientsList,
  type MessageDoc, type MessageToType,
} from '../../services/messagesService'
import { listEleves, type EleveDoc } from '../../services/elevesService'
import { uploadAttachment, type Attachment } from '../../services/StorageService'
import DatePickerSheet from '../../components/DatePickerSheet'
import * as Haptics from 'expo-haptics'
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '../../data/messageTemplates'
import { confirmMessageDelete } from '../../utils/messageDeletePrompt'
import { formatTimestamp, formatLongDate, initialsOf } from '../../utils/format'
import { ELEVE_PLACEHOLDER, eleveKey, eleveName, elevePrenom } from '../../utils/eleveLabels'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import { dirStyle, localizedSubject, localizedBody } from '../../utils/arabicText'
import ReadReceipts from '../../components/ReadReceipts'

type Tab = 'inbox' | 'sent'
// Audiences entières (all/parents/teachers) → un seul doc broadcast.
// 'class'  → picker élève + perso {élève} (parité prof, sur n'importe quelle classe).
// 'people' → multi-sélection de personnes nommées (profs et/ou parents).
type TargetMode = 'all' | 'parents' | 'teachers' | 'class' | 'people'

interface Recipient { uid: string; nom: string; prenom: string; email: string; role: string; detail: string }

export default function AdminMessagesScreen() {
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
      profile.uid, profile.role || 'admin',
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
        style={[styles.card, theme.shadows.xs, {
          backgroundColor: isUrgent ? theme.dangerSurface : isUnread ? theme.white : theme.surface,
          borderColor: isUrgent ? theme.danger : isUnread ? theme.primary : theme.border,
        }]}>
        <View style={styles.cardRow}>
          <View style={[styles.avatar, { backgroundColor: isUrgent ? theme.white : tab === 'sent' ? theme.primarySurface : theme.violetSurface }]}>
            {tab === 'sent'
              ? <Send size={15} color={theme.primary} strokeWidth={2} />
              : <Text style={{ color: isUrgent ? theme.danger : theme.primary, fontFamily: theme.fonts.bold, fontSize: 13 }}>
                  {initialsOf(item.fromNom)}
                </Text>}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              {isUnread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: isUnread ? '800' : '600', fontSize: 14, flex: 1 }}>
                {tab === 'sent' ? (item.toLabel || '—') : (item.fromNom || '—')}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>{formatTimestamp(item.createdAt)}</Text>
            </View>
            <Text numberOfLines={1} style={[{ color: theme.text, fontWeight: isUnread ? '700' : '500', fontSize: 13, marginTop: 2 }, dirStyle(localizedSubject(item, lang))]}>
              {isUrgent ? '🚨 ' : ''}{localizedSubject(item, lang)}
            </Text>
            <Text numberOfLines={1} style={[{ color: theme.textSoft, fontSize: 12, marginTop: 2 }, dirStyle(localizedBody(item, lang))]}>{localizedBody(item, lang)}</Text>
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
      <View style={[styles.tabRow, { backgroundColor: theme.surfaceAlt }]}>
        <Pressable onPress={() => setTab('inbox')}
          style={[styles.tab, tab === 'inbox' && [{ backgroundColor: theme.card, borderColor: theme.border }, styles.tabActive, theme.shadows.xs]]}>
          <View style={styles.tabContent}>
            <Inbox size={14} color={tab === 'inbox' ? theme.primary : theme.textSoft} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: tab === 'inbox' ? theme.primary : theme.textSoft, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{t('parent.inbox')}</Text>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable onPress={() => setTab('sent')}
          style={[styles.tab, tab === 'sent' && [{ backgroundColor: theme.card, borderColor: theme.border }, styles.tabActive, theme.shadows.xs]]}>
          <View style={styles.tabContent}>
            <Send size={14} color={tab === 'sent' ? theme.primary : theme.textSoft} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: tab === 'sent' ? theme.primary : theme.textSoft, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{t('admin.sent')}</Text>
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

      <TouchableOpacity onPress={() => setShowCompose(true)} style={[styles.fab, { backgroundColor: theme.accent }]} activeOpacity={0.85}>
        <PenSquare size={22} color="#fff" strokeWidth={2} />
      </TouchableOpacity>

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
                <Text style={[{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 12 }, dirStyle(localizedSubject(detail, lang))]}>{localizedSubject(detail, lang)}</Text>
                <Text style={[{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 10 }, dirStyle(localizedBody(detail, lang))]}>{localizedBody(detail, lang)}</Text>
                {(detail.attachments || []).filter(a => a.mime?.startsWith('image/')).map(a => (
                  <Image key={a.url} source={{ uri: a.url }}
                    style={{ width: '100%', height: 280, borderRadius: 14, marginTop: 12, backgroundColor: theme.surface }}
                    resizeMode="contain" />
                ))}
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

      {showCompose && (
        <AdminComposeModal theme={theme} t={t} lang={lang} profile={profile} onClose={() => setShowCompose(false)} />
      )}
    </ScreenLayout>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Admin Compose — single-page form
   ════════════════════════════════════════════════════════════════════════ */

function AdminComposeModal({ theme, t, lang, profile, onClose }: {
  theme: Theme; t: any; lang: 'fr' | 'ar' | 'en'; profile: any; onClose: () => void
}) {
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [selectedPeople, setSelectedPeople] = useState<Recipient[]>([])
  const [roleFilter, setRoleFilter] = useState<'all' | 'parents' | 'teachers'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTmpl, setSelectedTmpl] = useState<MessageTemplate | null>(null)
  const [tmplOpen, setTmplOpen] = useState(false)
  const [vars, setVars] = useState<Record<string, string>>({})
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [withArabic, setWithArabic] = useState(false)   // version arabe (optionnelle)
  const [subjectAr, setSubjectAr] = useState('')
  const [bodyAr, setBodyAr] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)
  // Affiche (poster) optionnelle — uploadée vers annonces/{adminUid}/ à l'envoi.
  const [poster, setPoster] = useState<{ uri: string; name: string; mime: string } | null>(null)

  const [availableClasses, setAvailableClasses] = useState<string[]>([])
  const [allParents, setAllParents] = useState<Recipient[]>([])
  const [allTeachers, setAllTeachers] = useState<Recipient[]>([])
  const [loadingR, setLoadingR] = useState(true)

  // Class mode → student picker (parité prof, mais sur n'importe quelle classe).
  const [eleves, setEleves] = useState<EleveDoc[]>([])
  const [selectedEleveIds, setSelectedEleveIds] = useState<Set<string>>(new Set())
  const [loadingEleves, setLoadingEleves] = useState(false)

  // Date picker (variables de template de type 'date').
  const [datePickerKey, setDatePickerKey] = useState<string | null>(null)
  const [dateValues, setDateValues] = useState<Record<string, Date>>({})

  const loadRecipients = useCallback(async () => {
    setLoadingR(true)
    try {
      const data = await getRecipientsList()
      setAvailableClasses(data.classes)
      setAllParents(data.parents.map(p => ({ uid: p.uid, nom: p.nom, prenom: p.prenom, email: p.email, role: 'parent', detail: p.children.join(' · ') || '' })))
      setAllTeachers(data.teachers.map(p => ({ uid: p.uid, nom: p.nom, prenom: p.prenom, email: p.email, role: 'professeur', detail: p.classes.join(', ') || '' })))
    } catch {} finally { setLoadingR(false) }
  }, [])

  useEffect(() => { loadRecipients() }, [])

  // Charge les élèves quand le set de classes change ; sélection démarre vide.
  useEffect(() => {
    let cancelled = false
    if (targetMode !== 'class' || selectedClasses.length === 0) {
      setEleves([]); setSelectedEleveIds(new Set()); return
    }
    setLoadingEleves(true)
    listEleves({ classes: selectedClasses })
      .then(list => {
        if (cancelled) return
        setEleves(list)
        setSelectedEleveIds(new Set())
      })
      .catch(() => { if (!cancelled) setEleves([]) })
      .finally(() => { if (!cancelled) setLoadingEleves(false) })
    return () => { cancelled = true }
  }, [selectedClasses, targetMode])

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

  const togglePerson = (r: Recipient) => setSelectedPeople(prev =>
    prev.some(p => p.uid === r.uid) ? prev.filter(p => p.uid !== r.uid) : [...prev, r])

  const relevantTemplates = useMemo(() => {
    return MESSAGE_TEMPLATES.filter(tmpl => {
      if (targetMode === 'teachers') return tmpl.target === 'teachers' || tmpl.target === 'all'
      if (targetMode === 'parents' || targetMode === 'class') return tmpl.target === 'parents' || tmpl.target === 'all'
      if (targetMode === 'people') {
        const roles = new Set(selectedPeople.map(p => p.role))
        if (roles.size === 1 && roles.has('professeur')) return tmpl.target === 'teachers' || tmpl.target === 'all'
        if (roles.size === 1 && roles.has('parent')) return tmpl.target === 'parents' || tmpl.target === 'all'
        return true
      }
      return true
    })
  }, [targetMode, selectedPeople])

  // Liste des personnes pour la multi-sélection (filtrée par rôle + recherche).
  const peopleList = useMemo(() => {
    const base = roleFilter === 'parents' ? allParents : roleFilter === 'teachers' ? allTeachers : [...allParents, ...allTeachers]
    const q = searchQuery.toLowerCase().trim()
    const filtered = q
      ? base.filter(r => `${r.prenom} ${r.nom}`.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q))
      : base
    return filtered.slice(0, 40)
  }, [roleFilter, searchQuery, allParents, allTeachers])

  // {élève} n'a de sens qu'en mode classe (1 élève par destinataire). Ailleurs,
  // on injecte un terme générique pour éviter de laisser un placeholder brut.
  const genericChild = lang === 'ar' ? 'ابنكم' : lang === 'en' ? 'your child' : 'votre enfant'
  const fillVars = (nv: Record<string, string>) => ({
    ...nv,
    elevePrenom: targetMode === 'class' ? ELEVE_PLACEHOLDER : genericChild,
  })

  const pickTemplate = (tmpl: MessageTemplate) => {
    setSelectedTmpl(tmpl)
    setVars({})
    setDateValues({})
    setSubject(lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr)
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

  const classRecipientLabel =
    `${selectedEleves.length} ${lang === 'ar' ? 'تلميذ' : lang === 'en' ? 'student(s)' : 'élève(s)'} · ${selectedClasses.join(', ')}`

  const targetLabel = useMemo(() => {
    if (targetMode === 'all') return t('admin.everyone')
    if (targetMode === 'parents') return t('admin.parentsBroadcast')
    if (targetMode === 'teachers') return t('admin.teachers')
    if (targetMode === 'class') return classRecipientLabel
    if (targetMode === 'people') {
      if (selectedPeople.length === 1) return `${selectedPeople[0].prenom} ${selectedPeople[0].nom}`
      return `${selectedPeople.length} ${lang === 'ar' ? 'مستلم' : lang === 'en' ? 'recipient(s)' : 'destinataire(s)'}`
    }
    return ''
  }, [targetMode, selectedClasses, selectedPeople, classRecipientLabel, lang, t])

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && (
    targetMode === 'all' || targetMode === 'parents' || targetMode === 'teachers' ||
    (targetMode === 'class' && parentUids.length > 0) ||
    (targetMode === 'people' && selectedPeople.length > 0)
  )

  const pickPoster = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('teacher.permissionDenied'), t('teacher.cameraAccessDenied'))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      })
      const asset = result.assets?.[0]
      if (result.canceled || !asset) return
      setPoster({
        uri:  asset.uri,
        name: asset.fileName || `affiche_${Date.now()}.jpg`,
        mime: asset.mimeType || 'image/jpeg',
      })
    } catch {
      Alert.alert(t('common.error'), t('teacher.imageSelectFailed'))
    }
  }

  const handleSend = async () => {
    if (!profile || !canSend) return
    setSending(true)
    const fromNom = `${profile.prenom} ${profile.nom}`.trim()
    const fromRole = profile.role || 'admin'
    const sender = { uid: profile.uid, nom: profile.nom, prenom: profile.prenom }
    const arSubject = withArabic && subjectAr.trim() ? subjectAr.trim() : undefined
    const arBody    = withArabic && bodyAr.trim()    ? bodyAr.trim()    : undefined
    try {
      let reach = 0

      // Upload de l'affiche AVANT les writes Firestore (échec → rien d'envoyé).
      let attachments: Attachment[] | undefined
      if (poster) {
        attachments = [await uploadAttachment(poster.uri, 'annonces', profile.uid, poster.name, poster.mime)]
      }

      if (targetMode === 'class') {
        if (body.includes(ELEVE_PLACEHOLDER)) {
          // Personnalisé : un message par élève → son propre parent.
          const recipients = selectedEleves
            .filter(e => (e as any).parentUid)
            .map(e => ({
              parentUid: (e as any).parentUid as string,
              body:      body.split(ELEVE_PLACEHOLDER).join(elevePrenom(e)).trim(),
              bodyAr:    arBody ? arBody.split(ELEVE_PLACEHOLDER).join(elevePrenom(e)).trim() : undefined,
              label:     `${eleveName(e)} · ${e.classe}`,
              eleveId:   e.codeMassar,
            }))
          const r = await broadcastPersonalized({
            recipients, subject: subject.trim(), subjectAr: arSubject, classe: selectedClasses.join(', '),
            urgent, category: 'announcement', teacher: sender, fromRole, attachments,
          })
          reach = r.parentsTargeted
        } else {
          // Générique : un seul message aux parents des élèves sélectionnés.
          const r = await broadcastToParents({
            parentUids, label: classRecipientLabel, classe: selectedClasses.join(', '),
            subject: subject.trim(), body: body.trim(),
            subjectAr: arSubject, bodyAr: arBody, urgent, category: 'announcement',
            teacher: sender, fromRole, attachments,
          })
          reach = r.parentsTargeted
        }
      } else if (targetMode === 'people') {
        await broadcast({
          type: selectedPeople.length === 1 ? 'direct' : 'announcement',
          subject: subject.trim(), body: body.trim(),
          subjectAr: arSubject, bodyAr: arBody,
          fromId: profile.uid, fromNom, fromRole,
          toType: 'user', toIds: selectedPeople.map(p => p.uid), toLabel: targetLabel,
          priority: urgent ? 'urgent' : 'normal', category: 'announcement',
          attachments,
        })
        reach = selectedPeople.length
      } else {
        // Audiences entières : all / parents / teachers.
        let toType: MessageToType = 'all'
        let toIds: string[] = []
        if (targetMode === 'parents') { toType = 'parents'; toIds = allParents.map(p => p.uid) }
        else if (targetMode === 'teachers') { toType = 'teachers'; toIds = allTeachers.map(p => p.uid) }
        await broadcast({
          type: 'announcement', subject: subject.trim(), body: body.trim(),
          subjectAr: arSubject, bodyAr: arBody,
          fromId: profile.uid, fromNom, fromRole,
          toType, toIds, toLabel: targetLabel,
          priority: urgent ? 'urgent' : 'normal', category: 'announcement',
          attachments,
        })
        reach = toIds.length || allParents.length + allTeachers.length
      }

      Alert.alert(
        t('admin.sent'),
        `${targetLabel}${reach ? ` · ${reach}` : ''}`,
        [{ text: 'OK', onPress: onClose }],
      )
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setSending(false) }
  }

  const switchMode = (mode: TargetMode) => {
    setTargetMode(mode)
    setSelectedTmpl(null); setSubject(''); setBody(''); setVars({}); setDateValues({})
    setSubjectAr(''); setBodyAr('')
    setPoster(null)
  }

  const TARGET_OPTS: { mode: TargetMode; label: string; icon: any }[] = [
    { mode: 'people', label: lang === 'ar' ? 'أشخاص' : lang === 'en' ? 'People' : 'Personnes', icon: Search },
    { mode: 'class', label: t('tabs.classes'), icon: GraduationCap },
    { mode: 'parents', label: 'Parents', icon: Users },
    { mode: 'teachers', label: t('admin.teachers'), icon: GraduationCap },
    { mode: 'all', label: t('admin.everyone'), icon: Users },
  ]

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView edges={['top']} style={[cs.container, { backgroundColor: theme.bg }]}>
          <View style={cs.header}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{t('teacher.newMessage')}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={theme.text} strokeWidth={2} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Target */}
            <Text style={[cs.label, { color: theme.textSoft }]}>{t('teacher.recipients')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {TARGET_OPTS.map(opt => {
                const sel = targetMode === opt.mode
                return (
                  <TouchableOpacity key={opt.mode} onPress={() => switchMode(opt.mode)}
                    style={[cs.chip, { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' }]}>
                    <opt.icon size={12} color={sel ? '#fff' : theme.textSoft} strokeWidth={2} />
                    <Text style={{ color: sel ? '#fff' : theme.text, fontWeight: '700', fontSize: 12, marginStart: 4 }}>{opt.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* Class chips + student picker */}
            {targetMode === 'class' && (
              <>
                <View style={[cs.chipRow, { marginTop: 10 }]}>
                  {loadingR ? <ActivityIndicator color={theme.primary} /> : availableClasses.map(c => {
                    const sel = selectedClasses.includes(c)
                    return (
                      <TouchableOpacity key={c} onPress={() => toggleClass(c)}
                        style={[cs.chip, { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' }]}>
                        <Text style={{ color: sel ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{c}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

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
              </>
            )}

            {/* People — multi-select search */}
            {targetMode === 'people' && (
              <View style={{ marginTop: 10 }}>
                <View style={[cs.chipRow, { marginBottom: 8 }]}>
                  {([
                    { key: 'all' as const, label: lang === 'ar' ? 'الكل' : lang === 'en' ? 'All' : 'Tous' },
                    { key: 'parents' as const, label: 'Parents' },
                    { key: 'teachers' as const, label: t('admin.teachers') },
                  ]).map(f => {
                    const sel = roleFilter === f.key
                    return (
                      <TouchableOpacity key={f.key} onPress={() => setRoleFilter(f.key)}
                        style={[cs.chip, { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' }]}>
                        <Text style={{ color: sel ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{f.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <View style={[cs.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Search size={16} color={theme.textSoft} strokeWidth={2} />
                  <TextInput value={searchQuery} onChangeText={setSearchQuery}
                    placeholder={t('parent.searchMessages')} placeholderTextColor={theme.textMuted}
                    style={{ flex: 1, color: theme.text, fontSize: 13, marginStart: 8, paddingVertical: 0 }} />
                  {searchQuery ? <Pressable onPress={() => setSearchQuery('')}><X size={16} color={theme.textSoft} /></Pressable> : null}
                </View>

                {selectedPeople.length > 0 && (
                  <View style={[cs.chipRow, { marginBottom: 6 }]}>
                    {selectedPeople.map(p => (
                      <TouchableOpacity key={p.uid} onPress={() => togglePerson(p)}
                        style={[cs.chip, { borderColor: theme.primary, backgroundColor: theme.primarySurface }]}>
                        <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 12 }}>{p.prenom} {p.nom}</Text>
                        <X size={12} color={theme.primary} strokeWidth={2} style={{ marginStart: 4 }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {loadingR ? <ActivityIndicator color={theme.primary} style={{ marginTop: 12 }} /> :
                  peopleList.map(r => {
                    const on = selectedPeople.some(p => p.uid === r.uid)
                    return (
                      <Pressable key={r.uid} onPress={() => togglePerson(r)}
                        style={[cs.personRow, { backgroundColor: on ? theme.primarySurface : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                        <View style={[cs.checkbox, { borderColor: on ? theme.primary : theme.borderStrong, backgroundColor: on ? theme.primary : 'transparent' }]}>
                          {on && <Check size={12} color="#fff" strokeWidth={3} />}
                        </View>
                        <View style={[cs.personAv, { backgroundColor: r.role === 'parent' ? '#52B788' : '#D95B00', marginStart: 8 }]}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>{(r.prenom[0] || '').toUpperCase()}{(r.nom[0] || '').toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginStart: 8 }}>
                          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{r.prenom} {r.nom}</Text>
                          {r.detail ? <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 1 }}>{r.detail}</Text> : null}
                        </View>
                      </Pressable>
                    )
                  })
                }
              </View>
            )}

            {/* Templates — dropdown */}
            {relevantTemplates.length > 0 && (
              <>
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
                {tmplOpen && relevantTemplates.map(tmpl => {
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
              </>
            )}

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
                      <TextInput value={vars[v.key] || ''} onChangeText={val => updateVar(v.key, val)}
                        placeholder={v.placeholder} placeholderTextColor={theme.textMuted}
                        keyboardType={v.type === 'number' ? 'numeric' : 'default'}
                        style={[cs.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]} />
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Subject + Body */}
            <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.subject')}</Text>
            <TextInput value={subject} onChangeText={setSubject}
              placeholder={t('compose.subjectPlaceholder')} placeholderTextColor={theme.textMuted} maxLength={120}
              style={[cs.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }, dirStyle(subject)]} />

            <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.body')}</Text>
            <TextInput value={body} onChangeText={setBody}
              placeholder={t('teacher.writeMessage')} placeholderTextColor={theme.textMuted}
              multiline textAlignVertical="top" maxLength={2000}
              style={[cs.input, cs.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }, dirStyle(body)]} />
            {targetMode === 'class' && body.includes(ELEVE_PLACEHOLDER) && (
              <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                {lang === 'ar'
                  ? 'سيُستبدل {élève} باسم كل تلميذ.'
                  : lang === 'en'
                    ? '"{élève}" is replaced by each student’s first name.'
                    : '« {élève} » sera remplacé par le prénom de chaque élève.'}
              </Text>
            )}

            {/* Version arabe (optionnelle) — affichée aux familles dont
                l'app est en arabe ; sinon la version principale est montrée. */}
            <Pressable onPress={() => setWithArabic(v => !v)}
              style={[cs.urgentRow, { backgroundColor: withArabic ? theme.primarySurface : theme.surface, borderColor: withArabic ? theme.primary : theme.border }]}>
              <Languages size={16} color={withArabic ? theme.primary : theme.textSoft} strokeWidth={2} />
              <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '700', fontSize: 13 }}>
                {lang === 'ar' ? 'نسخة عربية (اختياري)' : lang === 'en' ? 'Arabic version (optional)' : 'Version arabe (optionnel)'}
              </Text>
              <View style={[cs.dot, { backgroundColor: withArabic ? theme.primary : theme.borderStrong }]} />
            </Pressable>
            {withArabic && (
              <>
                <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>الموضوع</Text>
                <TextInput value={subjectAr} onChangeText={setSubjectAr}
                  placeholder="مثال: اجتماع الأولياء" placeholderTextColor={theme.textMuted} maxLength={120}
                  style={[cs.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, writingDirection: 'rtl', textAlign: 'right' }]} />
                <Text style={[cs.label, { color: theme.textSoft, marginTop: 14 }]}>الرسالة</Text>
                <TextInput value={bodyAr} onChangeText={setBodyAr}
                  placeholder="نص الرسالة بالعربية…" placeholderTextColor={theme.textMuted}
                  multiline textAlignVertical="top" maxLength={2000}
                  style={[cs.input, cs.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, writingDirection: 'rtl', textAlign: 'right' }]} />
              </>
            )}

            {/* Affiche (image) — comme les "avis aux parents" papier, mais
                dans le feed. Une seule image, pleine largeur côté lecteur. */}
            {poster ? (
              <View style={[cs.posterPreview, { borderColor: theme.border }]}>
                <Image source={{ uri: poster.uri }} style={cs.posterImage} resizeMode="cover" />
                <Pressable onPress={() => setPoster(null)} hitSlop={8}
                  style={[cs.posterRemove, { backgroundColor: theme.danger }]}>
                  <X size={14} color="#fff" strokeWidth={2.5} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickPoster}
                style={[cs.urgentRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ImagePlus size={16} color={theme.textSoft} strokeWidth={2} />
                <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '700', fontSize: 13 }}>
                  {lang === 'ar' ? 'إضافة ملصق (صورة)' : lang === 'en' ? 'Add a poster (image)' : 'Ajouter une affiche (image)'}
                </Text>
              </Pressable>
            )}

            {/* Urgent */}
            <Pressable onPress={() => setUrgent(u => !u)}
              style={[cs.urgentRow, { backgroundColor: urgent ? theme.dangerSurface : theme.surface, borderColor: urgent ? theme.danger : theme.border }]}>
              <AlertCircle size={16} color={urgent ? theme.danger : theme.textSoft} strokeWidth={2} />
              <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('teacher.markUrgent')}</Text>
              <View style={[cs.dot, { backgroundColor: urgent ? theme.danger : theme.borderStrong }]} />
            </Pressable>
          </ScrollView>

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
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  personAv: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  selectedPerson: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, marginBottom: 4 },
  urgentRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 14 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginBottom: 36, paddingVertical: 14, borderRadius: 12 },
  studentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  wholeClassBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 4 },
  eleveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 5 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dateBtn: { flexDirection: 'row', alignItems: 'center' },
  posterPreview: { marginTop: 14, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  posterImage: { width: '100%', height: 180 },
  posterRemove: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
})

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 14 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 11 },
  tabActive: { borderWidth: StyleSheet.hairlineWidth },
  tabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginStart: 6 },
  card: { padding: 12, borderRadius: 20, borderWidth: 1, marginBottom: 9 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginEnd: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  center: { paddingVertical: 40, alignItems: 'center' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center' },
  urgentTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
})
