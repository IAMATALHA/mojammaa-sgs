import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import {
  Users, TrendingUp, Award, TrendingDown, Target,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import { db } from '../../config/firebase'
import { toDoc } from '../../services/firestore'
import type { AbsenceDoc } from '../../services/absencesService'
import type { TeacherStackParamList } from '../../navigation/types'

const CLASS_COLORS = [
  { bg: '#1D3557', fg: '#FFFFFF', accent: '#FFD23F' },  // navy (brand)
  { bg: '#E63946', fg: '#FFFFFF', accent: '#FFD23F' },  // rouge corail (M rouge logo)
  { bg: '#D95B00', fg: '#FFFFFF', accent: '#FFD23F' },  // ambre foncé (fleur logo)
  { bg: '#D4A017', fg: '#FFFFFF', accent: '#1D3557' },  // jaune doré (M jaune logo)
  { bg: '#C0392B', fg: '#FFFFFF', accent: '#FFD23F' },  // rouge foncé (variante logo)
  { bg: '#C24E00', fg: '#FFFFFF', accent: '#FFD23F' },  // ambre profond (variante)
]

interface ClassStats {
  name: string
  studentCount: number
  avgNote: number | null
  topNote: number | null
  minNote: number | null
  successRate: number | null
  absencesMonth: number
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function TeacherStatsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const { profile } = useAuth()
  const teacher = useTeacherData()
  const [classStats, setClassStats] = useState<ClassStats[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (teacher.classes.length === 0 || !profile?.uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const mStart = monthStart()
      const results: ClassStats[] = []

      for (const c of teacher.classes) {
        const [notesSnap, absMonthSnap] = await Promise.all([
          getDocs(query(collection(db, 'notes'), where('classe', '==', c))),
          getDocs(query(collection(db, 'absences'), where('classe', '==', c), where('statut', '==', 'absent'))),
        ])

        const notesByEleve = new Map<string, number[]>()
        notesSnap.forEach(d => {
          const data = toDoc<{ note?: number; eleveId?: string }>(d)
          const n = data.note
          const eId = data.eleveId
          if (typeof n === 'number' && n >= 0 && n <= 20 && eId) {
            const arr = notesByEleve.get(eId) || []
            arr.push(n)
            notesByEleve.set(eId, arr)
          }
        })

        const allNotes: number[] = []
        notesByEleve.forEach(ns => allNotes.push(...ns))

        const eleveAvgs: number[] = []
        notesByEleve.forEach(ns => {
          eleveAvgs.push(ns.reduce((s, v) => s + v, 0) / ns.length)
        })

        const absencesMonth = absMonthSnap.docs.filter(d => {
          const date = toDoc<AbsenceDoc>(d).date
          return typeof date === 'string' && date >= mStart
        }).length

        const studentCount = teacher.byClasse[c]?.length ?? 0

        results.push({
          name: c,
          studentCount,
          avgNote: allNotes.length > 0 ? Math.round((allNotes.reduce((s, v) => s + v, 0) / allNotes.length) * 10) / 10 : null,
          topNote: allNotes.length > 0 ? Math.max(...allNotes) : null,
          minNote: allNotes.length > 0 ? Math.min(...allNotes) : null,
          successRate: eleveAvgs.length > 0 ? Math.round((eleveAvgs.filter(a => a >= 10).length / eleveAvgs.length) * 100) : null,
          absencesMonth,
        })
      }

      results.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setClassStats(results)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [teacher.classes.join('|'), profile?.uid])

  useEffect(() => { load() }, [load])

  return (
    <ScreenLayout title={t('teacher.classPerformance')}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && classStats.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : classStats.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.textSoft, fontSize: 14 }}>{t('common.noData')}</Text>
          </View>
        ) : (
          classStats.map((cs, idx) => {
            const palette = CLASS_COLORS[idx % CLASS_COLORS.length]
            return (
              <Pressable
                key={cs.name}
                onPress={() => navigation.navigate('TeacherClasseFolder', { classe: cs.name })}
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
                style={({ pressed }) => [styles.classCard, { backgroundColor: palette.bg, opacity: pressed ? 0.92 : 1 }]}
              >
                {/* Header */}
                <View style={styles.cardHeader}>
                  <Text style={[styles.className, { color: palette.fg }]}>{cs.name}</Text>
                  <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Users size={12} color={palette.fg} strokeWidth={2} />
                    <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 12, marginStart: 4 }}>
                      {cs.studentCount}
                    </Text>
                  </View>
                </View>

                {/* 4 KPIs */}
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <TrendingUp size={14} color={palette.accent} strokeWidth={2} />
                    <Text style={[styles.kpiValue, { color: palette.fg }]}>
                      {cs.avgNote != null ? `${cs.avgNote}` : '—'}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                      {t('teacher.avgLabel')}
                    </Text>
                  </View>
                  <View style={[styles.kpiBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <Award size={14} color={palette.accent} strokeWidth={2} />
                    <Text style={[styles.kpiValue, { color: palette.fg }]}>
                      {cs.topNote != null ? `${cs.topNote}` : '—'}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                      {t('teacher.statTop')}
                    </Text>
                  </View>
                  <View style={[styles.kpiBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <TrendingDown size={14} color={palette.accent} strokeWidth={2} />
                    <Text style={[styles.kpiValue, { color: palette.fg }]}>
                      {cs.minNote != null ? `${cs.minNote}` : '—'}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                      {t('teacher.statMin')}
                    </Text>
                  </View>
                  <View style={[styles.kpiBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <Target size={14} color={palette.accent} strokeWidth={2} />
                    <Text style={[styles.kpiValue, { color: palette.fg }]}>
                      {cs.successRate != null ? `${cs.successRate}%` : '—'}
                    </Text>
                    <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.7)' }]}>
                      {t('teacher.statPass')}
                    </Text>
                  </View>
                </View>

                {/* Bottom detail */}
                <View style={styles.detailRow}>
                  <Text style={{ color: palette.fg, fontSize: 12, opacity: 0.75 }}>
                    {cs.absencesMonth} {t('tabs.absences').toLowerCase()} · {t('parent.history').toLowerCase()}
                  </Text>
                </View>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },

  classCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  className: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  kpiRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 5,
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
})
