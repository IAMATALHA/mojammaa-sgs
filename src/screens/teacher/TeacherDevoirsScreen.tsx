/**
 * Liste + création de devoirs. Features Phase B :
 *   - Photo du tableau (caméra) ou image galerie → upload Firebase Storage
 *   - PDF joint via document picker → upload Firebase Storage
 *   - "Réutiliser un devoir" : pioche un devoir existant et préremplit le
 *     formulaire (le prof n'a plus qu'à ajuster la date et la classe)
 *
 * Convention `attachments` sur le doc devoir :
 *   attachments: [{ url, name, mime, size }]
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Image, StatusBar,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TeacherRoute, TeacherStackParamList } from '../../navigation/types';
import { toDocs } from '../../services/firestore';
import {
  collection, getDocs, query, where, addDoc, serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { uploadAttachment, type Attachment } from '../../services/StorageService';
import { broadcastToClasses } from '../../services/messagesService';
import type { UserProfile } from '../../types';
import { academicPeriodForDate, currentAndNextAcademicYears, localISODate } from '../../utils/academicPeriod'
import { homeworkCommandId, manageHomework } from '../../services/homework-management'

export interface Devoir {
  id:           string
  titre:        string
  description?: string
  type:         string
  classeId:     string
  teacherId:    string
  teacherNom?:  string
  dateLimite:   string
  attachments?: Attachment[]
  createdAt?:   Timestamp
  updatedAt?: Timestamp
  cancelledAt?: Timestamp
}

const TYPES = ['Maison', 'Contrôle', 'Révision', 'Projet']

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-')
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
  } catch { return iso }
}

export default function TeacherDevoirsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<TeacherRoute<'TeacherDevoirsDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>();
  const { profile } = useAuth();
  const routeClasse = route.params?.classe
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<Devoir | null>(null)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const removeCommands = useRef(new Map<string, string>())
  const homeworkYears = currentAndNextAcademicYears()
  const homeworkYearsKey = homeworkYears.join('|')

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(query(
        collection(db, 'devoirs'),
        where('teacherId', '==', profile.uid),
        where('academicYear', 'in', homeworkYears),
      ))
      let list = toDocs<Devoir>(snap)
      if (routeClasse) list = list.filter(x => x.classeId === routeClasse)
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setDevoirs(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les devoirs.')
    } finally {
      setLoading(false)
    }
  }, [profile, homeworkYearsKey, routeClasse])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const openCreate    = () => { setEditing(false); setPrefill(null); setModalOpen(true) }
  const openWithReuse = (d: Devoir) => { setEditing(false); setPrefill(d); setModalOpen(true) }
  const remove = (d: Devoir) => Alert.alert(t('homeworkManagement.remove'), t('homeworkManagement.confirmRemove'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('homeworkManagement.remove'), style: 'destructive', onPress: async () => {
      if (removing) return
      setRemoving(true)
      try {
        const commandId = removeCommands.current.get(d.id) || homeworkCommandId()
        removeCommands.current.set(d.id, commandId)
        await manageHomework({ id: d.id, commandId, version: d.updatedAt?.toMillis() || 0, action: 'remove' })
        removeCommands.current.delete(d.id)
        await load()
      } catch { Alert.alert(t('common.error'), t('homeworkManagement.failed')) }
      finally { setRemoving(false) }
    } },
  ])

  // Tap sur la carte → page entière (description complète + pièces jointes
  // consultables). Le chip « Réutiliser » garde la priorité (bouton imbriqué).
  const openView = (d: Devoir) => {
    navigation.navigate('TeacherDevoirView', {
      devoir: {
        id: d.id, titre: d.titre, description: d.description, type: d.type,
        classeId: d.classeId, teacherId: d.teacherId, teacherNom: d.teacherNom, dateLimite: d.dateLimite,
        attachments: d.attachments,
      },
    })
  }

  const renderItem = ({ item }: { item: Devoir }) => (
    <TouchableOpacity activeOpacity={0.75} onPress={() => openView(item)}
      style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.title, { color: theme.primary }]} numberOfLines={1}>{item.titre}</Text>
        <View style={[styles.typeTag, { backgroundColor: theme.primarySurface }]}>
          <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '800' }}>{item.type.toUpperCase()}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={[styles.desc, { color: theme.text }]} numberOfLines={2}>{item.description}</Text>
      ) : null}
      {item.attachments && item.attachments.length > 0 ? (
        <View style={styles.attachRow}>
          <Ionicons name="attach" size={13} color={theme.textSoft} />
          <Text style={{ fontSize: 12, color: theme.textSoft, marginStart: 4 }}>
            {item.attachments.length} pièce{item.attachments.length > 1 ? 's' : ''} jointe{item.attachments.length > 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={[styles.classText, { color: theme.text }]}>{item.classeId}</Text>
        <Text style={[styles.dueDate, { color: theme.textSoft }]}>{t('teacher.dueDate', { date: formatDate(item.dateLimite) })}</Text>
      </View>
      {item.cancelledAt ? <Text style={{ color: theme.danger }}>{t('homeworkManagement.cancelled')}</Text> : <View style={styles.chipRow}>
        <TouchableOpacity disabled={removing} style={styles.reuseChip} onPress={() => { setEditing(true); setPrefill(item); setModalOpen(true) }}>
          <Text style={{ color: theme.primary }}>{t('homeworkManagement.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={removing} style={styles.reuseChip} onPress={() => remove(item)}>
          <Text style={{ color: theme.danger }}>{t('homeworkManagement.remove')}</Text>
        </TouchableOpacity>
      </View>}
      <TouchableOpacity onPress={() => openWithReuse(item)} style={[styles.reuseChip, { backgroundColor: theme.primarySurface }]}>
        <Ionicons name="copy-outline" size={12} color={theme.primary} />
        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700', marginStart: 4 }}>
          {t('teacher.reuse')}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout title={t('teacher.myHomework')}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && devoirs.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : devoirs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noHomeworkYet')}{'\n'}{t('teacher.touchPlus')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={devoirs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel={t('teacher.newHomework')}
      >
        <Text style={[styles.fabText, { color: theme.white }]}>+</Text>
      </TouchableOpacity>

      <CreateDevoirModal
        visible={modalOpen}
        defaultClasse={routeClasse || profile?.classe}
        prefill={prefill}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); load() }}
      />
    </ScreenLayout>
  );
}

// ─── Helpers for date chips ──────────────────────────────────────────────────
function generateDateChips(count: number): { iso: string; label: string; sub: string }[] {
  const chips: { iso: string; label: string; sub: string }[] = []
  const now = new Date()
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  for (let i = 1; i <= count; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const iso = localISODate(d)
    chips.push({
      iso,
      label: `${dayNames[d.getDay()]} ${d.getDate()}`,
      sub: monthNames[d.getMonth()],
    })
  }
  return chips
}

function getAvailableClasses(profile: UserProfile | null | undefined): string[] {
  if (!profile) return []
  if (Array.isArray(profile.classes) && profile.classes.length > 0) return profile.classes
  if (typeof profile.classe === 'string' && profile.classe) return [profile.classe]
  return []
}

// ─── Create devoir modal ─────────────────────────────────────────────────────
export function CreateDevoirModal({
  visible, defaultClasse, prefill, editing = false, onClose, onCreated,
}: {
  visible:       boolean
  defaultClasse?: string
  prefill?:      Devoir | null
  editing?: boolean
  onClose:       () => void
  onCreated:     () => void
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [titre,       setTitre]       = useState('');
  const [description, setDescription] = useState('');
  const [type,        setType]        = useState<string>(TYPES[0]);
  const [classeId,    setClasseId]    = useState(defaultClasse || '');
  const [dateLimite,  setDateLimite]  = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [notify, setNotify] = useState(true)
  const commandId = useRef<string | null>(null)
  const commandPayload = useRef('')
  const savingRef = useRef(false)
  const dismiss = () => { if (!savingRef.current && !uploading) onClose() }

  const dateChips = useMemo(() => generateDateChips(30), [])
  const availableClasses = useMemo(() => getAvailableClasses(profile), [profile])

  useEffect(() => {
    if (!visible) return
    commandId.current = null
    commandPayload.current = ''
    setNotify(true)
    if (prefill) {
      setTitre(prefill.titre)
      setDescription(prefill.description || '')
      setType(prefill.type || TYPES[0])
      setClasseId(prefill.classeId || defaultClasse || '')
      setDateLimite(editing ? prefill.dateLimite : '')
      setAttachments(prefill.attachments ? [...prefill.attachments] : [])
    } else {
      setTitre(''); setDescription(''); setType(TYPES[0])
      setClasseId(defaultClasse || ''); setDateLimite(''); setAttachments([])
    }
    setErr('')
  }, [visible, prefill, defaultClasse, editing])

  const pickPhoto = async (fromCamera: boolean) => {
    if (!profile || savingRef.current) return
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (permission.status !== 'granted') {
          Alert.alert(t('teacher.permissionDenied'), t('teacher.cameraAccessDenied'))
          return
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({  mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      if (result.canceled || !result.assets?.[0]) return
      const a = result.assets[0]
      const name = a.fileName || `photo_${Date.now()}.jpg`
      setUploading(true)
      try {
        const att = await uploadAttachment(a.uri, 'devoirs', profile.uid, name, a.mimeType || 'image/jpeg')
        setAttachments(prev => [...prev, att])
      } catch (e: any) {
        Alert.alert(t('common.error'), e?.message || t('teacher.uploadFailed'))
      } finally {
        setUploading(false)
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('teacher.imageSelectFailed'))
    }
  }

  const pickPdf = async () => {
    if (!profile || savingRef.current) return
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !result.assets?.[0]) return
      const a = result.assets[0]
      setUploading(true)
      try {
        const att = await uploadAttachment(a.uri, 'devoirs', profile.uid, a.name, a.mimeType || 'application/octet-stream')
        setAttachments(prev => [...prev, att])
      } catch (e: any) {
        Alert.alert(t('common.error'), e?.message || t('teacher.uploadFailed'))
      } finally {
        setUploading(false)
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('teacher.fileSelectFailed'))
    }
  }

  const removeAttachment = (i: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== i))
  }

  const submit = async () => {
    if (!profile || savingRef.current || uploading) return
    if (!titre.trim())    { setErr(t('teacher.titleRequired')); return }
    if (!classeId.trim()) { setErr(t('teacher.classRequired')); return }
    if (!dateLimite)      { setErr(t('teacher.invalidDate')); return }
    setSaving(true); setErr('');
    savingRef.current = true
    try {
      if (editing && prefill) {
        const payload = JSON.stringify({ titre, description, type, dateLimite, attachments, notify })
        if (commandPayload.current !== payload) commandId.current = null
        commandPayload.current = payload
        commandId.current ??= homeworkCommandId()
        await manageHomework({ id: prefill.id, commandId: commandId.current,
          version: prefill.updatedAt?.toMillis() || 0, action: 'edit', notify,
          changes: { titre: titre.trim(), description: description.trim(), type, dateLimite, attachments },
        })
        onCreated()
        return
      }
      await addDoc(collection(db, 'devoirs'), {
        titre:       titre.trim(),
        description: description.trim(),
        type,
        classeId:    classeId.trim(),
        teacherId:   profile.uid,
        teacherNom:  `${profile.prenom} ${profile.nom}`,
        dateLimite,
        attachments,
        ...academicPeriodForDate(dateLimite),
        createdAt:   serverTimestamp(),
      })

      // Notifier les parents de la classe : push + message dans l'inbox.
      // Best-effort : on n'échoue pas la création du devoir si l'envoi rate.
      try {
        await broadcastToClasses({
          classes:  [classeId.trim()],
          subject:  t('teacher.newHomeworkNotifTitle', { subject: profile.matiere || '' }).trim(),
          body:     t('teacher.newHomeworkNotifBody', { title: titre.trim(), date: dateLimite }),
          category: 'homework',
          teacher:  { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
        })
      } catch (notificationError: any) {
        console.warn('[TeacherDevoirs] homework notification failed', {
          code: notificationError?.code || null,
          message: notificationError?.message || String(notificationError),
        })
      }

      onCreated()
    } catch (e: any) {
      console.error('[TeacherDevoirs] homework creation failed', {
        code: e?.code || null,
        message: e?.message || String(e),
      })
      const message = editing ? t('homeworkManagement.failed') : (e?.message || t('teacher.createFailed'))
      setErr(message)
      Alert.alert(t('common.error'), message)
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0) + 16 }]}>
          <TouchableOpacity onPress={dismiss} disabled={saving || uploading}>
            <Text style={{ color: theme.text, fontSize: 16 }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {editing ? t('homeworkManagement.edit') : prefill ? t('teacher.reuseHomework') : t('teacher.newHomework')}
          </Text>
          <TouchableOpacity onPress={submit} disabled={saving || uploading}>
            {saving
              ? <ActivityIndicator color={theme.primary} />
              : <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>{t(editing ? 'homeworkManagement.save' : 'teacher.create')}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView pointerEvents={saving ? 'none' : 'auto'} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {prefill && !editing ? (
            <View style={[styles.prefillBanner, { backgroundColor: theme.primarySurface }]}>
              <Ionicons name="copy-outline" size={14} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginStart: 6, flex: 1 }}>
                {t('teacher.prefillNote', { title: prefill.titre })}
              </Text>
            </View>
          ) : null}

          {editing && <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: notify }}
            disabled={saving} onPress={() => setNotify(value => !value)} style={{ paddingVertical: 12 }}>
            <Text style={{ color: theme.text }}>{notify ? '☑' : '☐'} {t('homeworkManagement.notify')}</Text>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>{t('homeworkManagement.notifyHint')}</Text>
          </TouchableOpacity>}

          {err ? (
            <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
              <Text style={{ color: theme.danger, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.titleLabel')}</Text>
          <TextInput
            editable={!saving}
            value={titre} onChangeText={setTitre}
            accessibilityLabel={t('teacher.titleLabel')}
            placeholder={t('teacher.devoirTitlePlaceholder')}
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            maxLength={100}
          />

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>{t('teacher.descriptionLabel')}</Text>
          <TextInput
            editable={!saving}
            value={description} onChangeText={setDescription}
            accessibilityLabel={t('teacher.descriptionLabel')}
            placeholder={t('teacher.devoirDescPlaceholder')}
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, minHeight: 90 }]}
            multiline textAlignVertical="top"
            maxLength={1000}
          />

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>{t('teacher.typeLabel')}</Text>
          <View style={styles.chipRow}>
            {TYPES.map(tp => {
              const active = type === tp
              return (
                <TouchableOpacity key={tp}
                  onPress={() => setType(tp)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tp}
                  style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}
                >
                  <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>{tp}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Class selector — scrollable chips */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>{t('teacher.targetClass')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {(editing && prefill ? [prefill.classeId] : availableClasses).map(c => {
              const active = classeId === c
              return (
                <TouchableOpacity key={c}
                  disabled={editing}
                  onPress={() => setClasseId(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c}
                  style={[styles.chip, {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primary : 'transparent',
                  }]}
                >
                  <Text style={{ color: active ? '#fff' : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 13 }}>{c}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Date picker — scrollable day chips, today+ only */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>{t('teacher.deadlineLabel')}</Text>
          {!!dateLimite && <Text style={{ color: theme.text }}>{formatDate(dateLimite)}</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {dateChips.map(dc => {
              const active = dateLimite === dc.iso
              return (
                <TouchableOpacity key={dc.iso}
                  onPress={() => setDateLimite(dc.iso)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${dc.label} ${dc.sub}`}
                  style={[styles.dateChip, {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primary : theme.surface,
                  }]}
                >
                  <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>{dc.label}</Text>
                  <Text style={{ color: active ? 'rgba(255,255,255,0.8)' : theme.textSoft, fontSize: 10, textAlign: 'center', marginTop: 2 }}>{dc.sub}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Pièces jointes */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>{t('teacher.attachments')}</Text>
          <View style={styles.attachBtnRow}>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={() => pickPhoto(true)}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>{t('teacher.boardPhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={() => pickPhoto(false)}
              disabled={uploading}
            >
              <Ionicons name="image-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>{t('teacher.gallery')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={pickPdf}
              disabled={uploading}
            >
              <Ionicons name="document-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>{t('teacher.pdfFile')}</Text>
            </TouchableOpacity>
          </View>

          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>{t('teacher.uploading')}</Text>
            </View>
          ) : null}

          {attachments.length > 0 && (
            <View style={{ marginTop: 12 }}>
              {attachments.map((a, i) => (
                <View key={a.url + i} style={[styles.attachItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {a.mime.startsWith('image/') ? (
                    <Image source={{ uri: a.url }} accessibilityLabel={a.name} style={styles.attachThumb} />
                  ) : (
                    <View style={[styles.attachThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySurface }]}>
                      <Ionicons name="document" size={22} color={theme.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginStart: 10 }}>
                    <Text style={[styles.attachName, { color: theme.text }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[styles.attachMeta, { color: theme.textSoft }]} numberOfLines={1}>
                      {a.mime}{a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAttachment(i)} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
                    <Ionicons name="close-circle" size={22} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  listContainer: { paddingBottom: 100 },
  card:          { padding: 12, marginBottom: 8, borderRadius: 8, borderWidth: 1 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:         { fontSize: 15, fontWeight: '800', flex: 1, marginEnd: 8 },
  typeTag:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  desc:          { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  attachRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  metaRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  classText:     { fontSize: 13, fontWeight: '600' },
  dueDate:       { fontSize: 12 },
  reuseChip:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  loading:       { paddingVertical: 40, alignItems: 'center' },
  empty:         { paddingVertical: 60, alignItems: 'center' },
  errorBox:      { padding: 12, borderRadius: 10, marginBottom: 12 },
  fab: {
    position: 'absolute', bottom: 24, end: 24,
    width: 54, height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 5,
  },
  fabText: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginTop: -2 },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  modalTitle:  { fontSize: 16, fontWeight: '700' },
  modalBody:   { padding: 16, paddingBottom: 60 },
  label:       { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  input:       { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  dateChip:    { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, minWidth: 60, alignItems: 'center' as const },

  prefillBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 12 },

  attachBtnRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  attachBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, flexGrow: 1 },
  attachBtnText: { fontSize: 13, fontWeight: '600' },

  attachItem:    { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  attachThumb:   { width: 44, height: 44, borderRadius: 8 },
  attachName:    { fontSize: 13, fontWeight: '600' },
  attachMeta:    { fontSize: 11, marginTop: 2 },
});
