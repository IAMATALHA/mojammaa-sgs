/**
 * Saisie des absences "en 1 clic" :
 *   - tout le monde est PRÉSENT par défaut (carte verte)
 *   - le prof ne tape que les ABSENTS (carte rouge)
 *   - bouton "Sauvegarder" écrit dans Firestore avec un docId déterministe
 *     par séance pour pouvoir reposer son doigt sans dupliquer
 *
 * Schéma absences (consistent avec mojammaa-admin) :
 *   absences/{eleveId_date_seanceKey} = {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut, professorId, createdAt
 *   }
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Alert, ActivityIndicator,
} from 'react-native'
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { TeacherStackParamList, TeacherRoute } from '../../navigation/types'
import PressableScale from '../../components/PressableScale'
import {
  collection, getDocs, query, where, doc, Timestamp,
  documentId,
} from 'firebase/firestore'
import { sendMessage } from '../../services/messagesService'
import { getSchedule } from '../../services/scheduleService'
import { getAbsenceRequestsForClassDate, decideAbsenceRequest, type AbsenceRequestDoc } from '../../services/absenceRequestsService'
import { toDoc } from '../../services/firestore'
import { getDocsChunked } from '../../services/chunkedQuery'
import { isActiveEleve, type EleveDoc } from '../../services/elevesService'
import type { AbsenceDoc } from '../../services/absencesService'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import BehaviorSheet from '../../components/BehaviorSheet'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { academicPeriodForDate, localISODate } from '../../utils/academicPeriod'
import { commitInChunks } from '../../utils/firestoreBatch'
import type { WeeklySlot } from '../../services/scheduleService'
import {
  findScheduleSlotByLessonKey,
  isScheduleSlotToday,
  resolveScheduleSessionCode,
} from '../../utils/scheduleSession'

interface EleveLite {
  id:     string
  nom:    string
  prenom: string
}

interface ResolvedLesson {
  slot: WeeklySlot
  seance: string
}

interface TeacherInfo {
  uid:    string
  nom:    string
  prenom: string
}

/**
 * Pour chaque élève absent ayant un parent enregistré, écrit un doc dans
 * `messages` (historique permanent côté parent). Le push est envoyé
 * SERVEUR par la Cloud Function `onMessageCreated` — surtout ne pas le
 * faire ici : un prof n'a pas le droit de lire users/{parent} (rules),
 * et un push client doublerait celui de la CF.
 *
 * Retourne le nombre de parents notifiés ET le nombre d'absents sans compte
 * parent lié : le professeur doit pouvoir constater qu'une partie des familles
 * n'a PAS été prévenue, au lieu de le déduire d'un compteur plus petit que prévu.
 */
interface NotifyResult {
  notified:      number
  sansParent:    number
}

async function notifyParentsOfAbsents(
  absents: EleveLite[],
  classe:  string,
  date:    string,
  seance:  string,
  teacher: TeacherInfo,
): Promise<NotifyResult> {
  if (absents.length === 0) return { notified: 0, sansParent: 0 }

  // 1. Lit les eleves docs des absents pour trouver leur parentUid.
  //    Lecture CHUNKÉE : tronquer la liste (ce que faisait `slice(0, 10)`)
  //    privait silencieusement de notification les parents des absents au-delà
  //    du 10e — un cas courant dès qu'une classe entière manque à l'appel.
  const absentIds = absents.map(e => e.id)
  const eleveDocs = await getDocsChunked<EleveDoc>(
    absentIds,
    chunk => query(collection(db, 'eleves'), where(documentId(), 'in', chunk)),
  )
  const eleveToParent = new Map<string, { parentUid: string; prenom: string; nom: string }>()
  eleveDocs.forEach(data => {
    if (!isActiveEleve(data)) return
    if (data.parentUid) {
      eleveToParent.set(data.id, {
        parentUid: data.parentUid,
        prenom:    data.prenomLatin || data.prenom || '',
        nom:       data.nomLatin    || data.nom    || '',
      })
    }
  })

  const sansParent = absents.filter(e => !eleveToParent.has(e.id)).length
  if (eleveToParent.size === 0) return { notified: 0, sansParent }

  const fromNom = `${teacher.prenom} ${teacher.nom}`.trim()

  // 2. Pour chaque absent : écrire un message (la CF fait le push)
  const writes: Promise<unknown>[] = []

  for (const eleve of absents) {
    const link = eleveToParent.get(eleve.id)
    if (!link) continue
    const body = `${link.prenom} ${link.nom} a été marqué(e) absent(e) en ${classe} (${seance}, ${date}).`

    // 3.a — message Firestore (historique permanent)
    writes.push(sendMessage({
      type:     'attendance',
      subject:  'Absence signalée',
      body,
      fromId:   teacher.uid,
      fromNom,
      fromRole: 'professeur',
      toType:   'user',
      toIds:    [link.parentUid],
      category: 'attendance',
      priority: 'urgent',
      eleveId:  eleve.id,
      classe,
    }))
  }

  // `allSettled` et non `all` : un seul envoi en échec ne doit pas faire
  // remonter une exception qui masquerait les envois RÉUSSIS et afficherait
  // « 0 parent notifié » au professeur. On compte les succès réels.
  const results = await Promise.allSettled(writes)
  const notified = results.filter(r => r.status === 'fulfilled').length
  const failed = results.length - notified
  if (failed > 0) console.warn(`[absences] ${failed} message(s) parent non écrit(s)`)

  return { notified, sansParent: sansParent + failed }
}

