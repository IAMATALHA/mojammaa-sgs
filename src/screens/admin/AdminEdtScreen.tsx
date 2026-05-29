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

interface Cours {
  id:            string
  classeId:      string
  jour:          string
  seance:        string
  matiere:       string
  salle?:        string
  professeurNom?: string
}

const JOURS = ['Sam', 'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

export default function AdminEdtScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [cours,   setCours]   = useState<Cours[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [classeFilter, setClasseFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(collection(db, 'emploiDuTemps'))
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Cours[]
      setCours(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger l\'emploi du temps.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const allClasses = useMemo(() => {
    const set = new Set(cours.map(c => c.classeId).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cours])

  const filtered = useMemo(() => {
    const arr = classeFilter ? cours.filter(c => c.classeId === classeFilter) : cours
    return [...arr].sort((a, b) => {
      const dj = JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)
      if (dj !== 0) return dj
      return a.seance.localeCompare(b.seance)
    })
  }, [cours, classeFilter])

  const renderItem = ({ item }: { item: Cours }) => (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.row}>
        <Text style={[styles.day, { color: theme.primary }]}>{item.jour} · {item.seance}</Text>
        <Text style={[styles.classe, { color: theme.text }]}>{item.classeId}</Text>
      </View>
      <Text style={[styles.matiere, { color: theme.text }]}>{item.matiere}</Text>
      <View style={styles.metaRow}>
        {item.professeurNom ? <Text style={[styles.meta, { color: theme.textSoft }]}>👨‍🏫 {item.professeurNom}</Text> : null}
        {item.salle          ? <Text style={[styles.meta, { color: theme.textSoft }]}>📍 {item.salle}</Text> : null}
      </View>
    </View>
  )

  return (
    <ScreenLayout title={t('admin.scheduleTitle')}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {allClasses.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity
            onPress={() => setClasseFilter('')}
            style={[styles.chip, { borderColor: !classeFilter ? theme.primary : theme.border, backgroundColor: !classeFilter ? theme.primarySurface : 'transparent' }]}
          >
            <Text style={{ color: !classeFilter ? theme.primary : theme.textSoft, fontWeight: !classeFilter ? '700' : '500', fontSize: 12 }}>
              {t('admin.allClasses')}
            </Text>
          </TouchableOpacity>
          {allClasses.map(c => {
            const active = classeFilter === c
            return (
              <TouchableOpacity key={c}
                onPress={() => setClasseFilter(c)}
                style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}
              >
                <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>{c}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {loading && cours.length === 0 ? (
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
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  card:      { padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  day:       { fontSize: 12, fontWeight: '800' },
  classe:    { fontSize: 13, fontWeight: '600' },
  matiere:   { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  metaRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta:      { fontSize: 12 },
  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center' },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
});
