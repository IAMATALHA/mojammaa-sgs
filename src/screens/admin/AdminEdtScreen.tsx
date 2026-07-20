/**
 * Vue admin de tous les emplois du temps. Permet de filtrer par classe.
 * Lecture seule pour cette V1 — la création/édition reste dans l'app web
 * mojammaa-admin où l'UI est plus confortable (clavier + écran large).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  ScrollView, TouchableOpacity,
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../config/firebase';
import { toDocs } from '../../services/firestore';
import { normalizeDay } from '../../utils/rollCalls';
import type { WeekDay } from '../../utils/courseSchedule';

interface Cours {
  id:             string
  classeId:       string
  day:            WeekDay | null
  dayFallback:    string
  startTime:      string
  seance:         string
  matiere:        string
  salle?:         string
  professeurNom?: string
}

const DAY_ORDER: WeekDay[] = [
  'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
]

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compareText(a: string, b: string, locale: string): number {
  if (!a) return b ? 1 : 0
  if (!b) return -1
  return a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' })
}

function dayIndex(day: WeekDay | null): number {
  if (!day) return Number.MAX_SAFE_INTEGER
  const index = DAY_ORDER.indexOf(day)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function normalizeCours(raw: Record<string, unknown> & { id: string }): Cours {
  const dayFallback = safeText(raw.day) || safeText(raw.jour)

  return {
    id: raw.id,
    classeId: safeText(raw.classeId) || safeText(raw.classe),
    day: normalizeDay(dayFallback),
    dayFallback,
    startTime: safeText(raw.startTime),
    seance: safeText(raw.seance),
    matiere: safeText(raw.matiere),
    salle: safeText(raw.salle) || undefined,
    professeurNom: safeText(raw.professeurNom) || undefined,
  }
}

export default function AdminEdtScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')
  const locale = i18n.resolvedLanguage || i18n.language || 'fr'
  const [cours,   setCours]   = useState<Cours[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [classeFilter, setClasseFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(collection(db, 'emploiDuTemps'))
      const list = toDocs<Record<string, unknown>>(snap).map(normalizeCours)
      setCours(list)
    } catch (e: unknown) {
      console.warn('[admin schedule]', e instanceof Error ? e.message : 'unknown error')
      setError(t('common.dataLoadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const allClasses = useMemo(() => {
    const set = new Set(cours.map(c => c.classeId).filter(Boolean))
    return [...set].sort((a, b) => compareText(a, b, locale))
  }, [cours, locale])

  const filtered = useMemo(() => {
    const arr = classeFilter ? cours.filter(c => c.classeId === classeFilter) : cours
    return [...arr].sort((a, b) => {
      const dj = dayIndex(a.day) - dayIndex(b.day)
      if (dj !== 0) return dj
      const slot = compareText(a.startTime || a.seance, b.startTime || b.seance, locale)
      if (slot !== 0) return slot
      return compareText(a.classeId, b.classeId, locale)
    })
  }, [cours, classeFilter, locale])

  const renderItem = ({ item }: { item: Cours }) => {
    const dayLabel = item.day ? t(`daysShort.${item.day}`) : (item.dayFallback || '—')
    const slotLabel = item.seance || item.startTime || '—'

    return (
      <View
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={[styles.row, isAr && styles.rowReverse]}>
          <Text style={[styles.day, { color: theme.primary }, isAr && styles.rtlText]}>{dayLabel} · {slotLabel}</Text>
          <Text style={[styles.classe, { color: theme.text }, isAr && styles.rtlText]}>{item.classeId || '—'}</Text>
        </View>
        <Text style={[styles.matiere, { color: theme.text }, isAr && styles.rtlText]}>{item.matiere || '—'}</Text>
        <View style={[styles.metaRow, isAr && styles.rowReverse]}>
          {item.professeurNom ? <Text style={[styles.meta, { color: theme.textSoft }, isAr && styles.rtlText]}>👨‍🏫 {item.professeurNom}</Text> : null}
          {item.salle          ? <Text style={[styles.meta, { color: theme.textSoft }, isAr && styles.rtlText]}>📍 {item.salle}</Text> : null}
        </View>
      </View>
    )
  }

  return (
    <ScreenLayout title={t('admin.scheduleTitle')}>
      {error ? (
        <View
          style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}
        >
          <Text style={[styles.errorText, { color: theme.danger }, isAr && styles.rtlText]}>{error}</Text>
          <TouchableOpacity
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel={t('admin.retryDashboard')}
            style={[styles.retryButton, { backgroundColor: theme.danger }]}
          >
            <Text style={[styles.retryText, { color: theme.white }]}>{t('admin.retryDashboard')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {allClasses.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={[styles.filterContent, isAr && styles.rowReverse]}
        >
          <TouchableOpacity
            onPress={() => setClasseFilter('')}
            accessibilityRole="button"
            accessibilityState={{ selected: !classeFilter }}
            accessibilityLabel={t('admin.allClasses')}
            style={[styles.chip, { borderColor: !classeFilter ? theme.primary : theme.border, backgroundColor: !classeFilter ? theme.primarySurface : 'transparent' }]}
          >
            <Text style={[{ color: !classeFilter ? theme.primary : theme.textSoft, fontWeight: !classeFilter ? '700' : '500', fontSize: 12 }, isAr && styles.rtlText]}>
              {t('admin.allClasses')}
            </Text>
          </TouchableOpacity>
          {allClasses.map(c => {
            const active = classeFilter === c
            return (
              <TouchableOpacity key={c}
                onPress={() => setClasseFilter(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c}
                style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}
              >
                <Text style={[{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }, isAr && styles.rtlText]}>{c}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {error && cours.length === 0 ? null : loading && cours.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('admin.noCourse')}{classeFilter ? ` (${classeFilter})` : ''}.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  filterRow: { marginBottom: 12, flexGrow: 0 },
  filterContent: { gap: 8 },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  card:      { padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  day:       { fontSize: 12, fontWeight: '800' },
  classe:    { fontSize: 13, fontWeight: '600' },
  matiere:   { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  metaRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta:      { fontSize: 12 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center' },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12, gap: 10 },
  errorText: { fontSize: 13 },
  retryButton: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  retryText: { fontSize: 12, fontWeight: '700' },
});
