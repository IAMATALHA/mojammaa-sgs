/**
 * AdminDashboardScreen — poste de pilotage (refonte audit 3 juil. 2026).
 *
 * Structure : 1) en-tête stable (nom, date, signal principal) → 2) état du
 * jour (présence CONFIRMÉE parmi les pointés, appels faits/attendus, classes
 * sans appel) → 3) « À traiter » (couche action) → 4) activité (devoirs
 * ACTIFS, messages) → 5) structure école → tendance vs 7 jours.
 *
 * Perf : compteurs lourds lus depuis l'agrégat serveur `stats/summary` ; seules
 * les données du JOUR sont requêtées en direct et sont bornées par date. Le
 * résumé est recalculé uniquement lors d'un pull-to-refresh admin (ou une
 * seule fois s'il n'existe pas encore), jamais via un scan client complet.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import type { AdminDashboardNav } from '../../navigation/types'
import { useTranslation } from 'react-i18next'
import {
  Users, GraduationCap, School, BookOpen, Send, Mail, CalendarClock, CalendarX,
  ChevronRight, ClipboardCheck, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  CarFront,
} from 'lucide-react-native'
import { collection, doc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db, functions } from '../../config/firebase'
import { toDoc, toDocs } from '../../services/firestore'
import type { AbsenceDoc } from '../../services/absencesService'
import { getTodayJour, getJoursScolaires, type JourScolaire } from '../../services/calendarService'
import { useUnreadMessagesCount } from '../../hooks/useUnreadMessagesCount'
import AnimatedCounter from '../../components/AnimatedCounter'
import { formatDayMonth, hexWithAlpha } from '../../utils/format'
import {
  buildTodayRollCallSessions,
  rollCallSessionKey,
  summarizeRollCallSessions,
  type RollCallSlot,
} from '../../utils/rollCalls'

type AdminQuickRoute =
  | 'AdminAbsences' | 'AdminUsers' | 'AdminDevoirs'
  | 'AdminStatsTab' | 'AdminMessages' | 'AdminCalendarTab'
  | 'AdminRollCalls' | 'AdminPickup'

function compactLabels(lang: string) {
  if (lang === 'ar') {
    return { calls: 'النداء' }
  }
  if (lang.startsWith('en')) {
    return { calls: 'Calls' }
  }
  return { calls: 'Appels' }
}

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
  const nav = useNavigation<AdminDashboardNav>()
  const goTo = (route: AdminQuickRoute) => nav.navigate(route)
  const unread = useUnreadMessagesCount()

  const [state, setState] = useState<SchoolState | null>(null)
  const [todayJour, setTodayJour] = useState<JourScolaire | null>(null)
  const [nextEvent, setNextEvent] = useState<JourScolaire | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const labels = compactLabels(i18n.language)

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const weekAgo = isoDaysAgo(7)
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 60)
      const horizonISO = horizon.toISOString().split('T')[0]
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

      const [jour, jours, summarySnap, absTodaySnap, absWeekSnap, msgsTodaySnap, edtSnap] = await Promise.all([
        getTodayJour(),
        getJoursScolaires(today, horizonISO),
        getDoc(doc(db, 'stats', 'summary')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
        getDocs(query(collection(db, 'absences'), where('date', '>=', weekAgo), where('date', '<', today))),
        getDocs(query(collection(db, 'messages'), where('createdAt', '>=', Timestamp.fromDate(startOfDay)))),
        getDocs(collection(db, 'emploiDuTemps')),
      ])
      setTodayJour(jour)

      const upcoming = jours
        .filter(j => j.date > today && j.type !== 'normal')
        .sort((a, b) => a.date.localeCompare(b.date))
      setNextEvent(upcoming[0] ?? null)

      // ── Structure école : agrégat serveur uniquement ──
      let totalEleves = 0, totalProfs = 0, totalClasses = 0, devoirsActifs = 0
      let effectiveSummarySnap = summarySnap
      if (!effectiveSummarySnap.exists()) {
        // Cas exceptionnel d'amorçage : on crée le résumé côté serveur au lieu
        // de télécharger les collections brutes sur le téléphone de l'admin.
        await httpsCallable(functions, 'recomputeSchoolStats')()
        effectiveSummarySnap = await getDoc(doc(db, 'stats', 'summary'))
      }
      if (!effectiveSummarySnap.exists()) {
        throw new Error('Le résumé des statistiques est indisponible.')
      }
      const s = effectiveSummarySnap.data() as Record<string, any>
      totalEleves = s.totalEleves || 0
      totalProfs = s.totalTeachers || 0
      totalClasses = s.totalClasses || 0
      devoirsActifs = s.activeHomework || 0

      // ── État du jour : pointages d'aujourd'hui ──
      const absents = new Set<string>()
      const retards = new Set<string>()
      const pointed = new Set<string>()
      const completedRollCalls = new Set<string>()
      absTodaySnap.forEach(d => {
        const a = toDoc<AbsenceDoc>(d)
        if (a.eleveId) pointed.add(a.eleveId)
        if (a.classe && a.seance) completedRollCalls.add(rollCallSessionKey(a.classe, a.seance))
        if (a.statut === 'absent' && a.eleveId) absents.add(a.eleveId)
        if (a.statut === 'retard' && a.eleveId) retards.add(a.eleveId)
      })
      // Présence CONFIRMÉE : parmi les élèves effectivement pointés — sans
      // appel, on ne prétend pas « 100 % de présence ».
      const presenceConfirmed = pointed.size > 0
        ? Math.round(((pointed.size - absents.size) / pointed.size) * 100)
        : null
      const coursToday = !(jour?.annuleCours)
      const todayRollCalls = buildTodayRollCallSessions(
        toDocs<RollCallSlot>(edtSnap),
        completedRollCalls,
      )
      const rollCallSummary = summarizeRollCallSessions(todayRollCalls)
      const classesSansAppel = coursToday
        ? rollCallSummary.missingClasses
        : []
      const callsDone = coursToday ? rollCallSummary.callsDone : 0
      const callsExpected = coursToday ? rollCallSummary.callsExpected : 0

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
        callsDone,
        callsExpected,
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
  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await httpsCallable(functions, 'recomputeSchoolStats')()
    } catch (e: any) {
      console.warn('[admin dashboard refresh]', e?.message)
    }
    await load()
  }

  // ── Couche action : ce qui demande une intervention MAINTENANT ──
  const priorities: { key: string; icon: React.ReactNode; label: string; detail?: string; route: AdminQuickRoute; color: string; bg: string }[] = []
  if (state) {
    if (state.classesSansAppel.length > 0) {
      priorities.push({
        key: 'calls', icon: <ClipboardCheck size={16} color={theme.warning} strokeWidth={2} />,
        label: `${state.classesSansAppel.length} ${t('admin.classesNoCall').toLowerCase()}`,
        detail: state.classesSansAppel.slice(0, 5).join(' · ') + (state.classesSansAppel.length > 5 ? ' …' : ''),
        route: 'AdminRollCalls', color: theme.warning, bg: theme.warningSurface,
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
        <LinearGradient
          colors={[theme.primaryDark, theme.primary, '#2F8A72']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, theme.shadows.clay]}
        >
          <View pointerEvents="none" style={styles.heroGlowA} />
          <View pointerEvents="none" style={styles.heroGlowB} />
          <View pointerEvents="none" style={styles.heroSheen} />

          {state ? (
            <>
              <View style={[styles.heroSignal, isAr && styles.rowReverse]}>
                <View style={[styles.heroSignalText, isAr && styles.rtlBlock]}>
                  <Text style={[styles.heroMetricLabel, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                    {t('admin.confirmedPresence')}
                  </Text>
                  {state.presenceConfirmed !== null ? (
                    <>
                      <Text style={[styles.heroPresenceValue, { fontFamily: theme.fonts.black }]}>
                        <AnimatedCounter value={state.presenceConfirmed} />
                        <Text style={styles.heroPresenceUnit}>%</Text>
                      </Text>
                      {state.trendDelta !== null ? (
                        <View style={[styles.heroTrendPill, isAr && styles.rowReverse]}>
                          {state.trendDelta >= 0
                            ? <TrendingUp size={13} color="#fff" strokeWidth={2.3} />
                            : <TrendingDown size={13} color="#fff" strokeWidth={2.3} />}
                          <Text style={[styles.heroTrendText, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>
                            {state.trendDelta > 0 ? '+' : ''}{state.trendDelta} pt · {t('admin.vs7d')}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.heroNoCall, { fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
                      {t('admin.noCallYet')}
                    </Text>
                  )}
                </View>

              </View>

              <View style={[styles.heroMetricsRow, isAr && styles.rowReverse]}>
                <HeroMetric
                  icon={<ClipboardCheck size={14} color="#fff" strokeWidth={2.3} />}
                  value={`${state.callsDone}/${state.callsExpected}`}
                  label={labels.calls}
                  onPress={() => goTo('AdminRollCalls')}
                  isAr={isAr}
                  theme={theme}
                />
                <HeroMetric
                  icon={<CalendarX size={14} color="#fff" strokeWidth={2.3} />}
                  value={String(state.absentsToday)}
                  label={t('tabs.absences')}
                  onPress={() => goTo('AdminAbsences')}
                  isAr={isAr}
                  theme={theme}
                />
                <HeroMetric
                  icon={<Mail size={14} color="#fff" strokeWidth={2.3} />}
                  value={String(unread)}
                  label={t('admin.unreadShort')}
                  onPress={() => goTo('AdminMessages')}
                  isAr={isAr}
                  theme={theme}
                />
              </View>
            </>
          ) : (
            <View style={styles.heroLoading}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </LinearGradient>

        <View style={styles.bentoWideGroup}>
          <BentoWide
            icon={<CarFront size={17} color={theme.primary} strokeWidth={2.1} />}
            iconBg={theme.primarySurface}
            text={`${t('pickup.adminCta')} · ${t('pickup.adminHint')}`}
            bg={theme.card}
            border={theme.primaryBorder}
            bold
            onPress={() => goTo('AdminPickup')}
            theme={theme}
            isAr={isAr}
          />
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

        {loading && !state ? null : state ? (
          <>
            {/* ── 2. À traiter (couche action) ── */}
            <View style={styles.sectionBlock}>
              <SectionTitle
                title={t('admin.toHandle')}
                detail={priorities.length === 0 ? t('admin.allGood') : `${priorities.length}`}
                theme={theme}
                isAr={isAr}
              />
              {priorities.length === 0 ? (
                <View style={[styles.priorityOkCard, { backgroundColor: theme.successSurface, borderColor: hexWithAlpha(theme.success, 0.22) }]}>
                  <View style={[styles.priorityIconBox, { backgroundColor: hexWithAlpha(theme.success, 0.14) }]}>
                    <CheckCircle2 size={17} color={theme.success} strokeWidth={2.3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.success, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 13.5, writingDirection: isAr ? 'rtl' : 'ltr' }}>
                      {t('admin.allGood')}
                    </Text>
                    <Text style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium, fontSize: 11.5, marginTop: 2 }}>
                      {t('admin.confirmedPresence')} · {state.presenceConfirmed ?? 0}%
                    </Text>
                  </View>
                </View>
              ) : priorities.map(p => (
                <Pressable key={p.key} onPress={() => goTo(p.route)}
                  style={({ pressed }) => [styles.priorityCard, { backgroundColor: p.bg, borderColor: hexWithAlpha(p.color, 0.24) }, theme.shadows.xs, pressed && styles.pressed]}>
                  <View style={[styles.priorityRail, { backgroundColor: p.color }]} />
                  <View style={[styles.priorityIconBox, { backgroundColor: hexWithAlpha(p.color, 0.14) }]}>
                    {p.icon}
                  </View>
                  <View style={{ flex: 1, marginStart: 11, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: p.color, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 13.5, lineHeight: 17, writingDirection: isAr ? 'rtl' : 'ltr' }}>
                      {p.label}
                    </Text>
                    {p.detail ? (
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium, fontSize: 11.5, marginTop: 1 }}>
                        {p.detail}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.priorityChevron, { backgroundColor: hexWithAlpha(p.color, 0.12) }]}>
                    <ChevronRight size={15} color={p.color} strokeWidth={2.3} />
                  </View>
                </Pressable>
              ))}
            </View>

            {/* ── 3. Activité ── */}
            <View style={styles.sectionBlock}>
              <View style={styles.bentoRow3}>
                <BentoSmall icon={<BookOpen size={15} color={theme.accent} strokeWidth={2} />} value={state.devoirsActifs} label={t('admin.activeHomework')} iconBg={theme.accentSurface} onPress={() => goTo('AdminDevoirs')} theme={theme} isAr={isAr} />
                <BentoSmall icon={<Send size={15} color={theme.primary} strokeWidth={2} />} value={state.messagesToday} label={t('admin.messagesSent')} iconBg={theme.primarySurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
                <BentoSmall icon={<Mail size={15} color={unread > 0 ? theme.warning : theme.info} strokeWidth={2} />} value={unread} label={t('admin.unreadShort')} iconBg={unread > 0 ? theme.warningSurface : theme.infoSurface} onPress={() => goTo('AdminMessages')} theme={theme} isAr={isAr} />
              </View>
            </View>

            {/* ── 4. Structure école ── */}
            <View style={styles.sectionBlock}>
              <View style={styles.bentoRow3}>
                <BentoSmall icon={<GraduationCap size={15} color={theme.primary} strokeWidth={2} />} value={state.totalEleves} label={t('admin.eleves')} iconBg={theme.primarySurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
                <BentoSmall icon={<Users size={15} color={theme.info} strokeWidth={2} />} value={state.totalProfs} label={t('admin.profs')} iconBg={theme.infoSurface} onPress={() => goTo('AdminUsers')} theme={theme} isAr={isAr} />
                <BentoSmall icon={<School size={15} color={theme.accent} strokeWidth={2} />} value={state.totalClasses} label={t('tabs.classes')} iconBg={theme.accentSurface} onPress={() => goTo('AdminStatsTab')} theme={theme} isAr={isAr} />
              </View>
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

function HeroMetric({ icon, value, label, onPress, theme, isAr }: {
  icon: React.ReactNode
  value: string
  label: string
  onPress: () => void
  theme: Theme
  isAr: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.heroMetric, pressed && styles.heroMetricPressed]}
    >
      <View style={styles.heroMetricIcon}>{icon}</View>
      <Text numberOfLines={1} style={[styles.heroMetricValue, { fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.heroMetricText, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function SectionTitle({ title, detail, theme, isAr }: {
  title: string
  detail?: string
  theme: Theme
  isAr: boolean
}) {
  return (
    <View style={[styles.sectionTitleRow, isAr && styles.rowReverse]}>
      <Text numberOfLines={1} style={[styles.sectionTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
        {title}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={[styles.sectionDetail, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
          {detail}
        </Text>
      ) : null}
    </View>
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

  heroCard: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 30,
    padding: 18,
    overflow: 'hidden',
  },
  heroGlowA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -76,
    right: -44,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
  heroGlowB: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    bottom: -52,
    left: -34,
    backgroundColor: 'rgba(255, 210, 63, 0.18)',
  },
  heroSheen: {
    position: 'absolute',
    width: 78,
    height: 260,
    top: -46,
    right: 88,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '24deg' }],
  },
  heroSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
  },
  heroSignalText: {
    flex: 1,
    minWidth: 0,
  },
  heroMetricLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
  },
  heroPresenceValue: {
    color: '#fff',
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  heroPresenceUnit: {
    fontSize: 21,
    fontWeight: '800',
  },
  heroNoCall: {
    color: '#fff',
    fontSize: 21,
    lineHeight: 28,
    marginTop: 8,
  },
  heroTrendPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroTrendText: {
    color: '#fff',
    fontSize: 11,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  heroMetric: {
    flex: 1,
    minHeight: 74,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroMetricPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  heroMetricIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  heroMetricValue: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 22,
    marginTop: 7,
    fontVariant: ['tabular-nums'],
  },
  heroMetricText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10.5,
    marginTop: 1,
  },
  heroLoading: {
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  rtlBlock: {
    alignItems: 'flex-end',
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

  bentoRow3: {
    flexDirection: 'row',
    gap: 12,
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
  sectionBlock: {
    marginHorizontal: 20,
    marginTop: 16,
    gap: 10,
  },
  sectionTitleRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
  },
  sectionDetail: {
    fontSize: 12,
  },
  priorityOkCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 11,
  },
  priorityCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  priorityRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  priorityIconBox: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },

  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
  },
  footer: { alignItems: 'center', justifyContent: 'center', marginTop: 28 },
})
