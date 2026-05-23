import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../config/firebase';
import type { RoleRaw } from '../../types';

interface UserRow {
  uid:    string
  nom:    string
  prenom: string
  email:  string
  role:   RoleRaw
  classe?: string
}

const ROLE_LABEL: Record<string, string> = {
  admin:      'ADMIN',
  professeur: 'PROF',
  parent:     'PARENT',
  student:    'ÉLÈVE',
}

export default function AdminUsersScreen() {
  const theme = useTheme();
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [filter,  setFilter]  = useState<'all' | 'admin' | 'professeur' | 'parent'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(collection(db, 'users'))
      const list: UserRow[] = snap.docs.map(d => {
        const data = d.data() as any
        return {
          uid:    d.id,
          nom:    data.nom    || '',
          prenom: data.prenom || '',
          email:  data.email  || '',
          role:   data.role   || 'parent',
          classe: data.classe,
        }
      })
      list.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setUsers(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les utilisateurs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const displayed = filter === 'all' ? users : users.filter(u => u.role === filter)

  const handleImpersonate = (user: UserRow) => {
    Alert.alert(
      'Mode impersonation',
      `Voir l'app comme ${user.prenom} ${user.nom} (${user.role}) ? Cette fonctionnalité sera implémentée prochainement.`
    )
  }

  const FilterChip = ({ value, label }: { value: typeof filter; label: string }) => {
    const active = filter === value
    return (
      <TouchableOpacity
        onPress={() => setFilter(value)}
        style={[
          styles.chip,
          { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' },
        ]}
      >
        <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  const renderItem = ({ item }: { item: UserRow }) => (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]}>
          {item.prenom} {item.nom}
        </Text>
        <Text style={[styles.email, { color: theme.textSoft }]}>{item.email}</Text>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: theme.primarySurface }]}>
            <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
              {ROLE_LABEL[item.role] || item.role.toUpperCase()}
            </Text>
          </View>
          {item.classe ? (
            <View style={[styles.tag, { backgroundColor: theme.border }]}>
              <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: '700' }}>{item.classe}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: theme.primarySurface }]}
        onPress={() => handleImpersonate(item)}
      >
        <Text style={[styles.btnText, { color: theme.primary }]}>Voir comme</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenLayout title="Utilisateurs">
      <View style={styles.filterRow}>
        <FilterChip value="all"        label={`Tous (${users.length})`} />
        <FilterChip value="admin"      label={`Admin (${users.filter(u => u.role === 'admin').length})`} />
        <FilterChip value="professeur" label={`Profs (${users.filter(u => u.role === 'professeur').length})`} />
        <FilterChip value="parent"     label={`Parents (${users.filter(u => u.role === 'parent').length})`} />
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && users.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : displayed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            Aucun utilisateur pour ce filtre.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.uid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  filterRow:     { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  chip:          { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  listContainer: { paddingBottom: 24 },
  card:          { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  info:          { flex: 1 },
  name:          { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  email:         { fontSize: 12, marginBottom: 6 },
  tagsRow:       { flexDirection: 'row', gap: 6 },
  tag:           { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  btn:           { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnText:       { fontSize: 12, fontWeight: '700' },
  loading:       { paddingVertical: 40, alignItems: 'center' },
  empty:         { paddingVertical: 40, alignItems: 'center' },
  errorBox:      { padding: 12, borderRadius: 10, marginBottom: 12 },
});
