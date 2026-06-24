import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image,
  Pressable,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import type { AdminDashboardNav } from '../../navigation/types'
import { useTranslation } from 'react-i18next'
import {
  Users, GraduationCap, School, BookOpen, Send, Mail, CalendarClock, CalendarX, ChevronRight,
} from 'lucide-react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { toDoc } from '../../services/firestore'
import type { EleveDoc } from '../../services/elevesService'
import type { AbsenceDoc } from '../../services/absencesService'
import type { UserProfile } from '../../types'
import { getTodayJour, getJoursScolaires, type JourScolaire } from '../../services/calendarService'
import { useUnreadMessagesCount } from '../../hooks/useUnreadMessagesCount'
import AnimatedCounter from '../../components/AnimatedCounter'
import ProgressRing from '../../components/ProgressRing'
import { greetingKey, formatDayMonth } from '../../utils/format'

type AdminQuickRoute =
  | 'AdminAbsences' | 'AdminUsers' | 'AdminDevoirs'
  | 'AdminStatsTab' | 'AdminMessages' | 'AdminCalendarTab'

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
  devoirsToday: number
  messagesToday: number
}

export default function AdminDashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile } = useAuth()
  const nav = useNavigation<AdminDashboardNav>()
  const goTo = (route: AdminQuickRoute) => nav.navigate(route)
  const unread = useUnreadMessagesCount()

  const [state, setState] = useState<SchoolState | null>(null)
  const [todayJour, setTodayJour] = useState<JourScolaire | null>(null)
  const [nextEvent, setNextEvent] = useState<JourScolaire | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showGreeting, setShowGreeting] = useState(true)

  // Le toast de salutation s'affiche une seule fois au montage puis s'efface.
  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(false), 2600)
    return () => clearTimeout(id)
  }, [])

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Direction'

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 60)
      const horizonISO = horizon.toISOString().split('T')[0]

      const [jour, jours, elevesSnap, usersSnap, absAbsentSnap, absRetardSnap, devoirsSnap, msgsSnap] = await Promise.all([
        getTodayJour(),
        getJoursScolaires(today, horizonISO),
        getDocs(collection(db, 'eleves')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'absent'))),
        getDocs(query(collection(db, 'absences'), where('date', '==', today), where('statut', '==', 'retard'))),
        getDocs(collection(db, 'devoirs')),
        getDocs(collection(db, 'messages')),
      ])
      setTodayJour(jour)

      // Prochain événement marquant : hors aujourd'hui, hors jours « normal ».
      const upcoming = jours
        .filter(j => j.date > today && j.type !== 'normal')
        .sort((a, b) => a.date.localeCompare(b.date))
      setNextEvent(upcoming[0] ?? null)

      const totalEleves = elevesSnap.size
      const profs = usersSnap.docs.filter(d => toDoc<UserProfile>(d).role === 'professeur')
      const totalProfs = profs.length

      const uniqueAbsentEleves = new Set<string>()
      absAbsentSnap.forEach(d => uniqueAbsentEleves.add(toDoc<AbsenceDoc>(d).eleveId))

      const uniqueRetardEleves = new Set<string>()
      absRetardSnap.forEach(d => uniqueRetardEleves.add(toDoc<AbsenceDoc>(d).eleveId))

      const classeSet = new Set<string>()
      elevesSnap.forEach(d => {
        const c = toDoc<EleveDoc>(d).classe
        if (c) classeSet.add(c)
      })

      const devoirsToday = devoirsSnap.docs.filter(d => {
        const dl = toDoc<{ dateLimite?: string }>(d).dateLimite
        return typeof dl === 'string' && dl >= today
      }).length

      const todayMessages = msgsSnap.docs.filter(d => {
        const ca = toDoc<{ createdAt?: { toDate?: () => Date } }>(d).createdAt
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
        <Image source={require('../../../assets/logo.png')} resizeMode="contain" accessible={false} importantForAccessibility="no" style={{ width: 240, height: 240, opacity: 0.08 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
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

            {/* ── L'école en chiffres (cœur administratif) ── */}
            <View style={styles.bentoRow3}>
              <BentoSmall icon={<GraduationCap size={15} color={theme.primary} strokeWidth={2} />} value={state.totalEleves} label={t('admin.eleves')} iconBg={theme.primarySurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Users size={15} color={theme.info} strokeWidth={2} />} value={state.totalProfs} label={t('admin.profs')} iconBg={theme.infoSurface} onPress={() => goTo('AdminUsers')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<School size={15} color={theme.accent} strokeWidth={2} />} value={state.totalClasses} label={t('tabs.classes')} iconBg={theme.accentSurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
            </View>

            {/* ── Activité & communication ───────────────── */}
            <View style={styles.bentoRow3}>
              <BentoSmall icon={<BookOpen size={15} color={theme.accent} strokeWidth={2} />} value={state.devoirsToday} label={t('tabs.homework')} iconBg={theme.accentSurface} onPress={() => goTo('AdminDevoirs')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Send size={15} color={theme.primary} strokeWidth={2} />} value={state.messagesToday} label={t('admin.messagesSent')} iconBg={theme.primarySurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Mail size={15} color={unread > 0 ? theme.warning : theme.info} strokeWidth={2} />} value={unread} label={t('admin.unreadShort')} iconBg={unread > 0 ? theme.warningSurface : theme.infoSurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
            </View>

            {/* ── Cette semaine : prochain événement ─────── */}
            <View style={styles.bentoWideGroup}>
              <BentoWide
                icon={<CalendarClock size={16} color={theme.primary} strokeWidth={2} />}
                iconBg={theme.primarySurface}
                text={nextEvent ? `${nextEvent.label} · ${formatDayMonth(nextEvent.date, i18n.language)}` : t('admin.noUpcomingEvent')}
                bg={theme.card} border={theme.border}
                onPress={() => goTo('AdminCalendarTab')}
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

      {/* ── Floating greeting toast (overlay, hors du flux) ── */}
      <AnimatePresence>
        {showGreeting && (
          <MotiView
            key="greeting"
            from={{ opacity: 0, translateY: -16 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -16 }}
            transition={{ type: 'timing', duration: 320 }}
            pointerEvents="box-none"
            style={[styles.greetingWrap, { top: insets.top + 8 }]}
          >
            <Pressable
              onPress={() => setShowGreeting(false)}
              style={[styles.greetingToast, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.md]}
            >
              <Text numberOfLines={1} style={{
                color: theme.text,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                fontSize: isAr ? 16 : 15,
                writingDirection: isAr ? 'rtl' : 'ltr',
                textAlign: 'center',
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
                textAlign: 'center',
                writingDirection: isAr ? 'rtl' : 'ltr',
              }}>
                {t('roles.admin')}
              </Text>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </SafeAreaView>
  )
}

function BentoMini({ value, label, color, bg, border, onPress, theme, isAr }: {
  value: number; label: string; color: string; bg: string; border: string
  onPress?: () => void; theme: Theme; isAr: boolean
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, styles.miniTile, { backgroundColor: bg, borderColor: border }, theme.shadows.sm, pressed && styles.pressed]}>
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
      style={({ pressed }) => [styles.tile, styles.smallTile, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.sm, pressed && styles.pressed]}>
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, styles.wideTile, { backgroundColor: bg, borderColor: border }, theme.shadows.xs, pressed && styles.pressed]}>
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

  greetingWrap: {
    position: 'absolute',
    left: 20, right: 20,
    alignItems: 'center',
  },
  greetingToast: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 200,
  },

  tile: {
    borderWidth: 1,
    borderRadius: 24,
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
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
