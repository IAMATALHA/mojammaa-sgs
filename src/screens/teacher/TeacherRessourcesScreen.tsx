/**
 * TeacherRessourcesScreen — bibliothèque de supports d'une classe.
 * Liste (titre, matière, PJ, compteur de vues) + création via bottom sheet
 * (titre, description, pièces jointes image/PDF — upload eager comme les
 * devoirs, vers ressources/{teacherUid}/).
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Alert, ActivityIndicator,
  TextInput, TouchableOpacity, Image, Linking,
} from 'react-native'
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'
import { useRoute } from '@react-navigation/native'
import type { TeacherRoute } from '../../navigation/types'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Eye, FolderOpen, Paperclip, Plus, Trash2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import BottomSheet from '../../components/BottomSheet'
import PressableScale from '../../components/PressableScale'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  createRessource, deleteRessource, subscribeRessourcesForClasses,
  type RessourceDoc,
} from '../../services/ressourcesService'
import { uploadAttachment, type Attachment } from '../../services/StorageService'
import { formatTimestamp } from '../../utils/format'
import { dirStyle } from '../../utils/arabicText'
import type { UserProfile } from '../../types'

export default function TeacherRessourcesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<TeacherRoute<'TeacherRessources'>>()
  const { classe } = route.params ?? { classe: '' }
  const { profile } = useAuth()

  const [ressources, setRessources] = useState<RessourceDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!classe) return
    return subscribeRessourcesForClasses(
      [classe],
      list => { setRessources(list); setLoading(false); setError(null) },
      err  => { setError(err.message); setLoading(false) },
    )
  }, [classe])

  const confirmDelete = (item: RessourceDoc) => {
    Alert.alert(t('resources.deleteConfirm'), item.titre, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => { if (item.id) deleteRessource(item.id).catch(() => {}) },
      },
    ])
  }

  const renderItem = ({ item, index }: { item: RessourceDoc; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 12) * 30).springify().damping(18)}
      layout={Layout.springify()}
    >
      <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          {item.matiere ? (
            <View style={[styles.subjectTag, { backgroundColor: theme.primarySurface }]}>
              <Text style={{ color: theme.primary, fontSize: 10.5, fontWeight: '800' }}>{item.matiere}</Text>
            </View>
          ) : null}
          <Text style={{ color: theme.textSoft, fontSize: 11, flex: 1, textAlign: 'right' }}>
            {formatTimestamp(item.createdAt)}
          </Text>
          {item.teacherId === profile?.uid ? (
            <PressableScale onPress={() => confirmDelete(item)} scaleDown={0.85} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={{ padding: 4, marginStart: 8 }}>
              <Trash2 size={16} color={theme.textMuted} strokeWidth={2} />
            </PressableScale>
          ) : null}
        </View>
        <Text style={[{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15, marginTop: 6 }, dirStyle(item.titre)]}>
          {item.titre}
        </Text>
        {item.description ? (
          <Text numberOfLines={2} style={[{ color: theme.textSoft, fontSize: 12.5, lineHeight: 18, marginTop: 4 }, dirStyle(item.description)]}>
            {item.description}
          </Text>
        ) : null}
        {item.attachments.map(a => (
          <TouchableOpacity key={a.url} activeOpacity={0.8}
            onPress={() => { if (/^https:\/\//i.test(a.url)) Linking.openURL(a.url).catch(() => {}) }}
            style={[styles.attachRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Paperclip size={14} color={theme.primary} strokeWidth={2.2} />
            <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12.5, fontWeight: '600', marginStart: 8 }}>
              {a.name}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.metaRow}>
          <Eye size={13} color={theme.textMuted} strokeWidth={2} />
          <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: '600', marginStart: 5 }}>
            {t('resources.viewsCount', { count: (item.viewedBy || []).length })}
          </Text>
        </View>
      </View>
    </Animated.View>
  )

  return (
    <ScreenLayout title={`${t('resources.title')} · ${classe}`}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && ressources.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : ressources.length === 0 ? (
        <View style={styles.empty}>
          <FolderOpen size={34} color={theme.textMuted} strokeWidth={1.6} />
          <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15, marginTop: 12 }}>
            {t('resources.empty')}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 }}>
            {t('resources.emptyMsg')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={ressources}
          keyExtractor={item => item.id || item.titre}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 90 }}
        />
      )}

      {/* FAB nouvelle ressource */}
      <PressableScale onPress={() => setShowCreate(true)} scaleDown={0.9}
        accessibilityRole="button" accessibilityLabel={t('resources.newResource')}
        style={[styles.fab, { backgroundColor: theme.primary }]}>
        <Plus size={26} color="#fff" strokeWidth={2.4} />
      </PressableScale>

      <CreateRessourceSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        classe={classe}
        profile={profile}
      />
    </ScreenLayout>
  )
}

