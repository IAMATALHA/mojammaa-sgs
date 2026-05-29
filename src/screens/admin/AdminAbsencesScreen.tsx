import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  Pressable,
} from 'react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import { CalendarX, Clock, CheckCircle2, AlertTriangle } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'

interface AbsenceRow {
  id: string
  eleveId: string
  eleveNom: string
  elevePrenom: string
  classe: string
  seance: string
  date: string
  statut: string
}

interface RecidivisteRow {
  eleveId: string
  eleveNom: string
  elevePrenom: string
  classe: string
  absCount: number
  retCount: number
  total: number
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type Tab = 'absences' | 'retards' | 'recidivistes'

export default function AdminAbsencesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [absents, setAbsents] = useState<AbsenceRow[]>([])
  const [retards, setRetards] = useState<AbsenceRow[]>([])
  const [allMonth, setAllMonth] = useState<AbsenceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('absences')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = todayISO()
      const mStart = monthStart()
      const [absSnap, retSnap, monthSnap] = await Promise.all([
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'absent'))),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'retard'))),
        getDocs(query(collection(db, 'absences'), where('statut', 'in', ['absent', 'retard']))),
      ])
      const toRow = (d: any): AbsenceRow => {
        const data = d.data()
        return { id: d.id, eleveId: data.eleveId || '', eleveNom: data.eleveNom || '', elevePrenom: data.elevePrenom || '', classe: data.classe || '', seance: data.seance || '', date: data.date || '', statut: data.statut }
      }
      setAbsents(absSnap.docs.map(toRow))
      setRetards(retSnap.docs.map(toRow))
      setAllMonth(monthSnap.docs.map(toRow).filter(r => r.date >= mStart))
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const recidivistes = useMemo(() => {
    const map = new Map<string, { eleveId: string; eleveNom: string; elevePrenom: string; classe: string; abs: number; ret: number }>()
    allMonth.forEach(a => {
      const key = a.eleveId
      const cur = map.get(key) || { eleveId: a.eleveId, eleveNom: a.eleveNom, elevePrenom: a.elevePrenom, classe: a.classe, abs: 0, ret: 0 }
      if (a.statut === 'absent') cur.abs++
      if (a.statut === 'retard') cur.ret++
      map.set(key, cur)
    })
    return [...map.values()]
      .map(r => ({ ...r, absCount: r.abs, retCount: r.ret, total: r.abs + r.ret }))
      .filter(r => r.total >= 3)
      .sort((a, b) => b.total - a.total)
  }, [allMonth])

  const grouped = (list: AbsenceRow[]) => {
    const map = new Map<string, AbsenceRow[]>()
    list.forEach(a => {
      const arr = map.get(a.classe) || []
      arr.push(a)
      map.set(a.classe, arr)
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'absences', label: t('tabs.absences'), count: absents.length, color: theme.danger },
    { key: 'retards', label: t('parent.lateArrivals'), count: retards.length, color: theme.warning },
    { key: 'recidivistes', label: t('admin.recidivistes'), count: recidivistes.length, color: theme.primary },
  ]

  return (
    <ScreenLayout title={t('admin.attendanceToday')}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map(tb => {
          const active = tab === tb.key
          return (
            <Pressable
              key={tb.key}
              onPress={() => setTab(tb.key)}
              style={[styles.tabChip, {
                backgroundColor: active ? tb.color : 'transparent',
                borderColor: active ? tb.color : theme.border,
              }]}
            >
              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>
                {tb.label}
              </Text>
              <View style={[styles.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : theme.surfaceAlt }]}>
                <Text style={{ color: active ? '#fff' : theme.textSoft, fontWeight: '800', fontSize: 10 }}>{tb.count}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : tab === 'absences' ? (
          absents.length === 0 ? (
            <EmptyBlock icon={<CheckCircle2 size={28} color={theme.success} strokeWidth={1.5} />} text={t('parent.noAbsence')} theme={theme} />
          ) : (
            grouped(absents).map(([classe, items]) => (
              <ClassGroup key={`a-${classe}`} classe={classe} items={items} color={theme.danger} theme={theme} />
            ))
          )
        ) : tab === 'retards' ? (
          retards.length === 0 ? (
            <EmptyBlock icon={<CheckCircle2 size={28} color={theme.success} strokeWidth={1.5} />} text={t('parent.noAbsence')} theme={theme} />
          ) : (
            grouped(retards).map(([classe, items]) => (
              <ClassGroup key={`r-${classe}`} classe={classe} items={items} color={theme.warning} theme={theme} />
            ))
          )
        ) : (
          recidivistes.length === 0 ? (
            <EmptyBlock icon={<CheckCircle2 size={28} color={theme.success} strokeWidth={1.5} />} text={t('admin.noRecidivistes')} theme={theme} />
          ) : (
            recidivistes.map((r, idx) => (
              <View key={r.eleveId} style={[styles.recCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.rankCircle, { backgroundColor: idx < 3 ? theme.danger : theme.warning }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{r.elevePrenom} {r.eleveNom}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{r.classe}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={styles.recStats}>
                    <CalendarX size={11} color={theme.danger} strokeWidth={2} />
                    <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 13, marginStart: 3 }}>{r.absCount}</Text>
                  </View>
                  <View style={[styles.recStats, { marginTop: 4 }]}>
                    <Clock size={11} color={theme.warning} strokeWidth={2} />
                    <Text style={{ color: theme.warning, fontWeight: '800', fontSize: 13, marginStart: 3 }}>{r.retCount}</Text>
                  </View>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function ClassGroup({ classe, items, color, theme }: {
  classe: string; items: AbsenceRow[]; color: string; theme: Theme
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.classeLabel, { color: theme.primary }]}>{classe}</Text>
      {items.map(a => (
        <View key={a.id} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14, flex: 1 }}>{a.elevePrenom} {a.eleveNom}</Text>
          <Text style={{ color: theme.textSoft, fontSize: 11 }}>{a.seance}</Text>
        </View>
      ))}
    </View>
  )
}

function EmptyBlock({ icon, text, theme }: { icon: React.ReactNode; text: string; theme: Theme }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  tabChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 50, alignItems: 'center' },
  classeLabel: { fontWeight: '800', fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginEnd: 10 },
  recCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  rankCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  recStats: { flexDirection: 'row', alignItems: 'center' },
})
