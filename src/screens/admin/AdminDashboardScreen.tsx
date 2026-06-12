import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare, Users, GraduationCap,
  CheckCircle2, CalendarX, BookOpen, Send, ChevronRight,
} from 'lucide-react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { getTodayJour, type JourScolaire } from '../../services/calendarService'
import AnimatedCounter from '../../components/AnimatedCounter'
import ProgressRing from '../../components/ProgressRing'
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

  const presenceColor = state
    ? state.presenceRate >= 95 ? theme.success : state.presenceRate >= 85 ? theme.warning : theme.danger
    : theme.success

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
        <Image source={require('../../../assets/logo.png')} resizeMode="contain" style={{ width: 240, height: 240, opacity: 0.08 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── En-tête ──────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable onPress={handleAccountPress} hitSlop={8} style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{
              color: theme.text,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black,
              fontSize: isAr ? 19 : 19,
              letterSpacing: isAr ? 0 : -0.4,
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t(greetingKey())}, {fullName.split(' ')[0] || 'Admin'}
            </Text>
            <Text style={{
              color: theme.accent,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold,
              fontSize: 10,
              letterSpacing: isAr ? 0 : 1.4,
              marginTop: 2,
              textTransform: 'uppercase',
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t('roles.admin')}
            </Text>
          </Pressable>
          <Pressable onPress={() => goTo('AdminMessages')} hitSlop={8}
            style={[styles.mailBtn, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
            <MessageSquare size={18} color={theme.text} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Bannière jour spécial */}
        {todayJour && todayJour.annuleCours ? (
          <View style={[styles.specialBanner, { backgroundColor: todayJour.type === 'vacances' ? theme.info : theme.danger }]}>
            <CalendarX size={18} color={theme.white} strokeWidth={2} />
            <View style={{ flex: 1, marginStart: 10 }}>
              <Text style={{ color: theme.white, fontFamily: theme.fonts.bold, fontSize: 14 }}>{t('calendar.specialDay')}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{todayJour.label} — {t('calendar.coursesCancelled')}</Text>
            </View>
          </View>
        ) : null}

        {loading && !state ? (
          <View style={styles.loadingBox}><ActivityIndicator color={theme.primary} /></View>
        ) : state ? (
          <>
            {/* ── Bento : présence + absents/retards ────── */}
            <View style={styles.bentoRow}>
              <View style={[styles.tile, styles.presenceTile, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.clay]}>
                <ProgressRing
                  progress={state.presenceRate / 100}
                  size={92} strokeWidth={9}
                  color={presenceColor} trackColor={theme.surfaceAlt} textColor={presenceColor}
                />
                <Text style={[styles.tileLabel, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold, marginTop: 10 }]}>
                  {t('admin.attendanceToday')}
                </Text>
              </View>
              <View style={styles.bentoCol}>
                <BentoMini
                  value={state.absentsToday}
                  label={t('tabs.absences')}
                  color={state.absentsToday > 0 ? theme.danger : theme.success}
                  bg={state.absentsToday > 0 ? theme.dangerSurface : theme.card}
                  border={state.absentsToday > 0 ? theme.danger : theme.border}
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme} isAr={isAr}
                />
                <BentoMini
                  value={state.retardsToday}
                  label={t('parent.lateArrivals')}
                  color={state.retardsToday > 0 ? theme.warning : theme.success}
                  bg={state.retardsToday > 0 ? theme.warningSurface : theme.card}
                  border={state.retardsToday > 0 ? theme.warning : theme.border}
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme} isAr={isAr}
                />
              </View>
            </View>

            {/* ── Bento : effectifs ──────────────────────── */}
            <View style={styles.bentoRow3}>
              <BentoSmall icon={<Users size={15} color={theme.primary} strokeWidth={2} />} value={state.totalProfs} label={t('admin.profs')} iconBg={theme.primarySurface} theme={theme} isAr={isAr} />
              <BentoSmall icon={<GraduationCap size={15} color={theme.info} strokeWidth={2} />} value={state.totalClasses} label={t('tabs.classes')} iconBg={theme.infoSurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<BookOpen size={15} color={theme.accent} strokeWidth={2} />} value={state.devoirsToday} label={t('tabs.homework')} iconBg={theme.accentSurface} onPress={() => goTo('AdminDevoirs')} theme={theme} isAr={isAr} />
            </View>

            {/* ── Bento : activité du jour ───────────────── */}
            <View style={styles.bentoWideGroup}>
              {state.profsMissingAppel > 0 ? (
                <BentoWide
                  icon={<CalendarX size={16} color={theme.danger} strokeWidth={2} />}
                  iconBg={theme.white}
                  text={t('admin.profsMissingAppel', { count: state.profsMissingAppel })}
                  bg={theme.dangerSurface} border={theme.danger} bold
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme} isAr={isAr}
                />
              ) : null}
              <BentoWide
                icon={<CheckCircle2 size={16} color={theme.success} strokeWidth={2} />}
                iconBg={theme.successSurface}
                text={t('admin.profsDidAppel', { count: state.profsDoneAppel })}
                bg={theme.card} border={theme.border}
                onPress={() => goTo('AdminAbsences')}
                theme={theme} isAr={isAr}
              />
              <BentoWide
                icon={<Send size={16} color={theme.primary} strokeWidth={2} />}
                iconBg={theme.primarySurface}
                text={t('admin.messagesToday', { count: state.messagesToday })}
                bg={theme.card} border={theme.border}
                onPress={() => goTo('AdminMessages')}
                theme={theme} isAr={isAr}
              />
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

function BentoMini({ value, label, color, bg, border, onPress, theme, isAr }: {
  value: number; label: string; color: string; bg: string; border: string
  onPress?: () => void; theme: Theme; isAr: boolean
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tile, styles.miniTile, { backgroundColor: bg, borderColor: border }, theme.shadows.sm]}>
      <ChevronRight size={14} color={theme.textMuted} strokeWidth={2} style={styles.miniChevron} />
      <Text style={{ color, fontFamily: theme.fonts.black, fontSize: 24, letterSpacing: -0.8 }}>
        <AnimatedCounter value={value} />
      </Text>
      <Text style={[styles.tileLabel, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function BentoSmall({ icon, value, label, iconBg, onPress, theme, isAr }: {
  icon: React.ReactNode; value: number; label: string; iconBg: string
  onPress?: () => void; theme: Theme; isAr: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={[styles.tile, styles.smallTile, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.sm]}>
      <View style={[styles.smallIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.black, fontSize: 19, letterSpacing: -0.5, marginTop: 6 }}>
        <AnimatedCounter value={value} />
      </Text>
      <Text style={[styles.tileLabel, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function BentoWide({ icon, iconBg, text, bg, border, bold, onPress, theme, isAr }: {
  icon: React.ReactNode; iconBg: string; text: string; bg: string; border: string
  bold?: boolean; onPress?: () => void; theme: Theme; isAr: boolean
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tile, styles.wideTile, { backgroundColor: bg, borderColor: border }, theme.shadows.xs]}>
      <View style={[styles.smallIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={{
        flex: 1,
        color: theme.text,
        fontFamily: isAr
          ? (bold ? theme.fonts.arabicBold : theme.fonts.arabicSemi)
          : (bold ? theme.fonts.bold : theme.fonts.medium),
        fontSize: 13,
        marginStart: 11,
        writingDirection: isAr ? 'rtl' : 'ltr',
      }}>
        {text}
      </Text>
      <ChevronRight size={14} color={theme.textMuted} strokeWidth={2} />
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 14,
  },
  mailBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },

  tile: {
    borderWidth: 1,
    borderRadius: 24,
  },
  tileLabel: {
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 3,
  },

  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 18,
  },
  presenceTile: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  bentoCol: { flex: 1, gap: 12 },
  miniTile: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  miniChevron: { position: 'absolute', top: 14, right: 12 },

  bentoRow3: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  smallTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 6,
  },
  smallIcon: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  bentoWideGroup: {
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
  },
  wideTile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
  },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  footer: { alignItems: 'center', justifyContent: 'center', marginTop: 28 },
})