function CreateRessourceSheet({ visible, onClose, classe, profile }: {
  visible: boolean
  onClose: () => void
  classe: string
  profile: UserProfile | null
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => { setTitre(''); setDescription(''); setAttachments([]) }

  const pickImage = async () => {
    if (!profile) return
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert(t('teacher.permissionDenied'), t('teacher.cameraAccessDenied'))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      if (result.canceled || !result.assets?.[0]) return
      const a = result.assets[0]
      setUploading(true)
      try {
        const att = await uploadAttachment(a.uri, 'ressources', profile.uid, a.fileName || `image_${Date.now()}.jpg`, a.mimeType || 'image/jpeg')
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
    if (!profile) return
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
        const att = await uploadAttachment(a.uri, 'ressources', profile.uid, a.name, a.mimeType || 'application/octet-stream')
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

  const submit = async () => {
    if (!profile || !titre.trim() || attachments.length === 0) return
    setSaving(true)
    try {
      await createRessource({
        titre:       titre.trim(),
        description: description.trim() || undefined,
        matiere:     profile.matiere || undefined,
        classeId:    classe,
        attachments,
        teacherId:   profile.uid,
        teacherNom:  `${profile.prenom} ${profile.nom}`.trim(),
      })
      Alert.alert(t('resources.created'))
      reset()
      onClose()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = !!titre.trim() && attachments.length > 0 && !uploading && !saving

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose() }}>
      <View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17 }}>
          {t('resources.newResource')} · {classe}
        </Text>

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.titleLabel')}</Text>
        <TextInput
          value={titre} onChangeText={setTitre} maxLength={100}
          accessibilityLabel={t('teacher.titleLabel')}
          placeholder={t('resources.titlePlaceholder')} placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(titre)]} />

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.descriptionLabel')}</Text>
        <TextInput
          value={description} onChangeText={setDescription} multiline maxLength={500}
          accessibilityLabel={t('teacher.descriptionLabel')}
          placeholder={t('teacher.devoirDescPlaceholder')} placeholderTextColor={theme.textMuted}
          style={[styles.input, styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, dirStyle(description)]} />

        <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.attachments')}</Text>
        <View style={styles.attachBtnRow}>
          <TouchableOpacity onPress={pickImage} disabled={uploading}
            style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}>
            <Ionicons name="image-outline" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{t('teacher.gallery')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickPdf} disabled={uploading}
            style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}>
            <Ionicons name="document-outline" size={18} color={theme.primary} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{t('teacher.pdfFile')}</Text>
          </TouchableOpacity>
        </View>

        {uploading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <ActivityIndicator color={theme.primary} />
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>{t('teacher.uploading')}</Text>
          </View>
        ) : null}

        {attachments.map((a, i) => (
          <View key={a.url + i} style={[styles.attachItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {a.mime.startsWith('image/') ? (
              <Image source={{ uri: a.url }} accessibilityLabel={a.name} style={styles.attachThumb} />
            ) : (
              <View style={[styles.attachThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySurface }]}>
                <Ionicons name="document" size={20} color={theme.primary} />
              </View>
            )}
            <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12.5, fontWeight: '600', marginStart: 10 }}>
              {a.name}
            </Text>
            <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
              <Ionicons name="close-circle" size={20} color={theme.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={submit} disabled={!canSubmit} activeOpacity={0.85}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.surfaceAlt }]}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <Text style={{ color: canSubmit ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 14 }}>
                {t('resources.publish')}
              </Text>
            )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  card:        { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center' },
  subjectTag:  { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginEnd: 8 },
  attachRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  fab:         { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  loading:     { paddingVertical: 40, alignItems: 'center' },
  empty:       { paddingVertical: 60, alignItems: 'center' },
  errorBox:    { padding: 12, borderRadius: 10, marginBottom: 12 },

  label:       { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textarea:    { minHeight: 70, maxHeight: 110, textAlignVertical: 'top' },
  attachBtnRow:{ flexDirection: 'row', gap: 8 },
  attachBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  attachItem:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 8 },
  attachThumb: { width: 36, height: 36, borderRadius: 8 },
  submitBtn:   { alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 13, marginTop: 16 },
})
