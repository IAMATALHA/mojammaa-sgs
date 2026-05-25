import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { collection, getDocs } from 'firebase/firestore'
import ScreenLayout from '../../components/ScreenLayout'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import type { RoleRaw } from '../../types'

interface UserRow {
  uid: string
  nom: string
  prenom: string
  email: string
  role: RoleRaw
  classe?: string
  classes?: string[]
}

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  admin:      { bg: '#1D3557', fg: '#FFFFFF' },
  professeur: { bg: '#D95B00', fg: '#FFFFFF' },
  parent:     { bg: '#52B788', fg: '#FFFFFF' },
}

export default function AdminUsersScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'admin' | 'professeur' | 'parent'>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(collection(db, 'users'))
      const list: UserRow[] = snap.docs.map(d => {
        const data = d.data() as any
        return {
          uid: d.id,
          nom: data.nom || '',
          prenom: data.prenom || '',
          email: data.email || '',
          role: data.role || 'parent',
          classe: data.classe,
          classes: data.classes,
        }
      })
      list.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setUsers(list)
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const displayed = filter === 'all' ? users : users.filter(u => u.role === filter)
  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    professeur: users.filter(u => u.role === 'professeur').length,
    parent: users.filter(u => u.role === 'parent').length,
  }

  const renderItem = ({ item }: { item: UserRow }) => {
    const rc = ROLE_COLORS[item.role] || ROLE_COLORS.parent
    const classInfo = item.classes?.join(', ') || item.classe || ''
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: rc.bg }]}>
          <Text style={{ color: rc.fg, fontWeight: '800', fontSize: 14 }}>
            {(item.prenom[0] || '?').toUpperCase()}{(item.nom[0] || '').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={[styles.name, { color: theme.text }]}>
            {item.prenom} {item.nom}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 1 }}>{item.email}</Text>
          <View style={styles.tagsRow}>
            <View style={[styles.tag, { backgroundColor: rc.bg }]}>
              <Text style={{ color: rc.fg, fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}>
                {item.role.toUpperCase()}
              </Text>
            </View>
            {classInfo ? (
              <View style={[styles.tag, { backgroundColor: theme.primarySurface }]}>
                <Text style={{ color: theme.primary, fontSize: 9, fontWeight: '700' }}>{classInfo}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    )
  }

  return (
    <ScreenLayout title={t('admin.users')}>
      <View style={styles.filterRow}>
        {(['all', 'admin', 'professeur', 'parent'] as const).map(v => {
          const active = filter === v
          const label = v === 'all' ? t('admin.allUsers', { count: counts.all })
            : v === 'admin' ? t('admin.adminCount', { count: counts.admin })
            : v === 'professeur' ? t('admin.profCount', { count: counts.professeur })
            : t('admin.parentCount', { count: counts.parent })
          return (
            <TouchableOpacity
              key={v}
              onPress={() => setFilter(v)}
              style={[styles.chip, {
                borderColor: active ? theme.primary : theme.border,
                backgroundColor: active ? theme.primary : 'transparent',
              }]}
            >
              <Text style={{ color: active ? '#fff' : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>
                {label}
              </Text>
            </TouchableOpacity>
          )
        })}
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
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>{t('admin.noUserFilter')}</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => item.uid}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },

  card: { padding: 14, marginBottom: 10, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 12 },
})
