import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../config/firebase';

interface Stats {
  totalEleves:    number
  totalUsers:     number
  byRole:         Record<string, number>
  byNiveau:       Record<string, number>
  topClasses:     { name: string; count: number }[]
  absentsToday:   number
  attendanceRate: number
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function AdminStatsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const today = todayISO()
      const [elevesSnap, usersSnap, absentsSnap] = await Promise.all([
        getDocs(collection(db, 'eleves')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'absent'))),
      ])

      const byRole: Record<string, number> = {}
      usersSnap.forEach(d => {
        const r = (d.data() as any).role || 'parent'
        byRole[r] = (byRole[r] || 0) + 1
      })

      const byNiveau: Record<string, number> = {}
      const classMap   = new Map<string, number>()
      elevesSnap.forEach(d => {
        const data = d.data() as any
        const n = (data.niveau || '').toString() || 'Non précisé'
        byNiveau[n] = (byNiveau[n] || 0) + 1
        const c = data.classe
        if (c) classMap.set(c, (classMap.get(c) || 0) + 1)
      })

      const topClasses = [...classMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      const totalEleves   = elevesSnap.size
      const absentsToday  = absentsSnap.size
      const attendanceRate = totalEleves > 0
        ? Math.round(((totalEleves - absentsToday) / totalEleves) * 100)
        : 100

      setStats({
        totalEleves,
        totalUsers: usersSnap.size,
        byRole,
        byNiveau,
        topClasses,
        absentsToday,
        attendanceRate,
      })
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les statistiques.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <ScreenLayout title={t('admin.statsTitle')}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
            <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {loading && !stats ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : stats ? (
          <>
            {/* Présence du jour */}
            <View style={[styles.bigCard, { backgroundColor: theme.primary }]}>
              <Text style={styles.bigCardLabel}>{t('admin.attendanceToday')}</Text>
              <Text style={styles.bigCardValue}>{stats.attendanceRate}%</Text>
              <Text style={styles.bigCardSub}>
                {t('admin.absentsOf', { absents: stats.absentsToday, total: stats.totalEleves })}
              </Text>
            </View>

            {/* Comptes utilisateurs */}
            <Text style={[styles.section, { color: theme.textSoft }]}>{t('admin.usersSection')}</Text>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {Object.entries(stats.byRole)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <View key={role} style={styles.rowItem}>
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
                    <Text style={[styles.rowValue, { color: theme.primary }]}>{count}</Text>
                  </View>
                ))}
              <View style={[styles.rowItem, styles.totalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.rowLabel, { color: theme.text, fontWeight: '800' }]}>{t('admin.total')}</Text>
                <Text style={[styles.rowValue, { color: theme.text }]}>{stats.totalUsers}</Text>
              </View>
            </View>

            {/* Par niveau */}
            {Object.keys(stats.byNiveau).length > 0 && (
              <>
                <Text style={[styles.section, { color: theme.textSoft }]}>{t('admin.byLevel')}</Text>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {Object.entries(stats.byNiveau)
                    .sort((a, b) => b[1] - a[1])
                    .map(([niveau, count]) => (
                      <View key={niveau} style={styles.rowItem}>
                        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>{niveau}</Text>
                        <Text style={[styles.rowValue, { color: theme.primary }]}>{count}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}

            {/* Top classes */}
            {stats.topClasses.length > 0 && (
              <>
                <Text style={[styles.section, { color: theme.textSoft }]}>{t('admin.topClasses')}</Text>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {stats.topClasses.map((c, i) => (
                    <View key={c.name} style={styles.rowItem}>
                      <Text style={[styles.rowLabel, { color: theme.text }]}>
                        {i + 1}. {c.name}
                      </Text>
                      <Text style={[styles.rowValue, { color: theme.primary }]}>{c.count}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  bigCard:      { padding: 20, borderRadius: 16, marginBottom: 20 },
  bigCardLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  bigCardValue: { color: '#fff', fontSize: 44, fontWeight: '800', marginVertical: 4 },
  bigCardSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  section:  { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  card:     { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 16 },
  rowItem:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  rowLabel: { fontSize: 13, flex: 1 },
  rowValue: { fontSize: 15, fontWeight: '700' },

  loading:  { paddingVertical: 40, alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 12 },
});
