import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  Check,
  CheckCheck,
  CircleAlert,
  ExternalLink,
  FileText,
  Users,
  X,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { subscribeEleves, type EleveDoc } from '../../services/elevesService'
import {
  markAllHomeworkAsGraded,
  reviewHomeworkSubmission,
  subscribeHomeworkSubmissions,
  type HomeworkSubmission,
  type HomeworkSubmissionStatus,
} from '../../services/homeworkSubmissionsService'

interface Props {
  homework: {
    id: string
    classeId?: string
    teacherId?: string
  }
  readOnly?: boolean
}

type ReviewStatus = 'graded' | 'not_submitted' | 'not_done' | 'excused'

const ACTIONS: { status: ReviewStatus; icon: typeof Check }[] = [
  { status: 'graded', icon: Check },
  { status: 'not_submitted', icon: X },
  { status: 'not_done', icon: CircleAlert },
  { status: 'excused', icon: CheckCheck },
]

function studentId(eleve: EleveDoc): string {
  return eleve.codeMassar || eleve.id || ''
}

function studentName(eleve: EleveDoc): string {
  return [eleve.prenomLatin || eleve.prenom, eleve.nomLatin || eleve.nom].filter(Boolean).join(' ')
}

function statusTone(status: HomeworkSubmissionStatus | undefined, theme: Theme): string {
  if (status === 'graded' || status === 'excused') return theme.success
  if (status === 'not_done' || status === 'not_submitted') return theme.danger
  if (status === 'submitted' || status === 'submitted_late') return theme.info
  return theme.warning
}

