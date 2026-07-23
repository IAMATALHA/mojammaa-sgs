/**
 * AdminStudentFileScreen — dossier élève 360°, strictement admin.
 *
 * C'est l'écran qui transforme les statistiques en outil de décision : l'admin
 * y voit, pour UN élève, ce qui a déclenché son signalement et de quoi juger
 * s'il faut agir. Il est alimenté par `getStatsStudentFile`, la callable la
 * plus sensible du lot — d'où la projection minimale côté serveur.
 *
 * Ce qui n'y figure PAS, volontairement : le code Massar (identifiant
 * technique, jamais affiché), la date de naissance, le parent rattaché, et les
 * notes individuelles. Le dossier sert à décider d'un accompagnement, pas à
 * rejouer le carnet de notes.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { httpsCallable } from 'firebase/functions'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle, BookOpen, CalendarCheck, GraduationCap, TrendingDown,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { functions } from '../../config/firebase'
import type { AdminStackParamList } from '../../navigation/types'
import type {
  AppliedScope, FollowUpMetrics, FollowUpPriority, FollowUpReason, ScopeStudent,
} from '../../types/stats'

interface SubjectLine { matiere: string; average: number; notesCount: number }

interface StudentFile {
  student: ScopeStudent
  bySubject: SubjectLine[]
  attendance: { absentDays: number; observedDays: number; lateCount: number }
  followUp: { reasons: FollowUpReason[]; metrics: FollowUpMetrics; priority: FollowUpPriority } | null
  applied: AppliedScope
}

export default function AdminStudentFileScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminStudentFile'>>()
  const { eleveId, scope } = route.params

  const [file, setFile] = useState<StudentFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await httpsCallable<{ eleveId: string; scope: AppliedScope }, StudentFile>(
        functions, 'getStatsStudentFile',
      )({ eleveId, scope })
      setFile(response.data)
      setError(null)
    } catch (err: any) {
      setError(err?.message || t('common.error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [eleveId, scope, t])

  useEffect(() => { void load() }, [load])

  const name = file ? `${file.student.prenom} ${file.student.nom}`.trim() : t('admin.statsStudentFile')

  return (
    <ScreenLayout title={name} showBack>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />
        }
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}

        {loading && !file ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : file ? (
          <>
            <View style={[styles.identity, { backgroundColor: theme.primarySurface, borderColor: theme.border }]}>
              <GraduationCap size={20} color={theme.primary} />
              <View style={styles.identityText}>
                <Text style={[styles.identityName, { color: theme.text }]}>{name}</Text>
                <Text style={[styles.identityMeta, { color: theme.textSoft }]}>
                  {[file.student.classe, file.student.niveau].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.identityAverage}>
                <Text style={[styles.identityAverageValue, { color: theme.primary }]}>
                  {file.student.average == null ? '—' : file.student.average}
                </Text>
                <Text style={[styles.identityAverageLabel, { color: theme.textMuted }]}>
                  {t('admin.avgGrade')}
                </Text>
              </View>
            </View>

            {file.followUp ? (
              <FollowUpCard followUp={file.followUp} theme={theme} t={t} />
            ) : (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsNoAlert')}</Text>
                <Text style={[styles.cardLead, { color: theme.textSoft }]}>{t('admin.statsNoAlertText')}</Text>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHead}>
                <CalendarCheck size={16} color={theme.info} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsAttendance')}</Text>
              </View>
              <View style={styles.metricRow}>
                <Metric
                  value={String(file.attendance.absentDays)}
                  label={t('admin.statsAbsentDays')}
                  theme={theme}
                />
                <Metric
                  value={String(file.attendance.observedDays)}
                  label={t('admin.statsObservedDays')}
                  theme={theme}
                />
                <Metric
                  value={String(file.attendance.lateCount)}
                  label={t('admin.statsLateCount')}
                  theme={theme}
                />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardHead}>
                <BookOpen size={16} color={theme.warning} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsBySubject')}</Text>
              </View>
              {file.bySubject.length === 0 ? (
                <Text style={[styles.cardLead, { color: theme.textSoft }]}>{t('common.noData')}</Text>
              ) : (
                // Trié du plus faible au plus fort côté serveur : ce que l'admin
                // cherche ici, c'est où l'élève décroche.
                file.bySubject.map(line => (
                  <View key={line.matiere} style={styles.subjectLine}>
                    <Text numberOfLines={1} style={[styles.subjectName, { color: theme.text }]}>
                      {line.matiere}
                    </Text>
                    <Text style={[styles.subjectCount, { color: theme.textMuted }]}>
                      {t('admin.statsNotesCount', { count: line.notesCount })}
                    </Text>
                    <Text style={[
                      styles.subjectAverage,
                      { color: line.average < 10 ? theme.danger : theme.text },
                    ]}>
                      {line.average}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  )
}

function FollowUpCard({ followUp, theme, t }: {
  followUp: NonNullable<StudentFile['followUp']>; theme: Theme; t: TFunction
}) {
  const tone = followUp.priority === 'high'
    ? { bg: theme.dangerSurface, fg: theme.danger }
    : followUp.priority === 'medium'
      ? { bg: theme.warningSurface, fg: theme.warning }
      : { bg: theme.infoSurface, fg: theme.info }

  return (
    <View style={[styles.card, { backgroundColor: tone.bg, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <AlertTriangle size={16} color={tone.fg} />
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('admin.statsWhyFollowed')}</Text>
        <View style={[styles.priorityPill, { backgroundColor: tone.fg }]}>
          <Text style={styles.priorityText}>{t(`admin.priority_${followUp.priority}`)}</Text>
        </View>
      </View>
      {followUp.reasons.map(reason => (
        <ReasonLine key={reason} reason={reason} metrics={followUp.metrics} theme={theme} t={t} />
      ))}
    </View>
  )
}

/** Chaque motif est accompagné de la valeur qui l'a déclenché — sinon l'admin
 *  doit croire l'application sur parole. */
