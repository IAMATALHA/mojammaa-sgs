import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';

type Jour = 'Lun' | 'Mar' | 'Mer' | 'Jeu' | 'Ven' | 'Sam' | 'Dim'
const JOURS: Jour[] = ['Sam', 'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

interface Cours {
  id:           string
  classeId:     string
  jour:         Jour
  seance:       string  // S1..S6
  matiere:      string
  salle?:       string
  professeurNom?: string
}

const SEANCE_LABEL: Record<string, string> = {
  S1: '08:30 – 09:30',
  S2: '09:30 – 10:30',
  S3: '10:30 – 11:30',
  S4: '11:30 – 12:30',
  S5: '13:00 – 14:00',
  S6: '14:00 – 15:00',
}

function jourFromDate(d: Date): Jour {
  return ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()] as Jour
}

export default function TeacherEdtScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const [cours,   setCours]   = useState<Cours[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fullName = profile ? `${profile.prenom} ${profile.nom}`.trim() : ''
  const today    = useMemo(() => jourFromDate(new Date()), [])

  const load = useCallback(async () => {
    if (!fullName) return
    setLoading(true); setError(null)
    try {
      // Le schema actuel d'emploiDuTemps n'a pas professeurUid, on filtre
      // par nom complet. Pas idéal mais consistant avec l'app parent.
      const snap = await getDocs(
        query(collection(db, 'emploiDuTemps'), where('professeurNom', '==', fullName))
      )
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Cours[]
      // Tri par jour puis par seance.
      list.sort((a, b) => {
        const dj = JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)
        if (dj !== 0) return dj
        return a.seance.localeCompare(b.seance)
      })
      setCours(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger l\'emploi du temps.')
    } finally {
      setLoading(false)
    }
  }, [fullName])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const map = new Map<Jour, Cours[]>()
    cours.forEach(c => {
      const arr = map.get(c.jour) || []
      arr.push(c)
      map.set(c.jour, arr)
    })
    return JOURS.filter(j => map.has(j)).map(j => ({ jour: j, items: map.get(j)! }))
  }, [cours])

  const renderGroup = ({ item }: { item: { jour: Jour; items: Cours[] } }) => {
    const isToday = item.jour === today
    return (
      <View style={styles.group}>
        <View style={[styles.dayHeader, isToday && { backgroundColor: theme.primarySurface }]}>
          <Text style={[styles.dayTitle, { color: isToday ? theme.primary : theme.textSoft }]}>
            {item.jour}{isToday ? ' · aujourd\'hui' : ''}
          </Text>
        </View>
        {item.items.map(c => (
          <View key={c.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.timeRow}>
              <Text style={[styles.seance, { color: theme.primary }]}>{c.seance}</Text>
              <Text style={[styles.timeText, { color: theme.textSoft }]}>
                {SEANCE_LABEL[c.seance] || ''}
              </Text>
            </View>
            <Text style={[styles.matiere, { color: theme.text }]}>{c.matiere}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.classe, { color: theme.text }]}>📚 {c.classeId}</Text>
              {c.salle ? <Text style={[styles.salle, { color: theme.textSoft }]}>📍 {c.salle}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    )
  }

  return (
    <ScreenLayout title="Mon emploi du temps">
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && cours.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            Aucun cours trouvé pour vous.{'\n'}
            <Text style={{ fontSize: 12 }}>
              (recherché par nom complet "{fullName}")
            </Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.jour}
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