export default function HomeworkTeacherTracking({ homework, readOnly = false }: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [eleves, setEleves] = useState<EleveDoc[]>([])
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    if (!homework.classeId || !homework.id) {
      setLoading(false)
      return
    }
    let studentsReady = false
    let submissionsReady = false
    const finish = () => {
      if (studentsReady && submissionsReady) setLoading(false)
    }
    const unsubStudents = subscribeEleves(
      [homework.classeId],
      list => {
        setEleves([...list].sort((a, b) => studentName(a).localeCompare(studentName(b), 'fr')))
        studentsReady = true
        finish()
      },
      err => {
        setError(err.message)
        studentsReady = true
        finish()
      },
    )
    const unsubSubmissions = subscribeHomeworkSubmissions(
      homework.id,
      list => {
        setSubmissions(list)
        submissionsReady = true
        finish()
      },
      err => {
        setError(err.message)
        submissionsReady = true
        finish()
      },
    )
    return () => {
      unsubStudents()
      unsubSubmissions()
    }
  }, [homework.classeId, homework.id])

  const byStudent = useMemo(
    () => new Map(submissions.map(row => [row.eleveId, row])),
    [submissions],
  )
  const summary = useMemo(() => ({
    graded: submissions.filter(row => row.status === 'graded').length,
    awaiting: submissions.filter(row => row.status === 'submitted' || row.status === 'submitted_late').length,
    problems: submissions.filter(row => row.status === 'not_done' || row.status === 'not_submitted').length,
  }), [submissions])

  const update = async (eleve: EleveDoc, status: ReviewStatus) => {
    if (!profile?.uid || !homework.classeId || !homework.teacherId) return
    const eleveId = studentId(eleve)
    setSavingId(eleveId)
    try {
      await reviewHomeworkSubmission(
        {
          homeworkId: homework.id,
          eleveId,
          classeId: homework.classeId,
          parentUid: eleve.parentUid || '',
          teacherId: homework.teacherId,
        },
        status,
        byStudent.has(eleveId),
      )
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('homeworkTracking.reviewFailed'))
    } finally {
      setSavingId('')
    }
  }

  const markAll = () => {
    if (!profile?.uid || !homework.classeId || !homework.teacherId) return
    Alert.alert(
      t('homeworkTracking.markAllTitle'),
      t('homeworkTracking.markAllConfirm', { count: eleves.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('homeworkTracking.markAllAction'),
          onPress: async () => {
            setBulkSaving(true)
            try {
              await markAllHomeworkAsGraded({
                id: homework.id,
                classeId: homework.classeId!,
                teacherId: homework.teacherId!,
              }, eleves, new Set(submissions.map(row => row.eleveId)))
            } catch (err: any) {
              Alert.alert(t('common.error'), err?.message || t('homeworkTracking.reviewFailed'))
            } finally {
              setBulkSaving(false)
            }
          },
        },
      ],
    )
  }

  if (profile?.uid && homework.teacherId && profile.uid !== homework.teacherId && !readOnly) return null

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: theme.primarySurface }]}>
          <Users size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('homeworkTracking.teacherTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSoft }]}>
            {t('homeworkTracking.studentCount', { count: eleves.length })}
          </Text>
        </View>
        {!readOnly ? (
          <Pressable disabled={bulkSaving || loading || eleves.length === 0} onPress={markAll}
            style={[styles.bulkButton, { backgroundColor: theme.primary, opacity: bulkSaving || loading ? 0.55 : 1 }]}>
            {bulkSaving ? <ActivityIndicator size="small" color="#fff" /> : <CheckCheck size={15} color="#fff" />}
            <Text style={styles.bulkText}>{t('homeworkTracking.markAllAction')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.summary}>
        <Summary value={summary.graded} label={t('homeworkTracking.validatedShort')} color={theme.success} theme={theme} />
        <Summary value={summary.awaiting} label={t('homeworkTracking.awaitingShort')} color={theme.info} theme={theme} />
        <Summary value={summary.problems} label={t('homeworkTracking.alertsShort')} color={theme.danger} theme={theme} />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : error ? (
        <Text style={{ color: theme.danger, fontSize: 12, paddingVertical: 12 }}>{t('homeworkTracking.loadError')}</Text>
      ) : eleves.length === 0 ? (
        <Text style={{ color: theme.textSoft, fontSize: 12.5, paddingVertical: 16 }}>{t('homeworkTracking.noStudents')}</Text>
      ) : (
        <View style={{ marginTop: 12 }}>
          {eleves.map((eleve, index) => {
            const eleveId = studentId(eleve)
            const row = byStudent.get(eleveId)
            const status = row?.status || 'pending'
            const tone = statusTone(status, theme)
            const isSaving = savingId === eleveId
            return (
              <View key={eleveId} style={[styles.studentRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={styles.studentTop}>
                  <View style={[styles.avatar, { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>
                      {(eleve.prenomLatin || eleve.prenom || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '700' }}>{studentName(eleve)}</Text>
                    <View style={styles.statusLine}>
                      <View style={[styles.statusDot, { backgroundColor: tone }]} />
                      <Text style={{ color: tone, fontSize: 11.5, fontWeight: '700' }}>
                        {t(`homeworkTracking.status.${status}`)}
                      </Text>
                    </View>
                  </View>
                  {isSaving ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                </View>

                {row?.parentComment ? (
                  <Text style={[styles.comment, { color: theme.textSoft, backgroundColor: theme.surfaceAlt }]}>
                    {row.parentComment}
                  </Text>
                ) : null}

                {row?.attachments?.length ? (
                  <View style={styles.proofs}>
                    {row.attachments.map((attachment, attachmentIndex) => (
                      <Pressable key={`${attachment.url}_${attachmentIndex}`} onPress={() => Linking.openURL(attachment.url)}
                        style={[styles.proof, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
                        {attachment.mime.startsWith('image/')
                          ? <Image source={{ uri: attachment.url }} style={styles.proofImage} />
                          : <FileText size={16} color={theme.primary} />}
                        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 11.5, flex: 1 }}>{attachment.name}</Text>
                        <ExternalLink size={12} color={theme.textSoft} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {!readOnly ? (
                  <View style={styles.actions}>
                    {ACTIONS.map(action => {
                      const Icon = action.icon
                      const selected = status === action.status
                      const actionColor = action.status === 'graded'
                        ? theme.success
                        : action.status === 'excused'
                          ? theme.info
                          : theme.danger
                      return (
                        <Pressable
                          key={action.status}
                          disabled={isSaving}
                          onPress={() => update(eleve, action.status)}
                          style={[styles.action, {
                            borderColor: selected ? actionColor : theme.border,
                            backgroundColor: selected ? actionColor + '14' : theme.surfaceAlt,
                          }]}
                        >
                          <Icon size={13} color={selected ? actionColor : theme.textSoft} />
                          <Text numberOfLines={1} style={{ color: selected ? actionColor : theme.textSoft, fontSize: 10.5, fontWeight: '700' }}>
                            {t(`homeworkTracking.action.${action.status}`)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function Summary({ value, label, color, theme }: { value: number; label: string; color: string; theme: Theme }) {
  return (
    <View style={[styles.summaryItem, { backgroundColor: theme.surfaceAlt }]}>
      <Text style={{ color, fontWeight: '800', fontSize: 17 }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 10.5 }}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11.5, marginTop: 2 },
  bulkButton: { minHeight: 38, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  summary: { flexDirection: 'row', gap: 7, marginTop: 13 },
  summaryItem: { flex: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 9 },
  loading: { paddingVertical: 30, alignItems: 'center' },
  studentRow: { paddingVertical: 13 },
  studentTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  comment: { fontSize: 11.5, lineHeight: 16, borderRadius: 8, padding: 8, marginTop: 8 },
  proofs: { gap: 6, marginTop: 8 },
  proof: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  proofImage: { width: 28, height: 28, borderRadius: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  action: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
})