function ReasonLine({ reason, metrics, theme, t }: {
  reason: FollowUpReason; metrics: FollowUpMetrics; theme: Theme; t: TFunction
}) {
  const evidence = (() => {
    switch (reason) {
      case 'low_average':
        return t('admin.evidenceLowAverage', { average: metrics.average ?? '—' })
      case 'declining':
        return t('admin.evidenceDeclining', {
          s1: metrics.semesterS1 ?? '—', s2: metrics.semesterS2 ?? '—', decline: metrics.decline ?? '—',
        })
      case 'absenteeism':
        return t('admin.evidenceAbsenteeism', {
          days: metrics.absentDays ?? 0, observed: metrics.observedDays ?? 0,
        })
      case 'homework_not_done':
        return t('admin.evidenceHomeworkNotDone', { count: metrics.homeworkNotDone ?? 0 })
      case 'homework_not_submitted':
        return t('admin.evidenceHomeworkNotSubmitted', { count: metrics.homeworkNotSubmitted ?? 0 })
      default:
        return ''
    }
  })()

  return (
    <View style={styles.reasonLine}>
      <TrendingDown size={13} color={theme.textSoft} />
      <View style={styles.reasonBody}>
        <Text style={[styles.reasonTitle, { color: theme.text }]}>{t(`admin.reason_${reason}`)}</Text>
        <Text style={[styles.reasonEvidence, { color: theme.textSoft }]}>{evidence}</Text>
      </View>
    </View>
  )
}

function Metric({ value, label, theme }: { value: string; label: string; theme: Theme }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 30, gap: 10 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  errorBox: { borderRadius: 10, padding: 11 },
  errorText: { fontSize: 12, fontWeight: '700' },
  identity: {
    flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 12, padding: 13,
  },
  identityText: { flex: 1, gap: 2 },
  identityName: { fontSize: 15, fontWeight: '900' },
  identityMeta: { fontSize: 11, fontWeight: '700' },
  identityAverage: { alignItems: 'flex-end' },
  identityAverageValue: { fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  identityAverageLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '900' },
  cardLead: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  priorityPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase' },
  reasonLine: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  reasonBody: { flex: 1, gap: 2 },
  reasonTitle: { fontSize: 12, fontWeight: '800' },
  reasonEvidence: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { fontSize: 9, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  subjectName: { flex: 1, fontSize: 12, fontWeight: '700' },
  subjectCount: { fontSize: 10, fontWeight: '700' },
  subjectAverage: { fontSize: 13, fontWeight: '900', minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
})
