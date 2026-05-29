import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare, Users, GraduationCap,
  CheckCircle2, CalendarX, BookOpen, Send, Clock,
} from 'lucide-react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { getTodayJour, type JourScolaire } from '../../services/calendarService'
import { SectionHeader, Card } from '../../components/dashboard'
import { greetingKey } from '../../utils/format'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

interface SchoolState {
  totalEleves: number
  totalProfs: number
  totalClasses: number
  absentsToday: number
  retardsToday: number
  presenceRate: number
  profsDoneAppel: number
  profsMissingAppel: number
  devoirsToday: number
  messagesToday: number
}

export default function AdminDashboardScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, logout } = useAuth()
  const nav = useNavigation<any>()
  const goTo = (route: string) => nav.navigate(route)

  const [state, setState] = useState<SchoolState | null>(null)
  const [todayJour, setTodayJour] = useState<JourScolaire | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Direction'

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const jour = await getTodayJour()
      setTodayJour(jour)

      const [elevesSnap, usersSnap, absAbsentSnap, absRetardSnap, absAllSnap, devoirsSnap, msgsSnap, schedulesSnap] = await Promise.all([
        getDocs(collection(db, 'eleves')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'absent'))),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'retard'))),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
        getDocs(collection(db, 'devoirs')),
        getDocs(collection(db, 'messages')),
        getDocs(collection(db, 'schedules')),
      ])

      const totalEleves = elevesSnap.size
      const profs = usersSnap.docs.filter(d => (d.data() as any).role === 'professeur')
      const totalProfs = profs.length

      const uniqueAbsentEleves = new Set<string>()
      absAbsentSnap.forEach(d => uniqueAbsentEleves.add((d.data() as any).eleveId))

      const uniqueRetardEleves = new Set<string>()
      absRetardSnap.forEach(d => uniqueRetardEleves.add((d.data() as any).eleveId))

      const classeSet = new Set<string>()
      elevesSnap.forEach(d => {
        const c = (d.data() as any).classe
        if (c) classeSet.add(c)
      })

      // Find which profs did appel today
      const profsDoneAppel = new Set<string>()
      absAllSnap.forEach(d => {
        const pid = (d.data() as any).professorId
        if (pid) profsDoneAppel.add(pid)
      })

      // Find which profs have courses today but haven't done appel
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const todayDay = dayNames[new Date().getDay()]
      const profsWithCoursToday = new Set<string>()
      schedulesSnap.forEach(d => {
        const data = d.data() as any
        const slots = data.weeklySlots
        if (Array.isArray(slots)) {
          const hasToday = slots.some((s: any) => s.day === todayDay)
          if (hasToday) profsWithCoursToday.add(d.id)
        }
      })
      const profsMissingAppel = [...profsWithCoursToday].filter(pid => !profsDoneAppel.has(pid)).length

      const devoirsToday = devoirsSnap.docs.filter(d => {
        const dl = (d.data() as any).dateLimite
        return typeof dl === 'string' && dl >= today
      }).length

      const todayMessages = msgsSnap.docs.filter(d => {
        const ca = (d.data() as any).createdAt
        if (!ca?.toDate) return false
        return ca.toDate().toISOString().split('T')[0] === today
      })

      setState({
        totalEleves,
        totalProfs,
        totalClasses: classeSet.size,
        absentsToday: uniqueAbsentEleves.size,
        retardsToday: uniqueRetardEleves.size,
        presenceRate: totalEleves > 0 ? Math.round(((totalEleves - uniqueAbsentEleves.size) / totalEleves) * 100) : 100,
        profsDoneAppel: profsDoneAppel.size,
        profsMissingAppel,
        devoirsToday,
        messagesToday: todayMessages.length,
      })
    } catch (e: any) {
      console.warn('[admin dashboard]', e?.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleAccountPress = () => {
    Alert.alert(
      fullName,
      profile?.email ?? t('admin.accountAdmin'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.logout'), style: 'destructive', onPress: () => logout().catch(() => {}) },
      ],
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── Header strip ──────────────────────────────── */}
        <View style={[styles.headerStrip, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <Pressable onPress={handleAccountPress} hitSlop={8} style={styles.accountBlock}>
            <Text numberOfLines={1} style={{
              color: theme.text,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              fontSize: isAr ? 16 : 15,
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t(greetingKey())}, {fullName.split(' ')[0] || 'Admin'}
            </Text>
            <Text style={{
              color: theme.textSoft,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              fontSize: 11,
              letterSpacing: isAr ? 0 : 0.5,
              marginTop: 2,
              textTransform: 'uppercase',
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t('roles.admin')}
            </Text>
          </Pressable>
          <Pressable onPress={() => goTo('AdminMessages')} hitSlop={8} style={[styles.bellBtn, { backgroundColor: theme.surface }]}>
            <MessageSquare size={18} color={theme.text} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Special day banner */}
        {todayJour && todayJour.annuleCours ? (
          <View style={[styles.specialBanner, { backgroundColor: todayJour.type === 'vacances' ? '#52B788' : todayJour.type === 'examen' ? '#E63946' : '#D95B00' }]}>
            <CalendarX size={18} color="#fff" strokeWidth={2} />
            <View style={{ flex: 1, marginStart: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('calendar.specialDay')}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{todayJour.label} — {t('calendar.coursesCancelled')}</Text>
            </View>
          </View>
        ) : null}

        {loading && !state ? (
          <View style={styles.loadingBox}><ActivityIndicator color={theme.primary} /></View>
        ) : state ? (
          <>
            {/* ── État de l'école ────────────────────────── */}
            <View style={styles.section}>
              <SectionHeader title={t('admin.attendanceToday')} />
              <Pressable onPress={() => goTo('AdminAbsences')}>
                <View style={[styles.stateCard, { backgroundColor: state.absentsToday > 5 ? '#FEF2F0' : '#F0F7F4', borderColor: state.absentsToday > 5 ? '#FADAD4' : '#D4EDDA' }]}>
                  <View style={styles.stateRow}>
                    <StatBlock value={String(state.absentsToday)} label={t('tabs.absences')} color={state.absentsToday > 0 ? theme.danger : theme.success} theme={theme} isAr={isAr} />
                    <View style={[styles.statSep, { backgroundColor: theme.border }]} />
                    <StatBlock value={String(state.retardsToday)} label={t('parent.lateArrivals')} color={state.retardsToday > 0 ? theme.warning : theme.success} theme={theme} isAr={isAr} />
                    <View style={[styles.statSep, { backgroundColor: theme.border }]} />
                    <StatBlock value={String(state.presenceRate)} suffix="%" label={t('admin.attendanceRate')} color={state.presenceRate >= 95 ? theme.success : state.presenceRate >= 85 ? theme.warning : theme.danger} theme={theme} isAr={isAr} />

                  </View>
                </View>
              </Pressable>
            </View>

            {/* ── Résumé école ───────────────────────────── */}
            <View style={styles.section}>
              <View style={styles.summaryRow}>
                <View style={{ flex: 1 }}>
                  <SummaryChip icon={<Users size={14} color="#457B9D" strokeWidth={2} />} value={state.totalProfs} label={t('admin.profs')} bg="#E4F0F6" theme={theme} />
                </View>
                <Pressable style={{ flex: 1 }} onPress={() => goTo('AdminStatsTab')}>
                  <SummaryChip icon={<GraduationCap size={14} color="#1D3557" strokeWidth={2} />} value={state.totalClasses} label={t('tabs.classes')} bg="#E8EEF4" theme={theme} />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => goTo('AdminDevoirs')}>
                  <SummaryChip icon={<BookOpen size={14} color="#d96614af" strokeWidth={2} />} value={state.devoirsToday} label={t('tabs.homework')} bg="#FFF3E0" theme={theme} />
                </Pressable>
              </View>
            </View>

            {/* ── Activité du jour ───────────────────────── */}
            <View style={styles.section}>
              <SectionHeader title={t('teacher.today')} />
              <Card padding={14}>
                <ActivityRow
                  icon={<CheckCircle2 size={16} color={theme.success} strokeWidth={2} />}
                  text={t('admin.profsDidAppel', { count: state.profsDoneAppel })}
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme}
                  isAr={isAr}
                />
                {state.profsMissingAppel > 0 ? (
                  <ActivityRow
                    icon={<CalendarX size={16} color={theme.danger} strokeWidth={2} />}
                    text={t('admin.profsMissingAppel', { count: state.profsMissingAppel })}
                    onPress={() => goTo('AdminAbsences')}
                    theme={theme}
                    isAr={isAr}
                  />
                ) : null}
                <ActivityRow
                  icon={<BookOpen size={16} color={theme.accent} strokeWidth={2} />}
                  text={t('admin.homeworkActive', { count: state.devoirsToday })}
                  onPress={() => goTo('AdminDevoirs')}
                  theme={theme}
                  isAr={isAr}
                />
                <ActivityRow
                  icon={<Send size={16} color={theme.primary} strokeWidth={2} />}
                  text={t('admin.messagesToday', { count: state.messagesToday })}
                  onPress={() => goTo('AdminMessages')}
                  theme={theme}
                  isAr={isAr}
                  last
                />
              </Card>
            </View>

            <View style={styles.footer}>
              <Text style={{ color: theme.textMuted, fontFamily: theme.fonts.medium, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Mojammaa Al Maarifa · {t('roles.admin')}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function StatBlock({ value, suffix, label, color, theme, isAr }: {
  value: string; suffix?: string; label: string; color: string; theme: Theme; isAr: boolean
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={{
        color,
        fontWeight: '800',
        fontSize: 24,
        letterSpacing: -0.5,
      }}>
        {value}{suffix ? <Text style={{ fontSize: 9, fontWeight: '600' }}>{suffix}</Text> : null}
      </Text>
      <Text style={{
        color: theme.textSoft,
        fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: isAr ? 0 : 0.3,
        marginTop: 2,
      }}>
        {label}
      </Text>
    </View>
  )
}

function SummaryChip({ icon, value, label, bg, theme }: {
  icon: React.ReactNode; value: number; label: string; bg: string; theme: Theme
}) {
  return (
    <View style={[styles.summaryChip, { backgroundColor: bg }]}>
      {icon}
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', marginTop: 1 }}>{label}</Text>
    </View>
  )
}

function ActivityRow({ icon, text, onPress, theme, isAr, last }: {
  icon: React.ReactNode; text: string; onPress?: () => void; theme: Theme; isAr: boolean; last?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={[styles.activityRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      {icon}
      <Text style={{
        flex: 1,
        color: theme.text,
        fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
        fontSize: 13,
        marginStart: 10,
        writingDirection: isAr ? 'rtl' : 'ltr',
      }}>
        {text}
      </Text>
      <Clock size={12} color={theme.textMuted} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },

  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },

  headerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountBlock: {
    flex: 1,
    paddingVertical: 2,
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  section: { paddingHorizontal: 20, marginTop: 18 },

  stateCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBlock: { alignItems: 'center', flex: 1 },
  statSep: { width: 1, height: 32 },

  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryChip: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },

  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
  },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  footer: { alignItems: 'center', justifyContent: 'center', marginTop: 28 },
})
