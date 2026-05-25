import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  getJoursScolaires, setJourScolaire, deleteJourScolaire,
  type JourScolaire, type JourType,
} from '../../services/calendarService'

const JOUR_TYPES: { value: JourType; labelKey: string; color: string }[] = [
  { value: 'vacances',   labelKey: 'calendar.vacances',   color: '#52B788' },
  { value: 'evenement',  labelKey: 'calendar.evenement',  color: '#D95B00' },
  { value: 'examen',     labelKey: 'calendar.examen',     color: '#E63946' },
]

function generateNext30Days(): { iso: string; label: string; day: string }[] {
  const days: { iso: string; label: string; day: string }[] = []
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  for (let i = 0; i <= 30; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    days.push({
      iso: d.toISOString().split('T')[0],
      label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
      day: dayNames[d.getDay()],
    })
  }
  return days
}

export default function AdminCalendarScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [jours, setJours] = useState<JourScolaire[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState('')
  const [selectedType, setSelectedType] = useState<JourType>('evenement')
  const [saving, setSaving] = useState(false)

  const dateChips = useMemo(() => generateNext30Days(), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const end = new Date()
      end.setDate(end.getDate() + 90)
      const endISO = end.toISOString().split('T')[0]
      const list = await getJoursScolaires(today, endISO)
      setJours(list)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const joursMap = useMemo(() => {
    const map = new Map<string, JourScolaire>()
    jours.forEach(j => map.set(j.date, j))
    return map
  }, [jours])

  const handleAdd = async () => {
    if (!selectedDate || !profile?.uid) return
    if (joursMap.has(selectedDate)) {
      Alert.alert(t('common.error'), t('calendar.alreadyExists'))
      return
    }
    setSaving(true)
    try {
      const typeInfo = JOUR_TYPES.find(jt => jt.value === selectedType)!
      await setJourScolaire({
        date: selectedDate,
        type: selectedType,
        label: t(typeInfo.labelKey),
        annuleCours: true,
      }, profile.uid)
      setSelectedDate('')
      load()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (date: string) => {
    Alert.alert(
      t('common.confirm'),
      t('calendar.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            try {
              await deleteJourScolaire(date)
              load()
            } catch {}
          },
        },
      ],
    )
  }

  const typeColor = (type: JourType) => JOUR_TYPES.find(jt => jt.value === type)?.color || theme.textSoft

  return (
    <ScreenLayout title={t('calendar.title')}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {/* Add new jour */}
        <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>{t('calendar.addDay')}</Text>

        {/* Date picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
          {dateChips.map(dc => {
            const active = selectedDate === dc.iso
            const taken = joursMap.has(dc.iso)
            return (
              <TouchableOpacity
                key={dc.iso}
                onPress={() => !taken && setSelectedDate(dc.iso)}
                disabled={taken}
                style={[styles.dateChip, {
                  borderColor: taken ? theme.danger : active ? theme.primary : theme.border,
                  backgroundColor: taken ? theme.dangerSurface : active ? theme.primary : theme.surface,
                  opacity: taken ? 0.6 : 1,
                }]}
              >
                <Text style={{ color: active ? '#fff' : theme.textSoft, fontWeight: '600', fontSize: 10 }}>{dc.day}</Text>
                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginTop: 2 }}>{dc.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Type picker */}
        <View style={styles.typeRow}>
          {JOUR_TYPES.map(jt => {
            const active = selectedType === jt.value
            return (
              <TouchableOpacity
                key={jt.value}
                onPress={() => setSelectedType(jt.value)}
                style={[styles.typeChip, {
                  borderColor: active ? jt.color : theme.border,
                  backgroundColor: active ? jt.color : 'transparent',
                }]}
              >
                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {t(jt.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Add button */}
        <TouchableOpacity
          onPress={handleAdd}
          disabled={!selectedDate || saving}
          style={[styles.addBtn, {
            backgroundColor: selectedDate ? theme.primary : theme.surfaceAlt,
            opacity: saving ? 0.7 : 1,
          }]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Plus size={18} color={selectedDate ? '#fff' : theme.textMuted} strokeWidth={2} />
              <Text style={{ color: selectedDate ? '#fff' : theme.textMuted, fontWeight: '700', fontSize: 14, marginStart: 8 }}>
                {t('calendar.addButton')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Existing jours */}
        <Text style={[styles.sectionTitle, { color: theme.textSoft, marginTop: 24 }]}>{t('calendar.upcoming')}</Text>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : jours.length === 0 ? (
          <View style={styles.empty}>
            <CalendarDays size={24} color={theme.textMuted} strokeWidth={1.5} />
            <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('calendar.noSpecialDays')}</Text>
          </View>
        ) : (
          jours.map(j => (
            <View key={j.date} style={[styles.jourCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.jourDot, { backgroundColor: typeColor(j.type) }]} />
              <View style={{ flex: 1, marginStart: 12 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{j.date}</Text>
                <Text style={{ color: typeColor(j.type), fontWeight: '600', fontSize: 12, marginTop: 2 }}>{j.label}</Text>
                {j.annuleCours ? (
                  <Text style={{ color: theme.danger, fontSize: 11, marginTop: 2 }}>{t('calendar.coursesCancelled')}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => handleDelete(j.date)} hitSlop={8}>
                <Trash2 size={18} color={theme.danger} strokeWidth={1.75} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, minWidth: 56, alignItems: 'center' },
  typeRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 14 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, flex: 1, alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },
  jourCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  jourDot: { width: 10, height: 10, borderRadius: 5 },
})
