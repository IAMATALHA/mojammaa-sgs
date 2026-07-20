/**
 * AdminDashboardScreen — poste de pilotage (refonte audit 3 juil. 2026).
 *
 * Structure : 1) verdict et priorité principale → 2) prochain événement utile
 * → 3) un seul panneau de gestion pour les routes sans onglet. Les messages
 * restent dans leur onglet dédié, avec son badge de non-lus.
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
import { useNavigation } from '@react-navigation/native'
import type { AdminDashboardNav } from '../../navigation/types'
import { useTranslation } from 'react-i18next'
import {
  Users, BookOpen, CalendarClock, CalendarX,
  ChevronRight, ClipboardCheck, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  CarFront,
  MoonStar,
} from 'lucide-react-native'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db, functions } from '../../config/firebase'
import { toDoc, toDocs } from '../../services/firestore'
import type { AbsenceDoc } from '../../services/absencesService'
import { getJourScolaire, getJoursScolaires, type JourScolaire } from '../../services/calendarService'
import AnimatedCounter from '../../components/AnimatedCounter'
import { formatDateChip, hexWithAlpha } from '../../utils/format'
import { subscribePrayerClassSessionsForDay } from '../../services/prayer-class-service'
import type { PrayerClassSession } from '../../types/prayer'
import {
  buildTodayRollCallSessions,
  rollCallSessionKey,
  summarizeRollCallSessions,
  type RollCallSlot,
} from '../../utils/rollCalls'

type AdminQuickRoute =
  | 'AdminAbsences' | 'AdminUsers' | 'AdminDevoirs'
  | 'AdminCalendarTab' | 'AdminRollCalls' | 'AdminPickup' | 'AdminEdt'
  | 'AdminPrayer'

type OperationItem = {
  key: string
  icon: React.ReactNode
  iconBg: string
  title: string
  route: AdminQuickRoute
  status?: string
  statusColor?: string
}

function localISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return localISO(d)
}
const todayISO = () => isoDaysAgo(0)

function daysUntilISO(date: string): number {
  const today = Date.parse(`${todayISO()}T00:00:00Z`)
  const target = Date.parse(`${date}T00:00:00Z`)
  return Math.max(1, Math.round((target - today) / 86_400_000))
}

interface SchoolState {
  absentsToday: number
  presenceConfirmed: number | null   // % présents parmi les élèves POINTÉS (null = aucun appel)
  classesSansAppel: string[]
  trendDelta: number | null          // présence confirmée vs moyenne 7 jours (points)
  devoirsActifs: number
}

export default function AdminDashboardScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const nav = useNavigation<AdminDashboardNav>()
  const goTo = (route: AdminQuickRoute) => nav.navigate(route)

  const [state, setState] = useState<SchoolState | null>(null)
  const [todayJour, setTodayJour] = useState<JourScolaire | null>(null)
  const [nextEvent, setNextEvent] = useState<JourScolaire | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [prayerSessions, setPrayerSessions] = useState<PrayerClassSession[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const today = todayISO()
      const weekAgo = isoDaysAgo(7)
      const horizon = new Date(); horizon.setDate(horizon.getDate() + 60)
      const horizonISO = localISO(horizon)

      const [jour, jours, summarySnap, absTodaySnap, absWeekSnap, edtSnap] = await Promise.all([
        getJourScolaire(today),
        getJoursScolaires(today, horizonISO),
        getDoc(doc(db, 'stats', 'summary')),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
        getDocs(query(collection(db, 'absences'), where('date', '>=', weekAgo), where('date', '<', today))),
        getDocs(collection(db, 'emploiDuTemps')),
      ])
      setTodayJour(jour)

      const upcoming = jours
        .filter(j => j.date > today && j.type !== 'normal')
        .sort((a, b) => a.date.localeCompare(b.date))
      setNextEvent(upcoming[0] ?? null)

      // ── Devoirs actifs : agrégat serveur uniquement ──
      let devoirsActifs = 0
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
      devoirsActifs = s.activeHomework || 0

      // ── État du jour : pointages d'aujourd'hui ──
      const absents = new Set<string>()
      const pointed = new Set<string>()
      const completedRollCalls = new Set<string>()
      absTodaySnap.forEach(d => {
        const a = toDoc<AbsenceDoc>(d)
        if (a.eleveId) pointed.add(a.eleveId)
        if (a.classe && a.seance) completedRollCalls.add(rollCallSessionKey(a.classe, a.seance))
        if (a.statut === 'absent' && a.eleveId) absents.add(a.eleveId)
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
        absentsToday: absents.size,
        presenceConfirmed,
        classesSansAppel,
        trendDelta,
        devoirsActifs,
      })
    } catch (e: any) {
      console.warn('[admin dashboard]', e?.message)
      setLoadError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribePrayerClassSessionsForDay(
    todayISO(),
    setPrayerSessions,
    () => setPrayerSessions([]),
  ), [])
  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await httpsCallable(functions, 'recomputeSchoolStats')()
    } catch (e: any) {
      console.warn('[admin dashboard refresh]', e?.message)
    }
    await load()
  }

  // Le Hero ne porte que les urgences scolaires. Les messages vivent dans
  // leur onglet dédié, où le badge de navigation suffit.
  const priorities: { key: string; headline: string; route: AdminQuickRoute; color: string; bg: string }[] = []
  if (state) {
    if (state.classesSansAppel.length > 0) {
      priorities.push({
        key: 'calls',
        headline: t('admin.heroPriorityCalls', { count: state.classesSansAppel.length }),
        route: 'AdminRollCalls', color: theme.warning, bg: theme.warningSurface,
      })
    }
    if (state.absentsToday > 0) {
      priorities.push({
        key: 'abs',
        headline: t('admin.heroPriorityAbsences', { count: state.absentsToday }),
        route: 'AdminAbsences', color: theme.danger, bg: theme.dangerSurface,
      })
    }
  }
  const primaryPriority = priorities[0] ?? null
  const isSpecialDay = Boolean(todayJour?.annuleCours)
  const specialDayTone = todayJour?.type === 'vacances' ? theme.info : theme.danger
  const heroTone = state
    ? (primaryPriority?.color ?? (isSpecialDay ? specialDayTone : theme.success))
    : (loadError ? theme.danger : theme.primary)
  const heroToneSurface = state
    ? (primaryPriority?.bg ?? (isSpecialDay
      ? (todayJour?.type === 'vacances' ? theme.infoSurface : theme.dangerSurface)
      : theme.successSurface))
    : (loadError ? theme.dangerSurface : theme.primarySurface)
  const trendTone = (state?.trendDelta ?? 0) >= 0 ? theme.success : theme.danger
  const heroHeadline = !state && loadError
    ? t('admin.dashboardLoadError')
    : (primaryPriority?.headline
      ?? (isSpecialDay ? (todayJour?.label || t('calendar.specialDay')) : t('admin.allGood')))
  const heroStatusLabel = state
    ? (isSpecialDay && !primaryPriority
      ? t('calendar.coursesCancelled')
      : (state.presenceConfirmed !== null
        ? `${t('admin.confirmedPresence')} ${state.presenceConfirmed}%${state.trendDelta !== null ? `, ${state.trendDelta > 0 ? '+' : ''}${state.trendDelta} ${t('admin.vs7d')}` : ''}`
        : t('admin.noCallYet')))
    : ''
  const heroAccessibilityLabel = state
    ? `${heroHeadline}. ${heroStatusLabel}`
    : (loadError ? heroHeadline : undefined)
  const heroActionable = Boolean(primaryPriority || loadError)
  const nextEventMeta = nextEvent
    ? `${t(`calendar.${nextEvent.type}`)} · ${t('admin.eventInDays', { count: daysUntilISO(nextEvent.date) })}`
    : t('admin.calendarAccess')

  const dailyActions: OperationItem[] = state ? [
    {
      key: 'calls',
      icon: <ClipboardCheck
        size={17}
        color={isSpecialDay ? theme.textMuted : (state.classesSansAppel.length > 0 ? theme.warning : theme.success)}
        strokeWidth={2.1}
      />,
      iconBg: isSpecialDay
        ? theme.surfaceAlt
        : (state.classesSansAppel.length > 0 ? theme.warningSurface : theme.successSurface),
      title: t('admin.rollCalls'),
      status: isSpecialDay
        ? t('calendar.coursesCancelled')
        : (primaryPriority?.route === 'AdminRollCalls'
          ? t('admin.statusOpen')
          : (state.classesSansAppel.length > 0
            ? `${state.classesSansAppel.length} · ${t('admin.statusPending')}`
            : t('admin.statusUpToDate'))),
      statusColor: !isSpecialDay && state.classesSansAppel.length > 0 && primaryPriority?.route !== 'AdminRollCalls'
        ? theme.warning
        : theme.textMuted,
      route: 'AdminRollCalls',
    },
    {
      key: 'prayer',
      icon: <MoonStar
        size={17}
        color={prayerSessions.some(session => session.status !== 'returned') ? theme.info : theme.textMuted}
        strokeWidth={2.1}
      />,
      iconBg: prayerSessions.some(session => session.status !== 'returned')
        ? theme.infoSurface
        : theme.surfaceAlt,
      title: t('prayer.title'),
      status: prayerSessions.some(session => session.status !== 'returned')
        ? t('prayer.activeSummary', {
          count: prayerSessions.filter(session => session.status !== 'returned').length,
        })
        : (prayerSessions.length > 0
          ? t('prayer.completedSummary', { count: prayerSessions.length })
          : t('prayer.noActive')),
      statusColor: prayerSessions.some(session => session.status !== 'returned')
        ? theme.info
        : theme.textMuted,
      route: 'AdminPrayer',
    },
    {
      key: 'absences',
      icon: <CalendarX size={17} color={state.absentsToday > 0 ? theme.danger : theme.success} strokeWidth={2.1} />,
      iconBg: state.absentsToday > 0 ? theme.dangerSurface : theme.successSurface,
      title: t('tabs.absences'),
      status: primaryPriority?.route === 'AdminAbsences'
        ? t('admin.statusOpen')
        : (state.absentsToday > 0
          ? `${state.absentsToday} · ${t('admin.statusToday')}`
          : t('admin.statusNoAbsences')),
      statusColor: state.absentsToday > 0 && primaryPriority?.route !== 'AdminAbsences'
        ? theme.danger
        : theme.textMuted,
      route: 'AdminAbsences',
    },
    {
      key: 'homework',
      icon: <BookOpen size={17} color={state.devoirsActifs > 0 ? theme.accent : theme.textMuted} strokeWidth={2.1} />,
      iconBg: state.devoirsActifs > 0 ? theme.accentSurface : theme.surfaceAlt,
      title: t('tabs.homework'),
      status: state.devoirsActifs > 0
        ? `${state.devoirsActifs} · ${t('admin.statusActive')}`
        : t('admin.statusNoActive'),
      statusColor: state.devoirsActifs > 0 ? theme.accent : theme.textMuted,
      route: 'AdminDevoirs',
    },
  ] : []

  const organizationActions: OperationItem[] = [
    {
      key: 'users',
      icon: <Users size={17} color={theme.primary} strokeWidth={2.1} />,
      iconBg: theme.primarySurface,
      title: t('admin.users'),
      route: 'AdminUsers',
    },
    {
      key: 'schedule',
      icon: <CalendarClock size={17} color={theme.primary} strokeWidth={2.1} />,
      iconBg: theme.primarySurface,
      title: t('actions.schedule'),
      route: 'AdminEdt',
    },
  ]

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
        <View
          accessible={!heroActionable && Boolean(heroAccessibilityLabel)}
          accessibilityRole={!heroActionable ? 'summary' : undefined}
          accessibilityLabel={!heroActionable ? heroAccessibilityLabel : undefined}
        >
        <Pressable
          onPress={() => {
            if (primaryPriority) {
              goTo(primaryPriority.route)
            } else if (loadError) {
              void load()
            }
          }}
          disabled={!heroActionable}
          accessible={heroActionable}
          accessibilityRole={heroActionable ? 'button' : undefined}
          accessibilityLabel={heroActionable ? heroAccessibilityLabel : undefined}
          accessibilityHint={primaryPriority ? t('admin.heroPriorityHint') : (loadError ? t('admin.retryDashboard') : undefined)}
          style={({ pressed }) => pressed && heroActionable ? styles.heroPressed : undefined}
        >
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: theme.card,
                borderColor: primaryPriority || isSpecialDay || loadError ? hexWithAlpha(heroTone, 0.42) : theme.border,
              },
              theme.shadows.clay,
            ]}
          >
            {state ? (
              <View style={[styles.heroSignal, isAr && styles.rowReverse]}>
                <View style={[styles.heroSignalText, isAr && styles.rtlBlock]}>
                  {primaryPriority ? (
                    <View style={[styles.heroVerdictRow, isAr && styles.rowReverse]}>
                      <View style={[styles.heroVerdictIcon, { backgroundColor: heroToneSurface }]}>
                        <AlertTriangle size={20} color={heroTone} strokeWidth={2.4} />
                      </View>
                      <Text numberOfLines={2} style={[styles.heroVerdict, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black, letterSpacing: isAr ? 0 : -0.3 }]}>
                        {primaryPriority.headline}
                      </Text>
                      <View style={[
                        styles.heroActionChevron,
                        { backgroundColor: theme.surface },
                        isAr && styles.chevronRtl,
                      ]}>
                        <ChevronRight size={16} color={theme.textMuted} strokeWidth={2.2} />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.heroVerdictRow, isAr && styles.rowReverse]}>
                      <View style={[styles.heroVerdictIcon, { backgroundColor: heroToneSurface }]}>
                        {isSpecialDay
                          ? <CalendarX size={20} color={heroTone} strokeWidth={2.4} />
                          : <CheckCircle2 size={20} color={heroTone} strokeWidth={2.4} />}
                      </View>
                      <Text numberOfLines={2} style={[styles.heroVerdict, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black, letterSpacing: isAr ? 0 : -0.3 }]}>
                        {heroHeadline}
                      </Text>
                    </View>
                  )}

                  {isSpecialDay && !primaryPriority ? (
                    <View style={[styles.heroProofRow, { borderTopColor: theme.border }, isAr && styles.rowReverse]}>
                      <Text style={[styles.heroProofText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                        {t('calendar.coursesCancelled')}
                      </Text>
                    </View>
                  ) : state.presenceConfirmed !== null ? (
                    <View style={[styles.heroProofRow, { borderTopColor: theme.border }, isAr && styles.rowReverse]}>
                      <Text style={[styles.heroProofText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                        {t('admin.confirmedPresence')} · <AnimatedCounter value={state.presenceConfirmed} />%
                      </Text>
                      {state.trendDelta !== null ? (
                        <View style={[
                          styles.heroTrendPill,
                          { backgroundColor: hexWithAlpha(trendTone, 0.12) },
                          isAr && styles.rowReverse,
                        ]}>
                          {state.trendDelta >= 0
                            ? <TrendingUp size={12} color={trendTone} strokeWidth={2.3} />
                            : <TrendingDown size={12} color={trendTone} strokeWidth={2.3} />}
                          <Text style={[styles.heroTrendText, { color: trendTone, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.bold }]}>
                            {state.trendDelta > 0 ? '+' : ''}{state.trendDelta} pt
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={[styles.heroProofRow, { borderTopColor: theme.border }, isAr && styles.rowReverse]}>
                      <Text style={[styles.heroProofText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                        {t('admin.noCallYet')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : loadError ? (
              <View style={[styles.heroSignal, isAr && styles.rowReverse]}>
                <View style={[styles.heroSignalText, isAr && styles.rtlBlock]}>
                  <View style={[styles.heroVerdictRow, isAr && styles.rowReverse]}>
                    <View style={[styles.heroVerdictIcon, { backgroundColor: heroToneSurface }]}>
                      <AlertTriangle size={20} color={heroTone} strokeWidth={2.4} />
                    </View>
                    <Text numberOfLines={2} style={[styles.heroVerdict, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black, letterSpacing: isAr ? 0 : -0.3 }]}>
                      {heroHeadline}
                    </Text>
                    <View style={[styles.heroActionChevron, { backgroundColor: theme.surface }, isAr && styles.chevronRtl]}>
                      <ChevronRight size={16} color={theme.textMuted} strokeWidth={2.2} />
                    </View>
                  </View>
                  <View style={[styles.heroProofRow, { borderTopColor: theme.border }, isAr && styles.rowReverse]}>
                    <Text style={[styles.heroProofText, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                      {t('admin.retryDashboard')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.heroLoading}>
                <ActivityIndicator color={heroTone} />
              </View>
            )}
          </View>
        </Pressable>
        </View>

        {state ? (
          <AgendaSpotlight
            event={nextEvent}
            eyebrow={t('admin.nextEvent')}
            emptyTitle={t('admin.noUpcomingEvent')}
            meta={nextEventMeta}
            onPress={() => goTo('AdminCalendarTab')}
            theme={theme}
            isAr={isAr}
            language={i18n.language}
          />
        ) : null}

        {loading && !state ? null : state ? (
          <>
            <OperationsPanel
              pickupTitle={t('admin.pickupTransport')}
              pickupSubtitle={t('admin.pickupManagementHint')}
              todayLabel={t('admin.todayGroup')}
              organizationLabel={t('admin.organizationGroup')}
              dailyActions={dailyActions}
              organizationActions={organizationActions}
              onPickup={() => goTo('AdminPickup')}
              onPress={goTo}
              theme={theme}
              isAr={isAr}
            />
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

function AgendaSpotlight({ event, eyebrow, emptyTitle, meta, onPress, theme, isAr, language }: {
  event: JourScolaire | null
  eyebrow: string
  emptyTitle: string
  meta: string
  onPress: () => void
  theme: Theme
  isAr: boolean
  language: string
}) {
  const tone = event?.type === 'vacances'
    ? theme.success
    : (event?.type === 'examen' ? theme.accent : theme.primary)
  const dateChip = event ? formatDateChip(event.date, language) : null
  const title = event?.label || emptyTitle

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${title}. ${meta}`}
      style={({ pressed }) => [
        styles.agendaSpotlight,
        isAr && styles.rowReverse,
        {
          backgroundColor: pressed ? hexWithAlpha(tone, 0.12) : hexWithAlpha(tone, event ? 0.07 : 0.045),
          borderColor: hexWithAlpha(tone, event ? 0.24 : 0.14),
        },
      ]}
    >
      {dateChip ? (
        <View style={[styles.agendaDateChip, { backgroundColor: theme.card, borderColor: hexWithAlpha(tone, 0.18) }]}>
          <Text style={[styles.agendaDay, { color: tone, fontFamily: theme.fonts.black }]}>{dateChip.day}</Text>
          <Text style={[styles.agendaMonth, {
            color: tone,
            fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            letterSpacing: isAr ? 0 : 0.5,
          }]}>{dateChip.month}</Text>
        </View>
      ) : (
        <View style={[styles.agendaEmptyIcon, { backgroundColor: theme.card }]}>
          <CalendarClock size={21} color={tone} strokeWidth={2.1} />
        </View>
      )}
      <View style={[styles.agendaCopy, isAr && styles.rtlBlock]}>
        <Text style={[styles.agendaEyebrow, {
          color: tone,
          fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
          letterSpacing: isAr ? 0 : 0.8,
        }]}>
          {eyebrow}
        </Text>
        <Text numberOfLines={2} style={[styles.agendaTitle, {
          color: theme.text,
          fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
          letterSpacing: isAr ? 0 : -0.15,
        }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.agendaMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
          {meta}
        </Text>
      </View>
      <View style={[styles.agendaChevron, { backgroundColor: theme.card }, isAr && styles.chevronRtl]}>
        <ChevronRight size={16} color={tone} strokeWidth={2.2} />
      </View>
    </Pressable>
  )
}

function OperationsPanel({
  pickupTitle,
  pickupSubtitle,
  todayLabel,
  organizationLabel,
  dailyActions,
  organizationActions,
  onPickup,
  onPress,
  theme,
  isAr,
}: {
  pickupTitle: string
  pickupSubtitle: string
  todayLabel: string
  organizationLabel: string
  dailyActions: OperationItem[]
  organizationActions: OperationItem[]
  onPickup: () => void
  onPress: (route: AdminQuickRoute) => void
  theme: Theme
  isAr: boolean
}) {
  return (
    <View style={[styles.operationsPanel, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <Pressable
        onPress={onPickup}
        accessibilityRole="button"
        accessibilityLabel={`${pickupTitle}. ${pickupSubtitle}`}
        style={({ pressed }) => [
          styles.pickupFeature,
          isAr && styles.rowReverse,
          {
            backgroundColor: pressed ? hexWithAlpha(theme.primary, 0.14) : theme.primarySurface,
            borderColor: hexWithAlpha(theme.primary, 0.2),
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.pickupRail,
            isAr ? styles.pickupRailRtl : styles.pickupRailLtr,
            { backgroundColor: theme.primary },
          ]}
        />
        <View
          style={[styles.pickupFeatureIcon, { backgroundColor: theme.card }]}
        >
          <CarFront size={22} color={theme.primary} strokeWidth={2.15} />
        </View>
        <View style={[styles.pickupFeatureCopy, isAr && styles.rtlBlock]}>
          <Text numberOfLines={1} style={[styles.pickupFeatureTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
            {pickupTitle}
          </Text>
          <Text numberOfLines={2} style={[styles.pickupFeatureSubtitle, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
            {pickupSubtitle}
          </Text>
        </View>
        <View style={[styles.pickupChevron, { backgroundColor: theme.primary }, isAr && styles.chevronRtl]}>
          <ChevronRight size={16} color={theme.white} strokeWidth={2.2} />
        </View>
      </Pressable>

      <GroupLabel label={todayLabel} theme={theme} isAr={isAr} />
      {dailyActions.map((action, index) => (
        <ActionListRow
          key={action.key}
          action={action}
          showDivider={index < dailyActions.length - 1}
          onPress={() => onPress(action.route)}
          theme={theme}
          isAr={isAr}
        />
      ))}

      <View style={[styles.operationsBand, { backgroundColor: theme.surfaceAlt }]} />

      <GroupLabel label={organizationLabel} theme={theme} isAr={isAr} />
      {organizationActions.map((action, index) => (
        <ActionListRow
          key={action.key}
          action={action}
          showDivider={index < organizationActions.length - 1}
          onPress={() => onPress(action.route)}
          theme={theme}
          isAr={isAr}
        />
      ))}
    </View>
  )
}

function GroupLabel({ label, theme, isAr }: { label: string; theme: Theme; isAr: boolean }) {
  return (
    <Text style={[styles.groupLabel, {
      color: theme.textMuted,
      fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
      letterSpacing: isAr ? 0 : 0.8,
      textAlign: isAr ? 'right' : 'left',
      writingDirection: isAr ? 'rtl' : 'ltr',
    }]}>
      {label}
    </Text>
  )
}

function ActionListRow({ action, showDivider, onPress, theme, isAr }: {
  action: OperationItem
  showDivider: boolean
  onPress: () => void
  theme: Theme
  isAr: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={action.status ? `${action.title}. ${action.status}` : action.title}
      style={({ pressed }) => [
        styles.actionListRow,
        isAr && styles.rowReverse,
        pressed && { backgroundColor: hexWithAlpha(theme.primary, 0.035) },
      ]}
    >
      <View style={[styles.listIcon, { backgroundColor: action.iconBg }]}>{action.icon}</View>
      <Text numberOfLines={1} style={[styles.listTitle, {
        color: theme.text,
        fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold,
        textAlign: isAr ? 'right' : 'left',
        writingDirection: isAr ? 'rtl' : 'ltr',
      }]}>
        {action.title}
      </Text>
      {action.status ? (
        <Text numberOfLines={1} style={[styles.listStatus, {
          color: action.statusColor || theme.textMuted,
          fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
          textAlign: isAr ? 'left' : 'right',
          writingDirection: isAr ? 'rtl' : 'ltr',
        }]}>
          {action.status}
        </Text>
      ) : null}
      <View style={isAr ? styles.chevronRtl : undefined}>
        <ChevronRight size={15} color={theme.textMuted} strokeWidth={2.1} />
      </View>
      {showDivider ? (
        <View
          pointerEvents="none"
          style={[
            styles.insetDivider,
            isAr ? styles.insetDividerRtl : styles.insetDividerLtr,
            { backgroundColor: theme.border },
          ]}
        />
      ) : null}
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
    marginTop: 12,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    overflow: 'hidden',
  },
  heroPressed: {
    opacity: 0.72,
  },
  heroSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroSignalText: {
    flex: 1,
    minWidth: 0,
  },
  heroVerdictRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroVerdict: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
  },
  heroVerdictIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionChevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronRtl: {
    transform: [{ rotate: '180deg' }],
  },
  heroProofRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heroProofText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  heroTrendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroTrendText: {
    fontSize: 11,
  },
  heroLoading: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  rtlBlock: {
    alignItems: 'flex-end',
  },

  agendaSpotlight: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  agendaDateChip: {
    width: 58,
    height: 70,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  agendaDay: {
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  agendaMonth: {
    fontSize: 9.5,
    lineHeight: 13,
  },
  agendaEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  agendaCopy: {
    flex: 1,
    minWidth: 0,
  },
  agendaEyebrow: {
    fontSize: 10,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  agendaTitle: {
    fontSize: 16.5,
    lineHeight: 21,
    marginTop: 2,
  },
  agendaMeta: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 5,
  },
  agendaChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationsPanel: {
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  pickupFeature: {
    minHeight: 80,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  pickupRail: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 3,
  },
  pickupRailLtr: { left: 0 },
  pickupRailRtl: { right: 0 },
  pickupFeatureIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  pickupFeatureCopy: {
    flex: 1,
    minWidth: 0,
  },
  pickupFeatureTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  pickupFeatureSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  pickupChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupLabel: {
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 6,
    fontSize: 10.5,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  operationsBand: {
    height: 7,
    marginTop: 2,
  },
  actionListRow: {
    minHeight: 58,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  listIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  listTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 19,
  },
  listStatus: {
    maxWidth: 112,
    fontSize: 11.5,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  insetDivider: {
    position: 'absolute',
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  insetDividerLtr: { left: 58, right: 14 },
  insetDividerRtl: { right: 58, left: 14 },
  footer: { alignItems: 'center', justifyContent: 'center', marginTop: 28 },
})
