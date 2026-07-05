import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClipboardCheck, BookOpenCheck } from 'lucide-react-native';
import ScreenLayout from '../../components/ScreenLayout';
import { CompletionChip } from '../../components/dashboard';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeSchedule, type ScheduleDoc, type WeeklySlot, type WeekDay,
} from '../../services/scheduleService';
import { useTeacherDayCompletion } from '../../hooks/useTeacherDayCompletion';
import type { TeacherStackParamList } from '../../navigation/types';

const DAY_ORDER: WeekDay[] = [
  'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
]

function todayWeekDay(): WeekDay {
  const names: WeekDay[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ]
  return names[new Date().getDay()]
}

export default function TeacherEdtScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>();
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<WeekDay | null>(null)

  const today = useMemo(() => todayWeekDay(), [])

  useEffect(() => {
    if (!profile?.uid) {
      setSchedule(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeSchedule(
      profile.uid,
      doc => { setSchedule(doc); setLoading(false); setError(null) },
      err => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [profile?.uid])

  const grouped = useMemo(() => {
    if (!schedule?.weeklySlots) return [] as { day: WeekDay; items: WeeklySlot[] }[]
    const map = new Map<WeekDay, WeeklySlot[]>()
    schedule.weeklySlots.forEach(s => {
      const arr = map.get(s.day) || []
      arr.push(s)
      map.set(s.day, arr)
    })
    return DAY_ORDER
      .filter(d => map.has(d))
      .map(d => ({
        day: d,
        items: map.get(d)!.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
  }, [schedule])

  // The day actually shown: the user's pick if still valid, else today, else the first day.
  const activeDay: WeekDay | null = useMemo(() => {
    if (grouped.length === 0) return null
    if (selectedDay && grouped.some(g => g.day === selectedDay)) return selectedDay
    if (grouped.some(g => g.day === today)) return today
    return grouped[0].day
  }, [grouped, selectedDay, today])

  const activeItems = useMemo(
    () => grouped.find(g => g.day === activeDay)?.items ?? [],
    [grouped, activeDay],
  )

  // Chips d'avancement : uniquement pour AUJOURD'HUI (l'appel est daté du jour).
  const todayItems = useMemo(
    () => grouped.find(g => g.day === today)?.items ?? [],
    [grouped, today],
  )
  const { attendanceDone, homeworkPosted } = useTeacherDayCompletion(todayItems, profile?.uid)

  const renderCard = ({ item: s }: { item: WeeklySlot }) => {
    const isToday = s.day === today
    const appelFait = isToday && !!s.seance && attendanceDone.has(`${s.classe}|${s.seance}`)
    const devoirPoste = isToday && homeworkPosted.has(s.classe)
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        // Tap = aller faire l'appel de cette séance (préréglé classe+séance).
        // Aujourd'hui uniquement : l'appel est toujours daté du jour.
        disabled={!isToday}
        onPress={() => navigation.navigate('TeacherAttendance', { classe: s.classe, seance: s.seance })}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={styles.timeRail}>
          <Text style={[styles.startTime, { color: theme.text }]}>{s.startTime}</Text>
          {s.seance ? (
            <View style={[styles.seanceBadge, { backgroundColor: theme.primarySurface }]}>
              <Text style={[styles.seanceText, { color: theme.primary }]}>{s.seance}</Text>
            </View>
          ) : null}
          <Text style={[styles.endTime, { color: theme.textSoft }]}>{s.endTime}</Text>
        </View>
        <View style={[styles.accent, { backgroundColor: theme.primary }]} />
        <View style={styles.cardBody}>
          <Text style={[styles.matiere, { color: theme.text }]}>{s.subject || '—'}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.classe, { color: theme.text }]}>📚 {s.classe}</Text>
            {s.room ? <Text style={[styles.salle, { color: theme.textSoft }]}>📍 {s.room}</Text> : null}
          </View>
          {isToday ? (
            <View style={styles.chipsRow}>
              <CompletionChip icon={ClipboardCheck} label={t('teacher.edtChipAppel')} done={appelFait} />
              <CompletionChip icon={BookOpenCheck} label={t('teacher.edtChipDevoir')} done={devoirPoste} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <ScreenLayout title={t('teacher.mySchedule')}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noCourseFound')}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.selectorWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectorContent}
            >
              {grouped.map(g => {
                const isSel = g.day === activeDay
                const isToday = g.day === today
                return (
                  <TouchableOpacity
                    key={g.day}
                    onPress={() => setSelectedDay(g.day)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={t(`days.${g.day}`)}
                    style={[
                      styles.dayChip,
                      { borderColor: theme.border, backgroundColor: isSel ? theme.primary : theme.surface },
                    ]}
                  >
                    <Text style={[styles.dayChipText, { color: isSel ? '#fff' : theme.text }]}>
                      {t(`daysShort.${g.day}`)}
                    </Text>
                    {isToday ? (
                      <View style={[styles.todayDot, { backgroundColor: isSel ? '#fff' : theme.primary }]} />
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          <View style={styles.dayHeaderRow}>
            <Text style={[styles.dayHeaderTitle, { color: theme.text }]}>
              {activeDay ? t(`days.${activeDay}`) : ''}
              {activeDay === today ? ` · ${t('teacher.todayLabel')}` : ''}
            </Text>
            <Text style={[styles.dayHeaderCount, { color: theme.textSoft }]}>
              {t('teacher.coursesCount', { count: activeItems.length })}
            </Text>
          </View>

          <FlatList
            data={activeItems}
            keyExtractor={(s, i) => `${s.day}-${s.startTime}-${i}`}
            renderItem={renderCard}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} tintColor={theme.primary} />}
          />
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  selectorWrap:   { marginBottom: 14 },
  selectorContent:{ gap: 8, paddingVertical: 2, paddingRight: 8 },
  dayChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  dayChipText:    { fontSize: 13, fontWeight: '700' },
  todayDot:       { width: 6, height: 6, borderRadius: 3 },

  dayHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  dayHeaderTitle: { fontSize: 18, fontWeight: '800' },
  dayHeaderCount: { fontSize: 12, fontWeight: '600' },

  card:      { flexDirection: 'row', marginBottom: 10, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  timeRail:  { width: 66, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 4 },
  startTime: { fontSize: 15, fontWeight: '800' },
  endTime:   { fontSize: 11 },
  seanceBadge:{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  seanceText:{ fontSize: 10, fontWeight: '800' },
  accent:    { width: 3 },
  cardBody:  { flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  matiere:   { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  metaRow:   { flexDirection: 'row', gap: 14, flexWrap: 'wrap', alignItems: 'center' },
  classe:    { fontSize: 13, fontWeight: '600' },
  salle:     { fontSize: 13 },
  chipsRow:  { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },

  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
});
