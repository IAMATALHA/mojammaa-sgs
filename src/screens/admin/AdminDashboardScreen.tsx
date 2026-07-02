/**
 * AdminDashboardScreen — poste de pilotage (refonte audit 3 juil. 2026).
 *
 * Structure : 1) en-tête stable (nom, date, signal principal) → 2) état du
 * jour (présence CONFIRMÉE parmi les pointés, appels faits/attendus, classes
 * sans appel) → 3) « À traiter » (couche action) → 4) activité (devoirs
 * ACTIFS, messages) → 5) structure école → tendance vs 7 jours.
 *
 * Perf : compteurs lourds lus depuis l'agrégat serveur `stats/summary`
 * (recalculé /30 min par la CF) ; seules les données du JOUR sont requêtées
 * en direct, bornées par date. Repli scan complet si l'agrégat n'existe pas.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import type { AdminDashboardNav } from '../../navigation/types'
import { useTranslation } from 'react-i18next'
import {
  Users, GraduationCap, School, BookOpen, Send, Mail, CalendarClock, CalendarX,
  ChevronRight, ClipboardCheck, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
} from 'lucide-react-native'
import { collection, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore'
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

function isoDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
const todayISO = () => isoDaysAgo(0)

interface SchoolState {
  totalEleves: number
  totalProfs: number
  totalClasses: number
  absentsToday: number
  retardsToday: number
  presenceConfirmed: number | null   // % présents parmi les élèves POINTÉS (null = aucun appel)
  callsDone: number
  callsExpected: number
  classesSansAppel: string[]
  trendDelta: number | null          // présence confirmée vs moyenne 7 jours (points)
  devoirsActifs: number
  messagesToday: number
}

export default function AdminDashboardScreen() {
  const theme = useTheme()
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

  const fullName = profile ? `${profile.prenom} ${profile.nom}`.trim() : 'Direction'

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const weekAgo = isoDaysAgo(7)
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 60)
      const horizonISO = horizon.toISOString().split('T')[0]
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

      const [jour, jours, summarySnap, absTodaySnap, absWeekSnap, msgsTodaySnap] = await Promise.all([
        getTodayJour(),
        getJoursScolaires(today, horizonISO),
        getDoc(doc(db, 'stats', 'summary')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
        getDocs(query(collection(db, 'absences'), where('date', '>=', weekAgo), where('date', '<', today))),
        getDocs(query(collection(db, 'messages'), where('createdAt', '>=', Timestamp.fromDate(startOfDay)))),
      ])
      setTodayJour(jour)

      const upcoming = jours
        .filter(j => j.date > today && j.type !== 'normal')
        .sort((a, b) => a.date.localeCompare(b.date))
      setNextEvent(upcoming[0] ?? null)

      // ── Structure école : agrégat serveur, repli scan complet ──
      let totalEleves = 0, totalProfs = 0, totalClasses = 0, devoirsActifs = 0
      let expectedClasses: string[] = []
      if (summarySnap.exists()) {
        const s = summarySnap.data() as Record<string, any>
        totalEleves = s.totalEleves || 0
        totalProfs = s.totalTeachers || 0
        totalClasses = s.totalClasses || 0
        devoirsActifs = s.activeHomework || 0
        expectedClasses = Array.isArray(s.classStats)
          ? s.classStats.map((c: any) => c?.name).filter(Boolean)
          : []
      } else {
        const [elevesSnap, usersSnap, devoirsSnap] = await Promise.all([
          getDocs(collection(db, 'eleves')),
          getDocs(collection(db, 'users')),
          getDocs(query(collection(db, 'devoirs'), where('dateLimite', '>=', today))),
        ])
        totalEleves = elevesSnap.size
        totalProfs = usersSnap.docs.filter(d => toDoc<UserProfile>(d).role === 'professeur').length
        const classeSet = new Set<string>()
        elevesSnap.forEach(d => { const c = toDoc<EleveDoc>(d).classe; if (c) classeSet.add(c) })
        totalClasses = classeSet.size
        expectedClasses = [...classeSet]
        devoirsActifs = devoirsSnap.size
      }

      // ── État du jour : pointages d'aujourd'hui ──
      const absents = new Set<string>()
      const retards = new Set<string>()
      const pointed = new Set<string>()
      const classesPointees = new Set<string>()
      absTodaySnap.forEach(d => {
        const a = toDoc<AbsenceDoc>(d)
        if (a.eleveId) pointed.add(a.eleveId)
        if (a.classe) classesPointees.add(a.classe)
        if (a.statut === 'absent' && a.eleveId) absents.add(a.eleveId)
        if (a.statut === 'retard' && a.eleveId) retards.add(a.eleveId)
      })
      // Présence CONFIRMÉE : parmi les élèves effectivement pointés — sans
      // appel, on ne prétend pas « 100 % de présence ».
      const presenceConfirmed = pointed.size > 0
        ? Math.round(((pointed.size - absents.size) / pointed.size) * 100)
        : null
      const coursToday = !(jour?.annuleCours)
      const classesSansAppel = coursToday
        ? expectedClasses.filter(c => !classesPointees.has(c))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        : []

      // ── Tendance : présence confirmée moyenne des 7 derniers jours ──
      const byDay = new Map<string, { pointed: Set<string>; absent: Set<string> }>()
      absWeekSnap.forEach(d => {
        const a = toDoc<AbsenceDoc>(d)
        if (!a.date || !a.eleveId) return
        if (!byDay.has(a.date)) byDay.set(a.date, { pointed: new Set(), absent: new Set() })
        const day = byDay.get(a.date)!
        day.pointed.add(a.eleveId)
        if (a.statut === 'absent') day.absent.add(a.eleveId)
      })
      const dayRates = [...byDay.values()]
        .filter(d => d.pointed.size > 0)
        .map(d => ((d.pointed.size - d.absent.size) / d.pointed.size) * 100)
      const trendDelta = presenceConfirmed !== null && dayRates.length > 0
        ? Math.round(presenceConfirmed - dayRates.reduce((a, b) => a + b, 0) / dayRates.length)
        : null

      setState({
        totalEleves, totalProfs, totalClasses,
        absentsToday: absents.size,
        retardsToday: retards.size,
        presenceConfirmed,
        callsDone: classesPointees.size,
        callsExpected: expectedClasses.length,
        classesSansAppel,
        trendDelta,
        devoirsActifs,
        messagesToday: msgsTodaySnap.size,
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

  // ── Couche action : ce qui demande une intervention MAINTENANT ──
  const priorities: { key: string; icon: React.ReactNode; label: string; detail?: string; route: AdminQuickRoute; color: string; bg: string }[] = []
  if (state) {
    if (state.classesSansAppel.length > 0) {
      priorities.push({
        key: 'calls', icon: <ClipboardCheck size={16} color={theme.warning} strokeWidth={2} />,
        label: `${state.classesSansAppel.length} ${t('admin.classesNoCall').toLowerCase()}`,
        detail: state.classesSansAppel.slice(0, 5).join(' · ') + (state.classesSansAppel.length > 5 ? ' …' : ''),
        route: 'AdminAbsences', color: theme.warning, bg: theme.warningSurface,
      })
    }
    if (state.absentsToday > 0) {
      priorities.push({
        key: 'abs', icon: <CalendarX size={16} color={theme.danger} strokeWidth={2} />,
        label: `${state.absentsToday} ${t('tabs.absences').toLowerCase()}`,
        route: 'AdminAbsences', color: theme.danger, bg: theme.dangerSurface,
      })
    }
    if (unread > 0) {
      priorities.push({
        key: 'unread', icon: <Mail size={16} color={theme.info} strokeWidth={2} />,
        label: `${unread} ${t('admin.unreadShort').toLowerCase()}`,
        route: 'AdminMessages', color: theme.info, bg: theme.infoSurface,
      })
    }
  }

  const presenceColor = state?.presenceConfirmed == null
    ? theme.textMuted
    : state.presenceConfirmed >= 95 ? theme.success : state.presenceConfirmed >= 85 ? theme.warning : theme.danger

  const dateLabel = new Date().toLocaleDateString(isAr ? 'ar-MA-u-nu-latn' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

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
        {/* ── En-tête stable : qui, quand, signal principal ── */}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black, fontSize: 20, letterSpacing: -0.4, writingDirection: isAr ? 'rtl' : 'ltr' }}>
              {t(greetingKey())}, {fullName.split(' ')[0] || 'Admin'}
            </Text>
            <Text style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium, fontSize: 12.5, marginTop: 2, textTransform: 'capitalize' }}>
              {dateLabel} · {t('roles.admin')}
            </Text>
          </View>
          {state && (
            <View style={[styles.statusPill, { backgroundColor: priorities.length === 0 ? theme.successSurface : theme.warningSurface }]}>
              {priorities.length === 0
                ? <CheckCircle2 size={14} color={theme.success} strokeWidth={2.2} />
                : <AlertTriangle size={14} color={theme.warning} strokeWidth={2.2} />}
              <Text style={{ color: priorities.length === 0 ? theme.success : theme.warning, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 12, marginStart: 5 }}>
                {priorities.length === 0 ? t('admin.allGood') : `${priorities.length} ${t('admin.toHandle').toLowerCase()}`}
              </Text>
            </View>
          )}
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
            {/* ── 1. État du jour : présence CONFIRMÉE + fiabilité de l'appel ── */}
            <View style={styles.bentoRow}>
              <View style={[styles.tile, styles.presenceTile, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.clay]}>
                {state.presenceConfirmed !== null ? (
                  <>
                    <ProgressRing
                      progress={state.presenceConfirmed / 100}
                      size={92} strokeWidth={9}
                      color={presenceColor} trackColor={theme.surfaceAlt} textColor={presenceColor}
                    />
                    {state.trendDelta !== null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        {state.trendDelta >= 0
                          ? <TrendingUp size={12} color={theme.success} strokeWidth={2.2} />
                          : <TrendingDown size={12} color={theme.danger} strokeWidth={2.2} />}
                        <Text style={{ color: state.trendDelta >= 0 ? theme.success : theme.danger, fontFamily: theme.fonts.bold, fontSize: 11.5, marginStart: 4 }}>
                          {state.trendDelta > 0 ? '+' : ''}{state.trendDelta} pt · {t('admin.vs7d')}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={{ color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold, fontSize: 13, textAlign: 'center', paddingVertical: 26 }}>
                    {t('admin.noCallYet')}
                  </Text>
                )}
                <Text style={[styles.tileLabel, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold, marginTop: 8 }]}>
                  {t('admin.confirmedPresence')}
                </Text>
              </View>
              <View style={styles.bentoCol}>
                <BentoMini
                  value={state.callsDone} total={state.callsExpected}
                  label={t('admin.callsDone')}
                  color={state.callsDone >= state.callsExpected ? theme.success : theme.warning}
                  bg={theme.card}
                  border={state.callsDone >= state.callsExpected ? theme.border : theme.warning}
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme} isAr={isAr}
                />
                <BentoMini
                  value={state.absentsToday}
                  label={t('tabs.absences')}
                  color={state.absentsToday > 0 ? theme.danger : theme.success}
                  bg={state.absentsToday > 0 ? theme.dangerSurface : theme.card}
                  border={state.absentsToday > 0 ? theme.danger : theme.border}
                  onPress={() => goTo('AdminAbsences')}
                  theme={theme} isAr={isAr}
                />
              </View>
            </View>

            {/* ── 2. À traiter (couche action) ── */}
            <View style={styles.bentoWideGroup}>
              {priorities.length === 0 ? (
                <View style={[styles.tile, styles.wideTile, { backgroundColor: theme.successSurface, borderColor: theme.success }]}>
                  <CheckCircle2 size={17} color={theme.success} strokeWidth={2.2} />
                  <Text style={{ flex: 1, color: theme.success, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 13.5, marginStart: 10, writingDirection: isAr ? 'rtl' : 'ltr' }}>
                    {t('admin.allGood')}
                  </Text>
                </View>
              ) : priorities.map(p => (
                <Pressable key={p.key} onPress={() => goTo(p.route)}
                  style={({ pressed }) => [styles.tile, styles.wideTile, { backgroundColor: p.bg, borderColor: p.color }, pressed && styles.pressed]}>
                  {p.icon}
                  <View style={{ flex: 1, marginStart: 10, minWidth: 0 }}>
                    <Text style={{ color: p.color, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 13.5, writingDirection: isAr ? 'rtl' : 'ltr' }}>
                      {p.label}
                    </Text>
                    {p.detail ? (
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium, fontSize: 11.5, marginTop: 1 }}>
                        {p.detail}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={15} color={p.color} strokeWidth={2} />
                </Pressable>
              ))}
            </View>

            {/* ── 3. Activité ── */}
            <View style={styles.bentoRow3}>
              <BentoSmall icon={<BookOpen size={15} color={theme.accent} strokeWidth={2} />} value={state.devoirsActifs} label={t('admin.activeHomework')} iconBg={theme.accentSurface} onPress={() => goTo('AdminDevoirs')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Send size={15} color={theme.primary} strokeWidth={2} />} value={state.messagesToday} label={t('admin.messagesSent')} iconBg={theme.primarySurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Mail size={15} color={unread > 0 ? theme.warning : theme.info} strokeWidth={2} />} value={unread} label={t('admin.unreadShort')} iconBg={unread > 0 ? theme.warningSurface : theme.infoSurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
            </View>

            {/* ── 4. Structure école ── */}
            <View style={styles.bentoRow3}>
              <BentoSmall icon={<GraduationCap size={15} color={theme.primary} strokeWidth={2} />} value={state.totalEleves} label={t('admin.eleves')} iconBg={theme.primarySurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<Users size={15} color={theme.info} strokeWidth={2} />} value={state.totalProfs} label={t('admin.profs')} iconBg={theme.infoSurface} onPress={() => goTo('AdminUsers')} theme={theme} isAr={isAr} />
              <BentoSmall icon={<School size={15} color={theme.accent} strokeWidth={2} />} value={state.totalClasses} label={t('tabs.classes')} iconBg={theme.accentSurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
            </View>

            {/* ── Prochain événement ── */}
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
              <Text style={{ color: theme.textMuted, fontFamily: theme.fonts.medium, fontSize: 11, letterSpacing: 0.4 }}>
                Mojammaa Al Maarifa · {t('roles.admin')}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function BentoMini({ value, total, label, color, bg, border, onPress, theme, isAr }: {
  value: number; total?: number; label: string; color: string; bg: string; border: string
  onPress?: () => void; theme: Theme; isAr: boolean
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, styles.miniTile, { backgroundColor: bg, borderColor: border }, theme.shadows.sm, pressed && styles.pressed]}>
      <ChevronRight size={14} color={theme.textMuted} strokeWidth={2} style={styles.miniChevron} />
      <Text style={{ color, fontFamily: theme.fonts.black, fontSize: 24, letterSpacing: -0.8 }}>
        <AnimatedCounter value={value} />
        {total !== undefined ? <Text style={{ fontSize: 15, color: theme.textMuted }}>/{total}</Text> : null}
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
      <Text numberOfLines={1} style={[styles.tileLabel, { color: theme.textMuted, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    flexShrink: 0,
  },

  tile: {
    borderWidth: 1,
    borderRadius: 24,
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  // Lisibilité mobile (audit) : plus grand, sans majuscules forcées.
  tileLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 3,
  },

  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
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
