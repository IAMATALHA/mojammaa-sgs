/**
 * "Dossier de classe" — page d'atterrissage quand le prof tape une classe.
 * Affiche les sous-actions : Faire l'appel, Voir les élèves, Devoirs,
 * Notes. Tout est filtré sur la classe choisie pour éviter au prof de
 * répéter le filtre 5 fois.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentTeacherScheduleSlot } from '../../hooks/useCurrentTeacherScheduleSlot'
import { useTeacherPrayerActivity } from '../../hooks/useTeacherPrayerActivity'
import { db } from '../../config/firebase'
import type { TeacherStackParamList, TeacherRoute } from '../../navigation/types'
import { currentAcademicPeriod } from '../../utils/academicPeriod'
import { localServiceDate } from '../../services/pickup-service'
import { getSchedule } from '../../services/scheduleService'
import {
  findCurrentScheduleSlot,
  resolveScheduleSessionCode,
  scheduleLessonKey,
} from '../../utils/scheduleSession'

export default function TeacherClasseFolderScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const { currentSlot } = useCurrentTeacherScheduleSlot()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const route = useRoute<TeacherRoute<'TeacherClasseFolder'>>()
  const { classe, openAttendance } = route.params ?? { classe: '' }
  const prayerActivity = useTeacherPrayerActivity(
    classe ? [classe] : [],
    localServiceDate(),
    profile?.uid,
  )
  const classPrayerSession = prayerActivity.sessions.find(
    session => session.classe === classe,
  ) ?? null
  const canOpenPrayer = (
    currentSlot?.classe === classe && !classPrayerSession
  ) || (
    !!classPrayerSession
    && classPrayerSession.status !== 'returned'
    && classPrayerSession.startedByUid === profile?.uid
  )

  const [eleveCount,   setEleveCount]   = useState<number | null>(null)
  const [devoirsCount, setDevoirsCount] = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)
  const period = currentAcademicPeriod()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Pas de comptage de notes ici : un prof ne lit que les notes de SA
      // matière (règle Firestore), une requête classe tous-sujets serait refusée.
      const [elevesSnap, devoirsSnap] = await Promise.all([
        getDocs(query(collection(db, 'eleves'),  where('classe',   '==', classe))),
        getDocs(query(
          collection(db, 'devoirs'),
          where('classeId', '==', classe),
          where('academicYear', '==', period.academicYear),
        )),
      ])
      setEleveCount(elevesSnap.docs.filter(d => d.data().active !== false).length)
      setDevoirsCount(devoirsSnap.size)
    } catch {
      // Une rule qui rate ne doit pas casser l'écran.
    } finally {
      setLoading(false)
    }
  }, [classe, period.academicYear])

  useEffect(() => { load() }, [load])

  const openExactAttendance = useCallback(async () => {
    if (!profile?.uid) {
      navigation.navigate('TeacherTabs', { screen: 'TeacherEdt' })
      return
    }

    try {
      const schedule = await getSchedule(profile.uid)
      const currentSlot = findCurrentScheduleSlot(schedule?.weeklySlots ?? [])
      if (
        !currentSlot
        || currentSlot.classe !== classe
        || !resolveScheduleSessionCode(currentSlot)
      ) {
        navigation.navigate('TeacherTabs', { screen: 'TeacherEdt' })
        return
      }
      navigation.navigate('TeacherAttendance', {
        lessonKey: scheduleLessonKey(currentSlot),
      })
    } catch {
      navigation.navigate('TeacherTabs', { screen: 'TeacherEdt' })
    }
  }, [classe, navigation, profile?.uid])

  // Auto-redirige vers l'attendance si on vient du bouton "Faire l'appel"
  useEffect(() => {
    if (openAttendance && classe) {
      // Petit délai pour éviter une transition saccadée
      const id = setTimeout(() => {
        openExactAttendance()
      }, 250)
      return () => clearTimeout(id)
    }
    return undefined
  }, [openAttendance, classe, openExactAttendance])

  const Action = ({
    icon, label, sub, onPress, color,
  }: { icon: any; label: string; sub: string; onPress: () => void; color?: string }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.action, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.85}
    >
      <View style={[styles.actionIcon, { backgroundColor: (color || theme.primary) + '20' }]}>
        <Ionicons name={icon} size={22} color={color || theme.primary} />
      </View>
      <View style={{ flex: 1, marginStart: 14 }}>
        <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.actionSub, { color: theme.textSoft }]}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
    </TouchableOpacity>
  )

  return (
    <ScreenLayout title={t('teacher.classFolder', { classe })}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <Text style={styles.headerClasse}>{classe}</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.headerMeta}>
              {t('teacher.studentsCount', { count: eleveCount ?? 0 })} · {devoirsCount ?? 0} {t('tabs.homework').toLowerCase()}
            </Text>
          )}
        </View>

        {/* Action grosse : appel */}
        <TouchableOpacity
          onPress={openExactAttendance}
          style={[styles.bigBtn, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={26} color="#fff" />
          <Text style={styles.bigBtnText}>{t('teacher.takeAttendance')}</Text>
        </TouchableOpacity>

        {/* Autres actions */}
        <Action
          icon="people-outline"
          label={t('teacher.studentList')}
          sub={eleveCount != null ? t('teacher.studentsCount', { count: eleveCount }) : t('teacher.seeDetail')}
          onPress={() => navigation.navigate('TeacherClasseEleves', { classe })}
        />
        <Action
          icon="book-outline"
          label={t('tabs.homework')}
          sub={devoirsCount != null ? `${devoirsCount} devoir(s)` : t('teacher.homeworkSeeCreate')}
          onPress={() => navigation.navigate('TeacherDevoirsDetail', { classe })}
        />
        <Action
          icon="document-text-outline"
          label={t('tabs.grades')}
          sub={t('teacher.notesSeeEnter')}
          onPress={() => navigation.navigate('TeacherNotes', { classe })}
        />
        {canOpenPrayer ? (
          <Action
            icon="moon-outline"
            label={t('prayer.folderAction')}
            sub={t('prayer.folderActionSub')}
            onPress={() => navigation.navigate('TeacherPrayer', { classe })}
            color={theme.info}
          />
        ) : null}
        <Action
          icon="happy-outline"
          label={t('behavior.folderAction')}
          sub={t('behavior.folderActionSub')}
          onPress={() => navigation.navigate('TeacherComportement', { classe })}
          color={theme.warning}
        />
        <Action
          icon="folder-open-outline"
          label={t('resources.title')}
          sub={t('resources.folderActionSub')}
          onPress={() => navigation.navigate('TeacherRessources', { classe })}
          color={theme.info}
        />
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  header:        { padding: 20, borderRadius: 16, marginBottom: 18 },
  headerClasse:  { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerMeta:    { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  bigBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 14, marginBottom: 18 },
  bigBtnText:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  action:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  actionIcon:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:   { fontSize: 15, fontWeight: '700' },
  actionSub:     { fontSize: 12, marginTop: 2 },
})
