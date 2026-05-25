import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import {
  Users, GraduationCap, CheckCircle2, CalendarX, TrendingUp, Award, BookOpen,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'

const CARD_COLORS = [
  { bg: '#1D3557', fg: '#FFFFFF', accent: '#FFD23F' },
  { bg: '#E63946', fg: '#FFFFFF', accent: '#FFD23F' },
  { bg: '#D95B00', fg: '#FFFFFF', accent: '#FFD23F' },
  { bg: '#D4A017', fg: '#FFFFFF', accent: '#1D3557' },
  { bg: '#C0392B', fg: '#FFFFFF', accent: '#FFD23F' },
  { bg: '#C24E00', fg: '#FFFFFF', accent: '#FFD23F' },
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

interface ProfsActivity {
  total: number
  withAppels: number
  withDevoirs: number
  withNotes: number
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function AdminStatsScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [classStats, setClassStats] = useState<ClassStats[]>([])
  const [profsActivity, setProfsActivity] = useState<ProfsActivity | null>(null)
  const [globalStats, setGlobalStats] = useState<{ totalEleves: number; absentsToday: number; presenceRate: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = todayISO()
      const mStart = monthStart()

      const [elevesSnap, usersSnap, notesSnap, absAllSnap, absTodaySnap, devoirsSnap] = await Promise.all([
        getDocs(collection(db, 'eleves')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'notes')),
        getDocs(query(collection(db, 'absences'), where('statut', '==', 'absent'))),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'absent'))),
        getDocs(collection(db, 'devoirs')),
      ])

      // Global
      const totalEleves = elevesSnap.size
      const uniqueAbsent = new Set<string>()
      absTodaySnap.forEach(d => uniqueAbsent.add((d.data() as any).eleveId))
      const absentsToday = uniqueAbsent.size
      const presenceRate = totalEleves > 0 ? Math.round(((totalEleves - absentsToday) / totalEleves) * 100) : 100
      setGlobalStats({ totalEleves, absentsToday, presenceRate })

      // Group eleves by class
      const classeMap = new Map<string, number>()
      elevesSnap.forEach(d => {
        const c = (d.data() as any).classe
        if (c) classeMap.set(c, (classeMap.get(c) || 0) + 1)
      })

      // Notes by class
      const notesByClassEleve = new Map<string, Map<string, number[]>>()
      notesSnap.forEach(d => {
        const data = d.data() as any
        const n = data.note
        const c = data.classe
        const eId = data.eleveId
        if (typeof n === 'number' && n >= 0 && n <= 20 && c && eId) {
          if (!notesByClassEleve.has(c)) notesByClassEleve.set(c, new Map())
          const em = notesByClassEleve.get(c)!
          const arr = em.get(eId) || []
          arr.push(n)
          em.set(eId, arr)
        }
      })

      // Absences by class (this month)
      const absByClass = new Map<string, number>()
      absAllSnap.forEach(d => {
        const data = d.data() as any
        if (typeof data.date === 'string' && data.date >= mStart && data.classe) {
          absByClass.set(data.classe, (absByClass.get(data.classe) || 0) + 1)
        }
      })

      // Build class stats
      const results: ClassStats[] = []
      classeMap.forEach((count, name) => {
        const noteMap = notesByClassEleve.get(name)
        const allNotes: number[] = []
        const eleveAvgs: number[] = []
        if (noteMap) {
          noteMap.forEach(ns => {
            allNotes.push(...ns)
            eleveAvgs.push(ns.reduce((s, v) => s + v, 0) / ns.length)
          })
        }
        results.push({
          name,
          studentCount: count,
          avgNote: allNotes.length > 0 ? Math.round((allNotes.reduce((s, v) => s + v, 0) / allNotes.length) * 10) / 10 : null,
          topNote: allNotes.length > 0 ? Math.max(...allNotes) : null,
          minNote: allNotes.length > 0 ? Math.min(...allNotes) : null,
          successRate: eleveAvgs.length > 0 ? Math.round((eleveAvgs.filter(a => a >= 10).length / eleveAvgs.length) * 100) : null,
          absencesMonth: absByClass.get(name) || 0,
        })
      })
      results.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setClassStats(results)

      // Profs activity
      const profs = usersSnap.docs.filter(d => (d.data() as any).role === 'professeur')
      const profIds = new Set(profs.map(d => d.id))
      const profsWithAppels = new Set<string>()
      absTodaySnap.forEach(d => {
        const pid = (d.data() as any).professorId
        if (pid && profIds.has(pid)) profsWithAppels.add(pid)
      })
      const profsWithDevoirs = new Set<string>()
      devoirsSnap.forEach(d => {
        const tid = (d.data() as any).teacherId
        if (tid && profIds.has(tid)) profsWithDevoirs.add(tid)
      })
      const profsWithNotes = new Set<string>()
      notesSnap.forEach(d => {
        const iby = (d.data() as any).importedBy
        if (iby && profIds.has(iby)) profsWithNotes.add(iby)
      })
      setProfsActivity({
        total: profs.length,
        withAppels: profsWithAppels.size,
        withDevoirs: profsWithDevoirs.size,
        withNotes: profsWithNotes.size,
      })
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <ScreenLayout title={t('admin.statsTitle')}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && !globalStats ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <>
            {/* Global presence card */}
            {globalStats && (
              <View style={[styles.presenceCard, { backgroundColor: globalStats.presenceRate >= 95 ? '#1D3557' : '#E63946' }]}>
                <Text style={styles.presenceLabel}>{t('admin.attendanceToday')}</Text>
                <Text style={styles.presenceValue}>{globalStats.presenceRate}%</Text>
                <Text style={styles.presenceSub}>
                  {t('admin.absentsOf', { absents: globalStats.absentsToday, total: globalStats.totalEleves })}
                </Text>
              </View>
            )}

            {/* Profs activity */}
            {profsActivity && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>
                  {t('admin.profs')}
                </Text>
                <View style={styles.profsRow}>
                  <ProfStat icon={<Users size={14} color="#457B9D" strokeWidth={2} />} value={profsActivity.total} label={t('admin.total')} bg="#E4F0F6" theme={theme} />
                  <ProfStat icon={<CheckCircle2 size={14} color="#52B788" strokeWidth={2} />} value={profsActivity.withAppels} label={t('attendance.takeAttendance')} bg="#E6F5ED" theme={theme} />
                  <ProfStat icon={<BookOpen size={14} color="#D95B00" strokeWidth={2} />} value={profsActivity.withDevoirs} label={t('tabs.homework')} bg="#FFF3E0" theme={theme} />
                  <ProfStat icon={<TrendingUp size={14} color="#1D3557" strokeWidth={2} />} value={profsActivity.withNotes} label={t('tabs.grades')} bg="#E8EEF4" theme={theme} />
                </View>
              </>
            )}

            {/* Per-class cards */}
            <Text style={[styles.sectionTitle, { color: theme.textSoft, marginTop: 20 }]}>
              {t('teacher.classPerformance')}
            </Text>
            {classStats.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ color: theme.textSoft, fontSize: 14 }}>{t('common.noData')}</Text>
              </View>
            ) : (
              classStats.map((cs, idx) => {
                const palette = CARD_COLORS[idx % CARD_COLORS.length]
                return (
                  <View key={cs.name} style={[styles.classCard, { backgroundColor: palette.bg }]}>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.className, { color: palette.fg }]}>{cs.name}</Text>
                      <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <Users size={12} color={palette.fg} strokeWidth={2} />
                        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 12, marginStart: 4 }}>{cs.studentCount}</Text>
                      </View>
                    </View>
                    <View style={styles.kpiRow}>
                      <KpiBox icon={<TrendingUp size={14} color={palette.accent} strokeWidth={2} />} value={cs.avgNote != null ? `${cs.avgNote}` : '—'} label={t('teacher.avgLabel')} fg={palette.fg} />
                      <KpiBox icon={<Award size={14} color={palette.accent} strokeWidth={2} />} value={cs.topNote != null ? `${cs.topNote}` : '—'} label="Top" fg={palette.fg} />
                      <KpiBox icon={<CalendarX size={14} color={palette.accent} strokeWidth={2} />} value={cs.minNote != null ? `${cs.minNote}` : '—'} label="Min" fg={palette.fg} />
                      <KpiBox icon={<GraduationCap size={14} color={palette.accent} strokeWidth={2} />} value={cs.successRate != null ? `${cs.successRate}%` : '—'} label="≥10" fg={palette.fg} />
                    </View>
                    <Text style={{ color: palette.fg, fontSize: 11, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
                      {cs.absencesMonth} {t('tabs.absences').toLowerCase()}
                    </Text>
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function ProfStat({ icon, value, label, bg, theme }: {
  icon: React.ReactNode; value: number; label: string; bg: string; theme: any
}) {
  return (
    <View style={[styles.profChip, { backgroundColor: bg }]}>
      {icon}
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 4 }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 8, fontWeight: '600', textTransform: 'uppercase', marginTop: 1 }}>{label}</Text>
    </View>
  )
}

function KpiBox({ icon, value, label, fg }: {
  icon: React.ReactNode; value: string; label: string; fg: string
}) {
  return (
    <View style={styles.kpiBox}>
      {icon}
      <Text style={{ color: fg, fontWeight: '800', fontSize: 18, marginTop: 5, letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 }}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center' },

  presenceCard: { padding: 20, borderRadius: 16, marginBottom: 20 },
  presenceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  presenceValue: { color: '#fff', fontSize: 44, fontWeight: '800', marginVertical: 4 },
  presenceSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  profsRow: { flexDirection: 'row', gap: 6 },
  profChip: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },

  classCard: { borderRadius: 18, padding: 18, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  className: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },

  kpiRow: { flexDirection: 'row', gap: 6 },
  kpiBox: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
})
