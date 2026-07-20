import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Paperclip,
  Send,
  Trash2,
  Upload,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  isHomeworkAwaitingReview,
  submitHomeworkProof,
  subscribeHomeworkSubmission,
  type HomeworkSubmission,
  type HomeworkSubmissionStatus,
} from '../../services/homeworkSubmissionsService'
import { uploadAttachment, type Attachment } from '../../services/StorageService'

interface Props {
  homework: {
    id: string
    classeId?: string
    teacherId?: string
    eleveId?: string
    eleveNom?: string
    dateLimite?: string
  }
}

const MAX_ATTACHMENTS = 5

export default function HomeworkParentSubmission({ homework }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const identityReady = !!(
    profile?.uid
    && homework.id
    && homework.eleveId
    && homework.classeId
    && homework.teacherId
  )

  useEffect(() => {
    if (!homework.id || !homework.eleveId) {
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribeHomeworkSubmission(
      homework.id,
      homework.eleveId,
      value => {
        setSubmission(value)
        setAttachments(value?.attachments || [])
        setComment(value?.parentComment || '')
        setError('')
        setLoading(false)
      },
      err => {
        setError(err.message)
        setLoading(false)
      },
    )
  }, [homework.id, homework.eleveId])

  const status = submission?.status || 'pending'
  const canSend = status !== 'graded' && status !== 'excused'
  const statusLabel = t(`homeworkTracking.status.${status}`)
  const isAwaiting = isHomeworkAwaitingReview(status)

  const addUploaded = (attachment: Attachment) => {
    setAttachments(current => [...current, attachment].slice(0, MAX_ATTACHMENTS))
  }

  const uploadAsset = async (asset: { uri: string; name: string; mime: string }) => {
    if (!profile?.uid || !homework.eleveId) return
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert(t('common.error'), t('homeworkTracking.maxAttachments', { count: MAX_ATTACHMENTS }))
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadAttachment(
        asset.uri,
        'homework-submissions',
        profile.uid,
        asset.name,
        asset.mime,
        {
          homeworkId: homework.id,
          eleveId: homework.eleveId,
          parentUid: profile.uid,
        },
      )
      addUploaded(uploaded)
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('homeworkTracking.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const pickPhoto = async (camera: boolean) => {
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert(t('teacher.permissionDenied'), t('teacher.cameraAccessDenied'))
        return
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.82 })
      const asset = !result.canceled ? result.assets?.[0] : null
      if (!asset) return
      await uploadAsset({
        uri: asset.uri,
        name: asset.fileName || `devoir_${Date.now()}.jpg`,
        mime: asset.mimeType || 'image/jpeg',
      })
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('teacher.imageSelectFailed'))
    }
  }

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      const asset = !result.canceled ? result.assets?.[0] : null
      if (!asset) return
      await uploadAsset({
        uri: asset.uri,
        name: asset.name,
        mime: asset.mimeType || 'application/octet-stream',
      })
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('teacher.fileSelectFailed'))
    }
  }

  const submit = async () => {
    if (!identityReady || !profile || !homework.eleveId || !homework.classeId || !homework.teacherId) return
    if (attachments.length === 0) {
      Alert.alert(t('homeworkTracking.proofRequiredTitle'), t('homeworkTracking.proofRequired'))
      return
    }
    setSaving(true)
    try {
      await submitHomeworkProof(
        {
          homeworkId: homework.id,
          eleveId: homework.eleveId,
          classeId: homework.classeId,
          parentUid: profile.uid,
          teacherId: homework.teacherId,
        },
        attachments,
        comment,
        submission?.status,
      )
      Alert.alert(t('homeworkTracking.sentTitle'), t('homeworkTracking.sentMessage'))
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('homeworkTracking.submitFailed'))
    } finally {
      setSaving(false)
    }
  }

  const statusTone = useMemo(() => {
    if (status === 'graded' || status === 'excused') return theme.success
    if (status === 'not_done' || status === 'not_submitted') return theme.danger
    if (isAwaiting) return theme.info
    return theme.warning
  }, [status, isAwaiting, theme])

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.titleRow}>
        <View style={[styles.titleIcon, { backgroundColor: theme.primarySurface }]}>
          <Upload size={18} color={theme.primary} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('homeworkTracking.parentTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSoft }]}>
            {homework.eleveNom || t('homeworkTracking.yourChild')}
          </Text>
        </View>
      </View>

      <View style={[styles.statusBox, { borderColor: statusTone + '55', backgroundColor: statusTone + '12' }]}>
        {status === 'graded' ? <CheckCircle2 size={17} color={statusTone} /> : <View style={[styles.dot, { backgroundColor: statusTone }]} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusLabel, { color: statusTone }]}>{statusLabel}</Text>
          <Text style={[styles.statusHint, { color: theme.textSoft }]}>
            {isAwaiting
              ? t('homeworkTracking.awaitingHint')
              : status === 'graded'
                ? t('homeworkTracking.validatedHint')
                : status === 'excused'
                  ? t('homeworkTracking.excusedHint')
                  : t('homeworkTracking.parentActionHint')}
          </Text>
        </View>
      </View>

      {error ? <Text style={{ color: theme.danger, fontSize: 12, marginTop: 10 }}>{t('homeworkTracking.loadError')}</Text> : null}

      {attachments.length > 0 ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          {attachments.map((attachment, index) => (
            <View key={`${attachment.url}_${index}`} style={[styles.attachment, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
              {attachment.mime.startsWith('image/') ? (
                <Image source={{ uri: attachment.url }} style={styles.thumb} />
              ) : (
                <View style={[styles.fileIcon, { backgroundColor: theme.primarySurface }]}>
                  <FileText size={18} color={theme.primary} />
                </View>
              )}
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(attachment.url)}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12.5, fontWeight: '700' }}>{attachment.name}</Text>
                <ExternalLink size={12} color={theme.textSoft} style={{ marginTop: 3 }} />
              </Pressable>
              {canSend ? (
                <Pressable
                  onPress={() => setAttachments(current => current.filter((_, i) => i !== index))}
                  hitSlop={8}
                  accessibilityLabel={t('common.delete')}
                >
                  <Trash2 size={17} color={theme.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canSend ? (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>{t('homeworkTracking.proofTitle')}</Text>
          <View style={styles.actions}>
            <Pressable disabled={uploading} onPress={() => pickPhoto(true)}
              style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
              <Camera size={16} color={theme.primary} />
              <Text style={[styles.secondaryText, { color: theme.text }]}>{t('homeworkTracking.takePhoto')}</Text>
            </Pressable>
            <Pressable disabled={uploading} onPress={pickFile}
              style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
              <Paperclip size={16} color={theme.primary} />
              <Text style={[styles.secondaryText, { color: theme.text }]}>{t('homeworkTracking.addFile')}</Text>
            </Pressable>
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
            placeholder={t('homeworkTracking.commentPlaceholder')}
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surfaceAlt, color: theme.text }]}
          />
          <Pressable
            disabled={saving || uploading || !identityReady}
            onPress={submit}
            style={[styles.submitButton, {
              backgroundColor: theme.primary,
              opacity: saving || uploading || !identityReady ? 0.55 : 1,
            }]}
          >
            {saving || uploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Send size={17} color="#fff" />}
            <Text style={styles.submitText}>
              {isAwaiting ? t('homeworkTracking.updateProof') : t('homeworkTracking.sendProof')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 24, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 13 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusLabel: { fontSize: 13, fontWeight: '800' },
  statusHint: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderWidth: 1, borderRadius: 11 },
  thumb: { width: 42, height: 42, borderRadius: 8 },
  fileIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { marginTop: 15, marginBottom: 8, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  secondaryText: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, minHeight: 68, marginTop: 10, fontSize: 13, textAlignVertical: 'top' },
  submitButton: { minHeight: 48, borderRadius: 12, marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
})
