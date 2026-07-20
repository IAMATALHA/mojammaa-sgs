import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { subscribeSchedule, type ScheduleDoc, type WeeklySlot } from '../../services/scheduleService'
import type { TeacherStackParamList } from '../../navigation/types'
import type { UserProfile } from '../../types'

interface ClasseRow {
  name:         string
  studentCount: number
  subjects:     string[]
}

function getClassesFromProfile(profile: UserProfile | null | undefined): string[] {
  if (!profile) return []
  if (Array.isArray(profile.classes) && profile.classes.length > 0) return profile.classes
  if (typeof profile.classe === 'string' && profile.classe) return [profile.classe]
  return []
}

export default function TeacherClassesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const { profile } = useAuth()
  const [classes, setClasses] = useState<ClasseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const profileClasses = useMemo(() => getClassesFromProfile(profile), [profile])
  const [scheduleDoc, setScheduleDoc] = useState<ScheduleDoc | null>(null)

  // Subscribe to schedule (realtime)
  useEffect(() => {
    if (!profile?.uid) return
    const unsub = subscribeSchedule(
      profile.uid,
      doc => setScheduleDoc(doc),
      err => setError(err.message),
    )
    return unsub
  }, [profile?.uid])

  // Build class rows from schedule + profile.classes + eleves count
  const load = useCallback(async () => {
    if (!profile?.uid) return
    setLoading(true); setError(null)
    try {
      const subjectsByClasse = new Map<string, Set<string>>()

      if (scheduleDoc?.weeklySlots) {
        scheduleDoc.weeklySlots.forEach((s: WeeklySlot) => {
          const set = subjectsByClasse.get(s.classe) || new Set<string>()
          if (s.subject) set.add(s.subject)
          subjectsByClasse.set(s.classe, set)
        })
      }

      profileClasses.forEach(c => {
        if (!subjectsByClasse.has(c)) subjectsByClasse.set(c, new Set<string>())
      })

      const classeNames = [...subjectsByClasse.keys()]

      // Requêtes par classe lancées en PARALLÈLE (23/06/2026) — avant, une
      // boucle `for … await` séquentielle faisait un aller-retour réseau par
      // classe et bloquait le rendu initial.
      const rows: ClasseRow[] = await Promise.all(
        classeNames.map(async c => {
          const elevesSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', c)))
          return {
            name:         c,
            studentCount: elevesSnap.docs.filter(d => d.data().active !== false).length,
            subjects:     [...subjectsByClasse.get(c)!],
          }
        }),
      )
      rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setClasses(rows)
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [profile?.uid, profileClasses.join('|'), scheduleDoc])

  useEffect(() => { load() }, [load])

  const renderItem = ({ item }: { item: ClasseRow }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('TeacherClasseFolder', { classe: item.name })}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBox, { backgroundColor: theme.primarySurface }]}>
        <Text style={[styles.iconText, { color: theme.primary }]}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, marginStart: 14 }}>
        <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
        <Text style={[styles.meta, { color: theme.textSoft }]}>
          {t('teacher.studentCount', { count: item.studentCount })}
          {item.subjects.length > 0 ? ` · ${item.subjects.join(', ')}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
    </TouchableOpacity>
  )

  return (
    <ScreenLayout title={t('teacher.myClasses')}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && classes.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : classes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noClassYet')}{'\n'}
            <Text style={{ fontSize: 12 }}>
              {t('teacher.adminMustAdd')}
            </Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={item => item.name}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  iconBox:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText:  { fontSize: 20, fontWeight: '800' },
  name:      { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  meta:      { fontSize: 12 },
  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
})
