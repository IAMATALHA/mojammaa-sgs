/**
 * Saisie de l'appel "en 1 clic" :
 *   - tout le monde est PRÉSENT par défaut (carte verte)
 *   - le prof ne tape que les ABSENTS (carte rouge)
 *   - l'horloge marque les RETARDS (carte orange)
 *   - chaque choix sauvegarde un brouillon local ; « Sauvegarder » le valide
 *   - la file persistante soumet au serveur une opération rejouable sans doublon
 *
 * Schéma absences (consistent avec mojammaa-admin) :
 *   absences/{eleveId_date_seanceKey} = {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut, professorId, createdAt
 *   }
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Alert, ActivityIndicator,
} from 'react-native'
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { TeacherStackParamList, TeacherRoute } from '../../navigation/types'
import PressableScale from '../../components/PressableScale'
import { collection, doc } from 'firebase/firestore'
import { getAbsenceRequestsForClassDate, type AbsenceRequestDoc } from '../../services/absenceRequestsService'
import { attendanceDrafts, loadAttendance } from '../../services/attendance-drafts'
import type { AttendanceDraft } from '../../services/attendance-drafts-core'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import BehaviorSheet from '../../components/BehaviorSheet'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { localISODate } from '../../utils/academicPeriod'
import type { WeeklySlot } from '../../services/scheduleService'
interface EleveLite {
  id:     string
  nom:    string
  prenom: string
}

interface ResolvedLesson {
  slot: WeeklySlot
  seance: string
}

export default function TeacherAttendanceScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const route = useRoute<TeacherRoute<'TeacherAttendance'>>()
  const lessonKey = route.params?.lessonKey ?? ''
  const { profile } = useAuth()

  const [lesson, setLesson] = useState<ResolvedLesson | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [eleves,  setEleves]  = useState<EleveLite[]>([])
  const [absent,  setAbsent]  = useState<Set<string>>(new Set())  // ids des absents
  const [late,    setLate]    = useState<Set<string>>(new Set())  // ids des élèves en retard
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [requests, setRequests] = useState<AbsenceRequestDoc[]>([])  // déclarations parents (classe+date)
  const [error,   setError]   = useState<string | null>(null)
  const [behaviorFor, setBehaviorFor] = useState<EleveLite | null>(null)  // élève de la fiche comportement

  const classe = lesson?.slot.classe ?? ''
  const seance = lesson?.seance ?? ''
  const date = useMemo(() => route.params?.date || localISODate(), [route.key, route.params?.date])
  const [draft, setDraft] = useState<AttendanceDraft | null>(null)
  const draftRef = useRef<AttendanceDraft | null>(null)
  const loadGeneration = useRef(0)
  const [storing, setStoring] = useState(false)

  const applyDraft = useCallback((value: AttendanceDraft) => {
    draftRef.current = value
    setDraft(value)
    setLesson({ slot: value.slot, seance: value.seance })
    setEleves(value.rows)
    setAbsent(new Set(value.rows.filter(row => row.status === 'absent').map(row => row.id)))
    setLate(new Set(value.rows.filter(row => row.status === 'retard').map(row => row.id)))
  }, [])

  const load = useCallback(async (replaceDraft = false) => {
    if (!profile?.uid || !lessonKey) { setScheduleLoading(false); return }
    const generation = ++loadGeneration.current
    setLoading(true); setError(null); setScheduleError(null)
    try {
      const cached = await attendanceDrafts.get(profile.uid, date, lessonKey)
      if (generation !== loadGeneration.current) return
      if (cached && !replaceDraft) { applyDraft(cached); setScheduleLoading(false); setLoading(false) }
      const beforeFetch = draftRef.current
      const bundle = await loadAttendance(lessonKey, date)
      if (generation !== loadGeneration.current) return
      const current = draftRef.current
      if (replaceDraft || (current === beforeFetch && (!current || current.state === 'synced'))) {
        const next: AttendanceDraft = {
          uid: profile.uid, lessonKey, date, slot: bundle.slot, seance: bundle.seance,
          rows: bundle.students, state: 'synced', updatedAt: Date.now(),
        }
        await attendanceDrafts.put(next)
        if (generation !== loadGeneration.current) return
        if (draftRef.current === current) applyDraft(next)
      }
      void getAbsenceRequestsForClassDate(bundle.slot.classe, date)
        .then(list => { if (generation === loadGeneration.current) setRequests(list) }).catch(() => {})
    } catch (e: any) {
      if (generation !== loadGeneration.current) return
      if (!draftRef.current) setScheduleError(t(
        e?.message === 'attendance-scope-changed' ? 'offlineAttendance.scopeChanged'
          : e?.message === 'attendance-not-started' ? 'offlineAttendance.notStarted'
            : e?.message === 'attendance-expired' ? 'offlineAttendance.expired'
              : ['functions/permission-denied', 'functions/failed-precondition', 'functions/invalid-argument'].includes(e?.code)
                ? 'offlineAttendance.reloadFailed' : 'offlineAttendance.firstLoad'))
      else if (replaceDraft) setError(t('offlineAttendance.reloadFailed'))
    } finally {
      if (generation === loadGeneration.current) { setLoading(false); setScheduleLoading(false) }
    }
  }, [profile?.uid, lessonKey, date, applyDraft, t])

  useEffect(() => {
    draftRef.current = null; setDraft(null); setLesson(null); setScheduleLoading(true)
    void load()
    return () => { loadGeneration.current++ }
  }, [load])

  useEffect(() => attendanceDrafts.subscribe(() => {
    if (!profile?.uid) return
    void attendanceDrafts.get(profile.uid, date, lessonKey).then(next => {
      const current = draftRef.current
      if (next && current?.state === 'queued' && next.operationId === current.operationId) applyDraft(next)
    }).catch(() => {})
  }), [profile?.uid, date, lessonKey, applyDraft])

  const toggleStatus = (id: string, status: 'absent' | 'retard') => {
    const current = draftRef.current
    if (!current || saving || current.state === 'queued' || current.state === 'review') return
    void Haptics.selectionAsync().catch(() => {})
    const next: AttendanceDraft = {
      ...current, state: 'draft', operationId: undefined, updatedAt: Date.now(),
      rows: current.rows.map(row => row.id === id ? { ...row, status: row.status === status ? 'present' : status } : row),
    }
    applyDraft(next); setStoring(true)
    void attendanceDrafts.put(next).then(() => {
      if (draftRef.current?.updatedAt === next.updatedAt) setStoring(false)
    }).catch(() => { setStoring(false); setError(t('offlineAttendance.storageFailed')) })
  }
  const toggleAbsent = (id: string) => toggleStatus(id, 'absent')
  const toggleLate = (id: string) => toggleStatus(id, 'retard')

  const save = async () => {
    const current = draftRef.current
    if (!current || !current.rows.length || saving || current.state === 'queued' || current.state === 'review') return
    setSaving(true); setError(null)
    const queued: AttendanceDraft = { ...current, state: 'queued', operationId: doc(collection(db, '_ids')).id, updatedAt: Date.now() }
    applyDraft(queued)
    let persisted = false
    try {
      await attendanceDrafts.put(queued)
      persisted = true
      await attendanceDrafts.flush(current.uid)
      const result = await attendanceDrafts.get(current.uid, date, lessonKey)
      if (result) applyDraft(result)
      Alert.alert(t(result?.state === 'synced' ? 'teacher.attendanceSaved' : result?.state === 'review' ? 'offlineAttendance.reviewTitle' : 'offlineAttendance.queuedTitle'),
        t(result?.state === 'synced' ? 'communication.alertsQueued' : result?.state === 'review' ? 'offlineAttendance.review' : 'offlineAttendance.queued'))
    } catch {
      if (!persisted) applyDraft(current)
      setError(t('offlineAttendance.storageFailed'))
    } finally { setSaving(false) }
  }

  const declaredFor = (eleveId: string): AbsenceRequestDoc | undefined =>
    requests.find(r => r.eleveId === eleveId && r.status !== 'declined')

  const renderEleve = ({ item, index }: { item: EleveLite; index: number }) => {
    const isAbsent = absent.has(item.id)
    const isLate = late.has(item.id)
    const statusColor = isAbsent ? theme.danger : isLate ? theme.warning : theme.success
    const statusLabel = isAbsent
      ? t('teacher.absentTapCancel')
      : isLate ? t('teacher.lateTapCancel') : t('teacher.presentLabel')
    return (
      <Animated.View
        entering={FadeInDown.delay(index * 30).springify().damping(18)}
        layout={Layout.springify()}
      >
        <PressableScale
          onPress={() => toggleAbsent(item.id)}
          scaleDown={0.97}
          haptic={false}  // on a déjà un impact dans toggleAbsent
          accessibilityRole="button"
          accessibilityState={{ selected: isAbsent }}
          accessibilityLabel={`${item.prenom} ${item.nom}. ${statusLabel}`}
          accessibilityHint={t('teacher.markAbsentHint')}
          style={[
            styles.card,
            {
              backgroundColor: isAbsent
                ? theme.dangerSurface
                : isLate ? theme.warningSurface : theme.white,
              borderColor: isAbsent ? theme.danger : isLate ? theme.warning : theme.border,
            },
          ]}
        >
          <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.eleveName, { color: theme.text, fontFamily: theme.fonts.bold }]}>
              {item.prenom} {item.nom}
            </Text>
            <Text style={[styles.eleveStatus, { color: statusColor, fontFamily: theme.fonts.semibold }]}>
              {statusLabel}
            </Text>
            {declaredFor(item.id) ? (
              <Text style={{ color: theme.warning, fontFamily: theme.fonts.semibold, fontSize: 10.5, marginTop: 2 }}>
                ⚑ {t('absenceRequest.declaredBadge')} · {declaredFor(item.id)!.reason}
              </Text>
            ) : null}
          </View>
          {/* Retard : action directe et exclusive avec absent. */}
          <PressableScale
            onPress={() => toggleLate(item.id)}
            scaleDown={0.88}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: isLate }}
            accessibilityLabel={isLate ? t('teacher.cancelLate') : t('teacher.markLate')}
            style={[
              styles.lateBtn,
              {
                borderColor: isLate ? theme.warning : theme.border,
                backgroundColor: isLate ? theme.warning : theme.white,
              },
            ]}
          >
            <Ionicons name={isLate ? 'time' : 'time-outline'} size={21} color={isLate ? theme.white : theme.warning} />
          </PressableScale>
          {/* Mérite / avertissement sans quitter l'appel (Pressable imbriqué :
              le tap sur le smiley ne doit PAS basculer l'absence). */}
          <PressableScale
            onPress={() => setBehaviorFor(item)}
            scaleDown={0.88}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t('behavior.sheetTitle')}
            style={[styles.behaviorBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
          >
            <Ionicons name="happy-outline" size={20} color={theme.primary} />
          </PressableScale>
        </PressableScale>
      </Animated.View>
    )
  }

  const absentCount = absent.size
  const lateCount = late.size
  const presentCount = Math.max(0, eleves.length - absentCount - lateCount)

  if (scheduleLoading) {
    return (
      <ScreenLayout title={t('teacher.attendanceTitle', { classe: '—' })}>
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      </ScreenLayout>
    )
  }

  if (!lesson) {
    return (
      <ScreenLayout title={t('teacher.attendanceTitle', { classe: '—' })}>
        <View style={[styles.blockedCard, { backgroundColor: theme.danger + '12', borderColor: theme.danger + '30' }]}>
          <Ionicons name="calendar-outline" size={28} color={theme.danger} />
          <Text style={[styles.blockedText, { color: theme.text, fontFamily: theme.fonts.semibold }]}>
            {scheduleError || t('teacher.attendanceSlotUnavailable')}
          </Text>
          <PressableScale
            onPress={() => navigation.navigate('TeacherTabs', { screen: 'TeacherEdt' })}
            accessibilityRole="button"
            accessibilityLabel={t('teacher.seeFullSchedule')}
            style={[styles.scheduleBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.scheduleBtnText, { fontFamily: theme.fonts.bold }]}>
              {t('teacher.seeFullSchedule')}
            </Text>
          </PressableScale>
        </View>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout title={t('teacher.attendanceTitle', { classe })}>
      {draft && (
        <View style={{ padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: theme.surface }}>
          <Text style={{ color: draft.state === 'review' ? theme.danger : theme.textSoft, fontSize: 13 }}>
            {date} · {t(storing ? 'offlineAttendance.storing' : `offlineAttendance.${draft.state}`)}
          </Text>
          {draft.state === 'review' && (
            <PressableScale onPress={() => Alert.alert(t('offlineAttendance.reload'), t('offlineAttendance.reloadConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.confirm'), onPress: () => void load(true) },
            ])} accessibilityRole="button" accessibilityLabel={t('offlineAttendance.reload')} style={{ paddingVertical: 12 }}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('offlineAttendance.reload')}</Text>
            </PressableScale>
          )}
          {(draft.state === 'review' || draft.state === 'draft') && (
            <PressableScale onPress={() => Alert.alert(t('offlineAttendance.discard'), t('offlineAttendance.discardConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.delete'), style: 'destructive', onPress: () => void attendanceDrafts.discard(draft)
                .then(() => navigation.goBack()).catch(() => setError(t('offlineAttendance.storageFailed'))) },
            ])} accessibilityRole="button" accessibilityLabel={t('offlineAttendance.discard')} style={{ paddingVertical: 12 }}>
              <Text style={{ color: theme.danger }}>{t('offlineAttendance.discard')}</Text>
            </PressableScale>
          )}
        </View>
      )}
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.session')}</Text>
      <View
        accessible
        accessibilityLabel={`${t('teacher.session')} ${seance}`}
        style={[styles.lockedSession, { borderColor: theme.primary + '35', backgroundColor: theme.primarySurface }]}
      >
        <View style={[styles.lockIcon, { backgroundColor: theme.primary + '16' }]}>
          <Ionicons name="lock-open" size={15} color={theme.primary} />
        </View>
        <Text style={[styles.lockedSessionCode, { color: theme.primary, fontFamily: theme.fonts.black }]}>
          {seance}
        </Text>
        <Text style={[styles.lockedSessionTime, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
          {lesson.slot.startTime}–{lesson.slot.endTime}
        </Text>
      </View>

      <View style={[styles.summary, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <Text style={[styles.summaryMeta, { color: theme.text, fontFamily: theme.fonts.bold }]}>
          {date} · {seance} · {t('teacher.studentsCount', { count: eleves.length })}
        </Text>
        <View style={styles.statusSummaryRow}>
          <View style={[styles.statusChip, { backgroundColor: theme.successSurface }]}>
            <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
            <Text style={[styles.statusChipText, { color: theme.success, fontFamily: theme.fonts.bold }]}>
              {t('teacher.presentCount', { count: presentCount })}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: theme.warningSurface }]}>
            <Ionicons name="time-outline" size={13} color={theme.warning} />
            <Text style={[styles.statusChipText, { color: theme.warning, fontFamily: theme.fonts.bold }]}>
              {t('teacher.lateCount', { count: lateCount })}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: theme.dangerSurface }]}>
            <View style={[styles.statusDot, { backgroundColor: theme.danger }]} />
            <Text style={[styles.statusChipText, { color: theme.danger, fontFamily: theme.fonts.bold }]}>
              {t('teacher.absentCount', { count: absentCount })}
            </Text>
          </View>
        </View>
        <Text style={[styles.summaryHint, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
          {t('teacher.tapAttendance')}
        </Text>
      </View>

      {requests.filter(r => r.status !== 'declined').length > 0 && (
        <View style={[styles.summary, { backgroundColor: theme.warning + '14', borderColor: theme.warning }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
            ⚑ {t('absenceRequest.declaredByParents')}
          </Text>
          {requests.filter(r => r.status !== 'declined').map(r => (
            <Text key={r.id} style={{ color: theme.textSoft, fontSize: 11.5, marginTop: 3 }}>
              • {r.elevePrenom} {r.eleveNom} — {r.reason}
            </Text>
          ))}
        </View>
      )}

      {loading && eleves.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : eleves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {t('teacher.noStudentsInClass')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={eleves}
          keyExtractor={item => item.id}
          renderItem={renderEleve}
          contentContainerStyle={{ paddingBottom: 116 + insets.bottom }}
        />
      )}

      {/* Barre d'action au-dessus de la zone système Android/iOS. */}
      <View style={[
        styles.footer,
        {
          backgroundColor: theme.white,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}>
        <PressableScale
          onPress={save}
          disabled={saving || draft?.state === 'queued' || draft?.state === 'review'}
          accessibilityRole="button"
          accessibilityLabel={t('teacher.saveAttendance')}
          style={[styles.saveBtn, {
            backgroundColor: theme.primary,
            opacity:         saving ? 0.7 : 1,
          }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <View style={styles.saveIconWrap}>
                  <Ionicons name="save-outline" size={20} color="#fff" />
                </View>
                <View style={styles.saveCopy}>
                  <Text style={[styles.saveBtnText, { fontFamily: theme.fonts.black }]}>{t('teacher.saveAttendance')}</Text>
                  <Text style={[styles.saveBtnMeta, { fontFamily: theme.fonts.semibold }]}>
                    {t('teacher.saveAttendanceSummary', {
                      present: presentCount,
                      late: lateCount,
                      absent: absentCount,
                    })}
                  </Text>
                </View>
              </>
            )}
        </PressableScale>
      </View>

      <BehaviorSheet
        visible={!!behaviorFor}
        onClose={() => setBehaviorFor(null)}
        eleve={behaviorFor}
        classe={classe}
        date={date}
        seance={seance}
        teacher={profile ? { uid: profile.uid, nom: profile.nom, prenom: profile.prenom } : null}
      />
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  label:        { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  lockedSession:{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  lockIcon:     { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  lockedSessionCode:{ fontSize: 15 },
  lockedSessionTime:{ marginStart: 'auto', fontSize: 12 },
  blockedCard:  { alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 28, borderRadius: 14, borderWidth: 1 },
  blockedText:  { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  scheduleBtn:  { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scheduleBtnText:{ color: '#fff', fontSize: 13 },
  summary:      { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 12, gap: 8, borderCurve: 'continuous' },
  summaryMeta:  { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusSummaryRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip:   { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: 999 },
  statusDot:    { width: 7, height: 7, borderRadius: 999 },
  statusChipText:{ fontSize: 10.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryHint:  { fontSize: 10.5, lineHeight: 15 },
  card:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden', borderCurve: 'continuous' },
  statusStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  eleveName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  eleveStatus:  { fontSize: 12, fontWeight: '600' },
  lateBtn:      { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
  behaviorBtn:  { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginStart: 7 },
  loading:      { paddingVertical: 40, alignItems: 'center' },
  empty:        { paddingVertical: 60, alignItems: 'center' },
  errorBox:     { padding: 12, borderRadius: 10, marginBottom: 12 },
  footer:       { position: 'absolute', left: -20, right: -20, bottom: 0, paddingTop: 10, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, boxShadow: '0 -8px 24px rgba(67, 24, 18, 0.10)' },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, minHeight: 58, paddingHorizontal: 16, borderRadius: 15, borderCurve: 'continuous', boxShadow: '0 5px 14px rgba(166, 27, 27, 0.24)' },
  saveIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  saveCopy:     { flex: 1, gap: 1 },
  saveBtnText:  { color: '#fff', fontSize: 15, lineHeight: 19, fontWeight: '800' },
  saveBtnMeta:  { color: 'rgba(255,255,255,0.82)', fontSize: 10.5, lineHeight: 14 },
})