export default function TeacherAttendanceScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const route = useRoute<TeacherRoute<'TeacherAttendance'>>()
  const lessonKey = route.params?.lessonKey ?? ''
  const { profile } = useAuth()

  const [lesson, setLesson] = useState<ResolvedLesson | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [eleves,  setEleves]  = useState<EleveLite[]>([])
  const [absent,  setAbsent]  = useState<Set<string>>(new Set())  // ids des absents
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [requests, setRequests] = useState<AbsenceRequestDoc[]>([])  // déclarations parents (classe+date)
  const [error,   setError]   = useState<string | null>(null)
  const [behaviorFor, setBehaviorFor] = useState<EleveLite | null>(null)  // élève de la fiche comportement

  const classe = lesson?.slot.classe ?? ''
  const seance = lesson?.seance ?? ''
  const date = localISODate()

  // La route ne transporte qu'une clé de créneau. Classe et période sont
  // toujours relues dans l'EDT du professeur connecté, jamais acceptées
  // depuis des paramètres modifiables côté navigation.
  useEffect(() => {
    let cancelled = false
    setScheduleLoading(true)
    setScheduleError(null)
    setLesson(null)

    if (!profile?.uid || !lessonKey) {
      setScheduleLoading(false)
      setScheduleError(t('teacher.attendanceSlotUnavailable'))
      return () => { cancelled = true }
    }

    getSchedule(profile.uid)
      .then(schedule => {
        if (cancelled) return
        const slot = findScheduleSlotByLessonKey(schedule?.weeklySlots ?? [], lessonKey)
        const resolvedSeance = slot ? resolveScheduleSessionCode(slot) : null
        if (!slot || !isScheduleSlotToday(slot) || !resolvedSeance) {
          setScheduleError(t('teacher.attendanceSlotUnavailable'))
          return
        }
        setLesson({ slot, seance: resolvedSeance })
      })
      .catch(() => {
        if (!cancelled) setScheduleError(t('teacher.attendanceSlotUnavailable'))
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false)
      })

    return () => { cancelled = true }
  }, [lessonKey, profile?.uid, t])

  const load = useCallback(async () => {
    if (!lesson) return
    setLoading(true); setError(null)
    try {
      const [elevesSnap, absentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'eleves'), where('classe', '==', classe))),
        getDocs(query(
          collection(db, 'absences'),
          where('classe', '==', classe),
          where('date',   '==', date),
          where('seance', '==', seance),
          where('statut', '==', 'absent'),
        )),
      ])
      const list: EleveLite[] = elevesSnap.docs
        .map(d => ({ id: d.id, data: toDoc<EleveDoc>(d) }))
        .filter(({ data }) => isActiveEleve(data))
        .map(({ id, data }) => ({
          id,
          nom: data.nom || '',
          prenom: data.prenom || '',
        }))
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setEleves(list)
      const set = new Set<string>()
      absentsSnap.forEach(d => set.add(toDoc<AbsenceDoc>(d).eleveId))
      setAbsent(set)
      // Déclarations d'absence des parents pour cette date (best-effort)
      getAbsenceRequestsForClassDate(classe, date)
        .then(setRequests)
        .catch(() => setRequests([]))
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger.')
    } finally {
      setLoading(false)
    }
  }, [classe, date, lesson, seance])

  useEffect(() => {
    if (!lesson) {
      setEleves([])
      setAbsent(new Set())
      setRequests([])
      return
    }
    load()
  }, [lesson, load])

  const toggleAbsent = (id: string) => {
    // Vibration impact moyen = signal clair "j'ai marqué un absent"
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setAbsent(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const save = async () => {
    if (!profile || !lesson || !classe || !seance) {
      setError(t('teacher.attendanceSlotUnavailable'))
      return
    }
    setSaving(true); setError(null)
    try {
      const period = academicPeriodForDate(date)
      // Pour chaque élève, on écrit son statut. Le docId est déterministe
      // pour qu'un rappel sur l'appel mette à jour l'enregistrement au lieu
      // de dupliquer. Commits par chunks : les règles font un get() par
      // absence créée (cohérence élève/classe) et Firestore plafonne à 20
      // accès règles par batch — une classe entière en un batch échouerait.
      await commitInChunks(db, eleves, (batch, e) => {
        const docId = `${e.id}_${date}_${seance}`
        const ref = doc(db, 'absences', docId)
        batch.set(ref, {
          eleveId:     e.id,
          eleveNom:    e.nom,
          elevePrenom: e.prenom,
          classe,
          date,
          seance,
          statut:      absent.has(e.id) ? 'absent' : 'present',
          professorId: profile.uid,
          createdAt:   Timestamp.now(),
          ...period,
          // Absence déclarée par le parent → justifiée d'office avec son motif.
          ...(absent.has(e.id) && declaredFor(e.id)
            ? { justified: true, raison: declaredFor(e.id)!.reason }
            : {}),
        }, { merge: true })
      })

      // Les déclarations couvertes par cet appel passent à 'approved'.
      await Promise.all(
        requests
          .filter(r => r.id && r.status === 'pending' && absent.has(r.eleveId))
          .map(r => decideAbsenceRequest(r.id!, 'approved', profile.uid).catch(() => {})),
      )

      // ── Notifier les parents des absents ──────────────────────────────
      let notifSent = 0
      let notifSkipped = 0
      if (absent.size > 0 && profile) {
        try {
          const res = await notifyParentsOfAbsents(
            eleves.filter(e => absent.has(e.id)),
            classe, date, seance,
            { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
          )
          notifSent = res.notified
          notifSkipped = res.sansParent
        } catch (e) {
          // Erreur de notif non-bloquante : l'appel est déjà sauvegardé
          console.warn('Notification failed:', e)
          notifSkipped = absent.size
        }
      }

      const count = absent.size
      // Le professeur doit voir les deux chiffres : combien de familles ont été
      // prévenues, et combien ne l'ont pas été (absence de compte parent lié ou
      // échec d'écriture). Un silence sur le second laissait croire à une
      // notification complète.
      const notifLines = [
        notifSent > 0 ? t('teacher.parentsNotified', { count: notifSent }) : '',
        notifSkipped > 0 ? t('teacher.absentsWithoutParent', { count: notifSkipped }) : '',
      ].filter(Boolean)
      Alert.alert(
        t('teacher.attendanceSaved'),
        count === 0
          ? t('teacher.allPresent', { classe, seance })
          : t('teacher.absentsRecorded', { count, classe, seance }) +
            (notifLines.length > 0 ? `\n\n${notifLines.join('\n')}` : ''),
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      )
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const declaredFor = (eleveId: string): AbsenceRequestDoc | undefined =>
    requests.find(r => r.eleveId === eleveId && r.status !== 'declined')

  const renderEleve = ({ item, index }: { item: EleveLite; index: number }) => {
    const isAbsent = absent.has(item.id)
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
          accessibilityLabel={`${item.prenom} ${item.nom}`}
          style={[
            styles.card,
            {
              backgroundColor: theme.white,
              borderColor:     isAbsent ? theme.danger : theme.border,
            },
          ]}
        >
          <View style={[styles.statusStripe, { backgroundColor: isAbsent ? theme.danger : theme.success }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.eleveName, { color: theme.text, fontFamily: theme.fonts.bold }]}>
              {item.prenom} {item.nom}
            </Text>
            <Text style={[styles.eleveStatus, { color: isAbsent ? theme.danger : theme.success, fontFamily: theme.fonts.semibold }]}>
              {isAbsent ? t('teacher.absentTapCancel') : t('teacher.presentLabel')}
            </Text>
            {declaredFor(item.id) ? (
              <Text style={{ color: theme.warning, fontFamily: theme.fonts.semibold, fontSize: 10.5, marginTop: 2 }}>
                ⚑ {t('absenceRequest.declaredBadge')} · {declaredFor(item.id)!.reason}
              </Text>
            ) : null}
          </View>
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
          <Ionicons name="lock-closed" size={15} color={theme.primary} />
        </View>
        <Text style={[styles.lockedSessionCode, { color: theme.primary, fontFamily: theme.fonts.black }]}>
          {seance}
        </Text>
        <Text style={[styles.lockedSessionTime, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
          {lesson.slot.startTime}–{lesson.slot.endTime}
        </Text>
      </View>

      <View style={[styles.summary, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
          {date} · {seance} · {t('teacher.studentsCount', { count: eleves.length })} · {t('teacher.absentCount', { count: absent.size })}
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
          {t('teacher.tapAbsent')}
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
          contentContainerStyle={{ paddingBottom: 90 }}
        />
      )}

      {/* Bouton sauvegarder sticky */}
      <View style={[styles.footer, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
        <PressableScale
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, {
            backgroundColor: theme.primary,
            opacity:         saving ? 0.7 : 1,
          }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={[styles.saveBtnText, { fontFamily: theme.fonts.black }]}>{t('teacher.saveAttendance')}</Text>
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
  summary:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  card:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  statusStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  eleveName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  eleveStatus:  { fontSize: 12, fontWeight: '600' },
  behaviorBtn:  { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginStart: 10 },
  loading:      { paddingVertical: 40, alignItems: 'center' },
  empty:        { paddingVertical: 60, alignItems: 'center' },
  errorBox:     { padding: 12, borderRadius: 10, marginBottom: 12 },
  footer:       { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, borderTopWidth: 1 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 10 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
})
