import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSchedule, type ScheduleDoc, type WeeklySlot, type WeekDay,
} from '../../services/scheduleService';

const DAY_ORDER: WeekDay[] = [
  'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
]
const DAY_LABEL: Record<WeekDay, string> = {
  saturday:  'Sam', sunday: 'Dim', monday: 'Lun', tuesday: 'Mar',
  wednesday: 'Mer', thursday: 'Jeu', friday: 'Ven',
}

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
  const [schedule, setSchedule] = useState<ScheduleDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = useMemo(() => todayWeekDay(), [])

  const load = async () => {
    if (!profile?.uid) return
    setLoading(true); setError(null)
    try {
      const doc = await getSchedule(profile.uid)
      setSchedule(doc)
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profile?.uid])

  const grouped = useMemo(() => {
    if (!schedule?.weeklySlots) return []
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
        label: DAY_LABEL[d],
        items: map.get(d)!.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
  }, [schedule])

  const renderGroup = ({ item }: { item: { day: WeekDay; label: string; items: WeeklySlot[] } }) => {
    const isToday = item.day === today
    return (
      <View style={styles.group}>
        <View style={[styles.dayHeader, isToday && { backgroundColor: theme.primarySurface }]}>
          <Text style={[styles.dayTitle, { color: isToday ? theme.primary : theme.textSoft }]}>
            {item.label}{isToday ? ` · ${t('teacher.todayLabel')}` : ''}
          </Text>
        </View>
        {item.items.map((s, idx) => (
          <View key={`${s.day}-${s.startTime}-${idx}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.timeRow}>
              <Text style={[styles.seance, { color: theme.primary }]}>{s.seance || ''}</Text>
              <Text style={[styles.timeText, { color: theme.textSoft }]}>
                {s.startTime} – {s.endTime}
              </Text>
            </View>
            <Text style={[styles.matiere, { color: theme.text }]}>{s.subject || '—'}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.classe, { color: theme.text }]}>📚 {s.classe}</Text>
              {s.room ? <Text style={[styles.salle, { color: theme.textSoft }]}>📍 {s.room}</Text> : null}
            </View>
          </View>
        ))}
      </View>
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
        <FlatList
          data={grouped}
          keyExtractor={item => item.day}
          renderItem={renderGroup}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  group:     { marginBottom: 16 },
  dayHeader: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 8 },
  dayTitle:  { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  card:      { padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  timeRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  seance:    { fontSize: 13, fontWeight: '800' },
  timeText:  { fontSize: 11 },
  matiere:   { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  metaRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  classe:    { fontSize: 12, fontWeight: '600' },
  salle:     { fontSize: 12 },
  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
});
