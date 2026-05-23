import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../config/firebase';

interface ClasseStat {
  name:       string
  niveau:     string
  eleveCount: number
}

export default function AdminClassesScreen() {
  const theme = useTheme();
  const [classes, setClasses] = useState<ClasseStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(collection(db, 'eleves'))
      const map = new Map<string, { niveau: string; count: number }>()
      snap.forEach(d => {
        const data   = d.data() as any
        const c      = String(data.classe || '')
        const niveau = String(data.niveau || '')
        if (!c) return
        const cur = map.get(c) || { niveau, count: 0 }
        cur.count += 1
        if (!cur.niveau && niveau) cur.niveau = niveau
        map.set(c, cur)
      })
      const rows: ClasseStat[] = [...map.entries()]
        .map(([name, v]) => ({ name, niveau: v.niveau, eleveCount: v.count }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setClasses(rows)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les classes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalEleves = classes.reduce((sum, c) => sum + c.eleveCount, 0)

  const renderItem = ({ item }: { item: ClasseStat }) => (
    <TouchableOpacity style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
          {item.niveau ? <Text style={[styles.niveau, { color: theme.textSoft }]}>{item.niveau}</Text> : null}
        </View>
        <View style={styles.countWrap}>
          <Text style={[styles.count, { color: theme.primary }]}>{item.eleveCount}</Text>
          <Text style={[styles.countLabel, { color: theme.textSoft }]}>élève{item.eleveCount > 1 ? 's' : ''}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout title="Classes">
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
            Aucune classe dans la base.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.summary, { backgroundColor: theme.primarySurface }]}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>
              {classes.length} classes · {totalEleves} élèves au total
            </Text>
          </View>
          <FlatList
            data={classes}
            keyExtractor={item => item.name}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
          />
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  summary:    { padding: 12, borderRadius: 10, marginBottom: 12 },
  card:       { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:       { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  niveau:     { fontSize: 12 },
  countWrap:  { alignItems: 'flex-end' },
  count:      { fontSize: 22, fontWeight: '800' },
  countLabel: { fontSize: 11 },
  loading:    { paddingVertical: 40, alignItems: 'center' },
  empty:      { paddingVertical: 60, alignItems: 'center' },
  errorBox:   { padding: 12, borderRadius: 10, marginBottom: 12 },
});
