import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Megaphone,
  RefreshCw,
  School,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import {
  closeTodayPickupSession,
  openTodayPickupSession,
  pickupSessionIsCurrentlyOpen,
  subscribeTodayPickupQueue,
  subscribeTodayPickupSession,
  updatePickupStatus,
} from '../../services/pickup-service'
import type { PickupRequest, PickupSession, PickupStatus } from '../../types/pickup'

type ActivePickupStatus = Exclude<PickupStatus, 'cancelled'>
type AdvancePickupStatus = Exclude<ActivePickupStatus, 'waiting'>

interface QueueSection {
  status: ActivePickupStatus
  title: string
  subtitle: string
  color: string
  surface: string
  icon: LucideIcon
  data: PickupRequest[]
}

const STATUS_ORDER: ActivePickupStatus[] = ['waiting', 'called', 'ready', 'completed']
const NEXT_STATUS: Partial<Record<PickupStatus, AdvancePickupStatus>> = {
  waiting: 'called',
  called: 'ready',
  ready: 'completed',
}

function fontFor(
  theme: Theme,
  isAr: boolean,
  weight: 'regular' | 'medium' | 'semibold' | 'bold' | 'black',
) {
  if (isAr) return weight === 'bold' || weight === 'black'
    ? theme.fonts.arabicBold
    : theme.fonts.arabicSemi
  return theme.fonts[weight]
}

function localeForLanguage(language: string): string {
  if (language.startsWith('ar')) return 'ar-MA'
  if (language.startsWith('en')) return 'en-US'
  return 'fr-FR'
}

function statusDetails(status: ActivePickupStatus, theme: Theme, t: TFunction) {
  const details: Record<ActivePickupStatus, {
    title: string
    subtitle: string
    badge: string
    action: string | null
    color: string
    surface: string
    icon: LucideIcon
  }> = {
    waiting: {
      title: t('pickup.admin.status.waiting.title'),
      subtitle: t('pickup.admin.status.waiting.subtitle'),
      badge: t('pickup.admin.status.waiting.badge'),
      action: t('pickup.admin.status.waiting.action'),
      color: theme.warning,
      surface: theme.warningSurface,
      icon: Clock3,
    },
    called: {
      title: t('pickup.admin.status.called.title'),
      subtitle: t('pickup.admin.status.called.subtitle'),
      badge: t('pickup.admin.status.called.badge'),
      action: t('pickup.admin.status.called.action'),
      color: theme.info,
      surface: theme.infoSurface,
      icon: Megaphone,
    },
    ready: {
      title: t('pickup.admin.status.ready.title'),
      subtitle: t('pickup.admin.status.ready.subtitle'),
      badge: t('pickup.admin.status.ready.badge'),
      action: t('pickup.admin.status.ready.action'),
      color: theme.success,
      surface: theme.successSurface,
      icon: UserCheck,
    },
    completed: {
      title: t('pickup.admin.status.completed.title'),
      subtitle: t('pickup.admin.status.completed.subtitle'),
      badge: t('pickup.admin.status.completed.badge'),
      action: null,
      color: theme.success,
      surface: theme.successSurface,
      icon: CheckCircle2,
    },
  }
  return details[status]
}

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const date = toDate.call(value)
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
    }
  }
  return null
}

function arrivalMillis(request: PickupRequest): number {
  return timestampToDate(request.arrivedAt)?.getTime() ?? 0
}

function arrivalLabel(value: unknown, t: TFunction, locale: string): string {
  const date = timestampToDate(value)
  if (!date) return t('pickup.admin.time.arrivalUnavailable')
  return t('pickup.admin.time.arrivedAt', {
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  })
}

function waitingLabel(value: unknown, t: TFunction): string | null {
  const date = timestampToDate(value)
  if (!date) return null
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return t('pickup.admin.time.justNow')
  if (minutes < 60) return t('pickup.admin.time.waitMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  return t('pickup.admin.time.waitHoursMinutes', { hours, minutes: minutes % 60 })
}

function studentName(request: PickupRequest, t: TFunction): string {
  return [request.elevePrenom, request.eleveNom].filter(Boolean).join(' ').trim()
    || t('pickup.common.student')
}

export default function AdminPickupScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'fr'
  const isAr = language.startsWith('ar')
  const timeLocale = localeForLanguage(language)
  const [queue, setQueue] = useState<PickupRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [mutationError, setMutationError] = useState(false)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [subscriptionKey, setSubscriptionKey] = useState(0)
  const [pickupSession, setPickupSession] = useState<PickupSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionUpdating, setSessionUpdating] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionSubscriptionKey, setSessionSubscriptionKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    return subscribeTodayPickupQueue(
      (nextQueue: PickupRequest[]) => {
        setQueue(nextQueue)
        setLoading(false)
        setLoadError(false)
      },
      () => {
        setLoadError(true)
        setLoading(false)
      },
    )
  }, [subscriptionKey])

  useEffect(() => {
    setSessionLoading(true)
    setSessionError(null)
    return subscribeTodayPickupSession(
      session => {
        setPickupSession(session)
        setSessionLoading(false)
        setSessionError(null)
        setNow(Date.now())
      },
      () => {
        setSessionLoading(false)
        setSessionError(t('pickup.admin.errors.sessionLoad'))
      },
    )
  }, [sessionSubscriptionKey, t])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const visibleQueue = useMemo(
    () => queue.filter(request => request.status !== 'cancelled'),
    [queue],
  )

  const counts = useMemo(() => {
    const result: Record<ActivePickupStatus, number> = {
      waiting: 0,
      called: 0,
      ready: 0,
      completed: 0,
    }
    visibleQueue.forEach(request => {
      if (request.status !== 'cancelled') result[request.status] += 1
    })
    return result
  }, [visibleQueue])

  const sections = useMemo<QueueSection[]>(
    () => STATUS_ORDER.map(status => {
      const details = statusDetails(status, theme, t)
      return {
        status,
        title: details.title,
        subtitle: details.subtitle,
        color: details.color,
        surface: details.surface,
        icon: details.icon,
        data: visibleQueue
          .filter(request => request.status === status)
          .sort((a, b) => arrivalMillis(a) - arrivalMillis(b)),
      }
    }).filter(section => section.data.length > 0),
    [t, theme, visibleQueue],
  )

  const activeCount = counts.waiting + counts.called + counts.ready
  const sessionIsOpen = pickupSessionIsCurrentlyOpen(pickupSession, now)

  const openPickupSession = async () => {
    if (sessionUpdating) return
    setSessionUpdating(true)
    setSessionError(null)
    try {
      await openTodayPickupSession(180)
    } catch {
      setSessionError(t('pickup.admin.errors.sessionOpen'))
    } finally {
      setSessionUpdating(false)
    }
  }

  const closePickupSession = async () => {
    if (sessionUpdating) return
    setSessionUpdating(true)
    setSessionError(null)
    try {
      await closeTodayPickupSession()
    } catch {
      setSessionError(t('pickup.admin.errors.sessionClose'))
    } finally {
      setSessionUpdating(false)
    }
  }

  const confirmClosePickupSession = () => {
    if (!sessionIsOpen || sessionUpdating) return
    Alert.alert(
      t('pickup.admin.dialogs.closeSession.title'),
      t('pickup.admin.dialogs.closeSession.message'),
      [
        { text: t('pickup.admin.dialogs.closeSession.keepOpen'), style: 'cancel' },
        {
          text: t('pickup.admin.dialogs.closeSession.confirm'),
          style: 'destructive',
          onPress: () => { void closePickupSession() },
        },
      ],
    )
  }

  const performStatusUpdate = async (
    request: PickupRequest,
    nextStatus: AdvancePickupStatus,
  ) => {
    setMutationError(false)
    setUpdatingIds(current => {
      const next = new Set(current)
      next.add(request.id)
      return next
    })
    try {
      await updatePickupStatus(request.id, nextStatus)
    } catch {
      setMutationError(true)
    } finally {
      setUpdatingIds(current => {
        const next = new Set(current)
        next.delete(request.id)
        return next
      })
    }
  }

  const advanceRequest = (request: PickupRequest) => {
    const nextStatus = NEXT_STATUS[request.status]
    if (!nextStatus || updatingIds.has(request.id)) return

    if (nextStatus === 'completed') {
      Alert.alert(
        t('pickup.admin.dialogs.handoff.title'),
        t('pickup.admin.dialogs.handoff.message', { student: studentName(request, t) }),
        [
          { text: t('common.back'), style: 'cancel' },
          {
            text: t('pickup.admin.dialogs.handoff.verified'),
            style: 'destructive',
            onPress: () => { void performStatusUpdate(request, nextStatus) },
          },
        ],
      )
      return
    }

    void performStatusUpdate(request, nextStatus)
  }

  return (
    <ScreenLayout title={t('pickup.screenTitle')}>
      <SectionList
        sections={sections}
        keyExtractor={request => request.id}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: theme.primaryDark, borderColor: theme.primaryBorder },
                theme.shadows.sm,
              ]}
            >
              <View style={[styles.summaryTopRow, isAr && styles.rtlRow]}>
                <View style={styles.summaryTitleBlock}>
                  <Text style={[
                    styles.summaryEyebrow,
                    isAr && styles.rtlText,
                    isAr && styles.arabicEyebrow,
                    { fontFamily: fontFor(theme, isAr, 'semibold') },
                  ]}>
                    {t('pickup.admin.summary.eyebrow')}
                  </Text>
                  <Text style={[
                    styles.summaryTitle,
                    isAr && styles.rtlText,
                    { fontFamily: fontFor(theme, isAr, 'black') },
                  ]}>
                    {t('pickup.admin.summary.title')}
                  </Text>
                  <Text style={[
                    styles.summarySubtitle,
                    isAr && styles.rtlText,
                    { fontFamily: fontFor(theme, isAr, 'regular') },
                  ]}>
                    {t('pickup.admin.summary.subtitle')}
                  </Text>
                </View>
                <View
                  style={styles.activeCountBubble}
                  accessibilityLabel={t('pickup.admin.summary.activeCountA11y', { count: activeCount })}
                >
                  <Text style={[styles.activeCount, { fontFamily: fontFor(theme, isAr, 'black') }]}>{activeCount}</Text>
                  <Text style={[styles.activeCountLabel, { fontFamily: fontFor(theme, isAr, 'semibold') }]}>
                    {t('pickup.admin.summary.activeLabel')}
                  </Text>
                </View>
              </View>
              <View style={[styles.summaryStats, isAr && styles.rtlRow]}>
                <SummaryStat label={t('pickup.admin.summary.waiting')} value={counts.waiting} icon={Clock3} theme={theme} isAr={isAr} />
                <SummaryStat label={t('pickup.admin.summary.called')} value={counts.called} icon={Megaphone} theme={theme} isAr={isAr} />
                <SummaryStat label={t('pickup.admin.summary.ready')} value={counts.ready} icon={UserCheck} theme={theme} isAr={isAr} />
                <SummaryStat label={t('pickup.admin.summary.completed')} value={counts.completed} icon={CheckCircle2} theme={theme} isAr={isAr} />
              </View>
            </View>

            <AdminSessionControl
              session={pickupSession}
              isOpen={sessionIsOpen}
              loading={sessionLoading}
              updating={sessionUpdating}
              error={sessionError}
              now={now}
              theme={theme}
              t={t}
              locale={timeLocale}
              isAr={isAr}
              onOpen={() => { void openPickupSession() }}
              onClose={confirmClosePickupSession}
              onRetry={() => setSessionSubscriptionKey(key => key + 1)}
            />

            {loadError ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.errorBox,
                  isAr && styles.rtlRow,
                  { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                ]}
              >
                <AlertTriangle size={18} color={theme.danger} strokeWidth={2.1} />
                <Text selectable style={[
                  styles.errorText,
                  isAr && styles.rtlText,
                  { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') },
                ]}>
                  {t('pickup.admin.errors.queueLoad')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pickup.admin.queue.retryA11y')}
                  onPress={() => setSubscriptionKey(key => key + 1)}
                  style={({ pressed }) => [
                    styles.retryButton,
                    isAr && styles.rtlRow,
                    { borderColor: theme.danger },
                    pressed && styles.pressed,
                  ]}
                >
                  <RefreshCw size={15} color={theme.danger} strokeWidth={2.2} />
                  <Text style={[styles.retryText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'bold') }]}>
                    {t('pickup.admin.queue.retry')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {mutationError ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.errorBox,
                  isAr && styles.rtlRow,
                  { backgroundColor: theme.dangerSurface, borderColor: theme.danger },
                ]}
              >
                <AlertTriangle size={18} color={theme.danger} strokeWidth={2.1} />
                <Text selectable style={[
                  styles.errorText,
                  isAr && styles.rtlText,
                  { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') },
                ]}>
                  {t('pickup.admin.errors.update')}
                </Text>
              </View>
            ) : null}

            {!loading && visibleQueue.length > 0 ? (
              <View style={[styles.queueHeading, isAr && styles.rtlRow]}>
                <View style={isAr && styles.rtlBlock}>
                  <Text style={[
                    styles.queueTitle,
                    isAr && styles.rtlText,
                    { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') },
                  ]}>
                    {t('pickup.admin.queue.title')}
                  </Text>
                  <Text style={[
                    styles.queueSubtitle,
                    isAr && styles.rtlText,
                    { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') },
                  ]}>
                    {t('pickup.admin.queue.subtitle')}
                  </Text>
                </View>
                <View style={[styles.totalPill, isAr && styles.rtlRow, { backgroundColor: theme.surfaceAlt }]}>
                  <Users size={14} color={theme.primary} strokeWidth={2} />
                  <Text style={[styles.totalText, { color: theme.primary, fontFamily: fontFor(theme, isAr, 'bold') }]}>{visibleQueue.length}</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
        ListEmptyComponent={(
          loading ? (
            <View style={styles.loading} accessibilityLabel={t('pickup.admin.queue.loadingA11y')}>
              <ActivityIndicator color={theme.primary} size="large" />
              <Text style={[
                styles.loadingText,
                isAr && styles.rtlText,
                { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') },
              ]}>
                {t('pickup.admin.queue.loading')}
              </Text>
            </View>
          ) : !loadError ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }, theme.shadows.xs]}>
              <View style={styles.emptyStateWrap}>
                <View style={[styles.emptyStateIcon, { backgroundColor: theme.surface }]}>
                  <School size={22} color={theme.textMuted} strokeWidth={1.75} />
                </View>
                <Text style={[
                  styles.emptyStateTitle,
                  isAr && styles.rtlText,
                  { color: theme.text, fontFamily: fontFor(theme, isAr, 'semibold') },
                ]}>
                  {t('pickup.admin.queue.emptyTitle')}
                </Text>
                <Text style={[
                  styles.emptyStateMessage,
                  isAr && styles.rtlText,
                  { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') },
                ]}>
                  {t('pickup.admin.queue.emptyMessage')}
                </Text>
              </View>
            </View>
          ) : null
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader section={section} theme={theme} isAr={isAr} />
        )}
        renderItem={({ item, section }) => (
          <QueueCard
            request={item}
            section={section}
            theme={theme}
            t={t}
            locale={timeLocale}
            isAr={isAr}
            updating={updatingIds.has(item.id)}
            onAdvance={() => advanceRequest(item)}
          />
        )}
      />
    </ScreenLayout>
  )
}

function AdminSessionControl({
  session,
  isOpen,
  loading,
  updating,
  error,
  now,
  theme,
  t,
  locale,
  isAr,
  onOpen,
  onClose,
  onRetry,
}: {
  session: PickupSession | null
  isOpen: boolean
  loading: boolean
  updating: boolean
  error: string | null
  now: number
  theme: Theme
  t: TFunction
  locale: string
  isAr: boolean
  onOpen: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const closesAt = timestampToDate(session?.closesAt)
  const expired = Boolean(session?.isOpen && closesAt && closesAt.getTime() < now)
  const closeTime = closesAt?.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const title = isOpen
    ? t('pickup.admin.session.openTitle')
    : expired
      ? t('pickup.admin.session.expiredTitle')
      : t('pickup.admin.session.closedTitle')
  const message = isOpen && closeTime
    ? t('pickup.admin.session.openUntil', { time: closeTime })
    : expired
      ? t('pickup.admin.session.expiredMessage')
      : t('pickup.admin.session.closedMessage')
  const color = isOpen ? theme.success : theme.warning
  const surface = isOpen ? theme.successSurface : theme.warningSurface

  if (loading) {
    return (
      <View style={[
        styles.sessionCard,
        styles.sessionLoadingCard,
        isAr && styles.rtlRow,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
        <ActivityIndicator color={theme.primary} size="small" />
        <View style={[styles.sessionTextBlock, isAr && styles.rtlBlock]}>
          <Text style={[
            styles.sessionTitle,
            isAr && styles.rtlText,
            { color: theme.text, fontFamily: fontFor(theme, isAr, 'semibold') },
          ]}>
            {t('pickup.admin.session.loadingTitle')}
          </Text>
          <Text style={[
            styles.sessionMessage,
            isAr && styles.rtlText,
            { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') },
          ]}>
            {t('pickup.admin.session.loadingMessage')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.sessionCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <View style={[styles.sessionHeader, isAr && styles.rtlRow]}>
        <View style={[styles.sessionIcon, { backgroundColor: surface }]}>
          {isOpen
            ? <CheckCircle2 size={20} color={color} strokeWidth={2.2} />
            : <Clock3 size={20} color={color} strokeWidth={2.2} />}
        </View>
        <View style={[styles.sessionTextBlock, isAr && styles.rtlBlock]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.sessionTitle,
              isAr && styles.rtlText,
              { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') },
            ]}
          >
            {title}
          </Text>
          <Text style={[
            styles.sessionMessage,
            isAr && styles.rtlText,
            { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') },
          ]}>
            {message}
          </Text>
        </View>
        <View style={[styles.sessionStatePill, { backgroundColor: surface }]}>
          <Text style={[
            styles.sessionStateText,
            isAr && styles.rtlText,
            { color, fontFamily: fontFor(theme, isAr, 'bold') },
          ]}>
            {isOpen ? t('pickup.admin.session.stateOpen') : t('pickup.admin.session.stateClosed')}
          </Text>
        </View>
      </View>

      {error ? (
        <View
          accessibilityRole="alert"
          style={[styles.sessionError, isAr && styles.rtlRow, { backgroundColor: theme.dangerSurface }]}
        >
          <AlertTriangle size={15} color={theme.danger} strokeWidth={2} />
          <Text selectable style={[
            styles.sessionErrorText,
            isAr && styles.rtlText,
            { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') },
          ]}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pickup.admin.session.refreshA11y')}
            disabled={updating}
            onPress={onRetry}
            hitSlop={8}
          >
            <RefreshCw size={16} color={theme.danger} strokeWidth={2.2} />
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isOpen
          ? t('pickup.admin.session.closeA11y')
          : t('pickup.admin.session.openA11y')}
        accessibilityState={{ disabled: updating, busy: updating }}
        disabled={updating}
        onPress={isOpen ? onClose : onOpen}
        style={({ pressed }) => [
          styles.sessionButton,
          isAr && styles.rtlRow,
          {
            backgroundColor: isOpen ? theme.dangerSurface : theme.primary,
            borderColor: isOpen ? theme.danger : theme.primary,
          },
          updating && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {updating ? (
          <ActivityIndicator color={isOpen ? theme.danger : '#fff'} size="small" />
        ) : (
          <>
            {isOpen
              ? <X size={17} color={theme.danger} strokeWidth={2.3} />
              : <Clock3 size={17} color="#fff" strokeWidth={2.3} />}
            <Text style={[
              styles.sessionButtonText,
              isAr && styles.rtlText,
              {
                color: isOpen ? theme.danger : '#fff',
                fontFamily: fontFor(theme, isAr, 'bold'),
              },
            ]}>
              {isOpen
                ? t('pickup.admin.session.closeButton')
                : t('pickup.admin.session.openButton')}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  )
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  theme,
  isAr,
}: {
  label: string
  value: number
  icon: LucideIcon
  theme: Theme
  isAr: boolean
}) {
  return (
    <View style={styles.summaryStat} accessibilityLabel={`${label} : ${value}`}>
      <Icon size={13} color="#FFFFFFD9" strokeWidth={2.1} />
      <Text style={[styles.summaryStatValue, { fontFamily: fontFor(theme, isAr, 'black') }]}>{value}</Text>
      <Text
        numberOfLines={1}
        style={[styles.summaryStatLabel, isAr && styles.rtlText, { fontFamily: fontFor(theme, isAr, 'semibold') }]}
      >
        {label}
      </Text>
    </View>
  )
}

function SectionHeader({ section, theme, isAr }: { section: QueueSection; theme: Theme; isAr: boolean }) {
  const Icon = section.icon
  return (
    <View style={[styles.sectionHeader, isAr && styles.rtlRow]}>
      <View style={[styles.sectionIcon, { backgroundColor: section.surface }]}>
        <Icon size={17} color={section.color} strokeWidth={2.2} />
      </View>
      <View style={[styles.sectionTitleBlock, isAr && styles.rtlBlock]}>
        <Text style={[
          styles.sectionTitle,
          isAr && styles.rtlText,
          { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') },
        ]}>
          {section.title}
        </Text>
        <Text numberOfLines={1} style={[
          styles.sectionSubtitle,
          isAr && styles.rtlText,
          { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') },
        ]}>
          {section.subtitle}
        </Text>
      </View>
      <View style={[styles.sectionCount, { backgroundColor: section.surface }]}>
        <Text style={[styles.sectionCountText, { color: section.color, fontFamily: fontFor(theme, isAr, 'black') }]}>{section.data.length}</Text>
      </View>
    </View>
  )
}

function QueueCard({
  request,
  section,
  theme,
  t,
  locale,
  isAr,
  updating,
  onAdvance,
}: {
  request: PickupRequest
  section: QueueSection
  theme: Theme
  t: TFunction
  locale: string
  isAr: boolean
  updating: boolean
  onAdvance: () => void
}) {
  const details = statusDetails(section.status, theme, t)
  const Icon = details.icon
  const name = studentName(request, t)
  const wait = waitingLabel(request.arrivedAt, t)

  return (
    <View style={[styles.queueCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <View style={[styles.queueCardTop, isAr && styles.rtlRow]}>
        <View style={[styles.studentAvatar, { backgroundColor: section.surface }]}>
          <Text style={[styles.studentInitial, { color: section.color, fontFamily: fontFor(theme, isAr, 'black') }]}>
            {name.slice(0, 1).toLocaleUpperCase(locale)}
          </Text>
        </View>
        <View style={[styles.studentBlock, isAr && styles.rtlBlock]}>
          <Text selectable numberOfLines={1} style={[
            styles.studentName,
            isAr && styles.rtlText,
            { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') },
          ]}>
            {name}
          </Text>
          <View style={[styles.studentMetaRow, isAr && styles.rtlRow]}>
            {request.classe ? (
              <Text selectable numberOfLines={1} style={[
                styles.studentClass,
                isAr && styles.rtlText,
                { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') },
              ]}>
                {request.classe}
              </Text>
            ) : null}
            <Text style={[
              styles.arrivalTime,
              isAr && styles.rtlText,
              { color: theme.textMuted, fontFamily: fontFor(theme, isAr, 'regular') },
            ]}>
              {arrivalLabel(request.arrivedAt, t, locale)}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, isAr && styles.rtlRow, { backgroundColor: section.surface }]}>
          <Icon size={13} color={section.color} strokeWidth={2.2} />
          <Text style={[
            styles.statusBadgeText,
            isAr && styles.rtlText,
            { color: section.color, fontFamily: fontFor(theme, isAr, 'bold') },
          ]}>
            {details.badge}
          </Text>
        </View>
      </View>

      {(request.vehicleDescription || wait) ? (
        <View style={[styles.detailsRow, { backgroundColor: theme.surface }]}>
          {request.vehicleDescription ? (
            <View style={[styles.detailItem, isAr && styles.rtlRow]}>
              <Car size={14} color={theme.primary} strokeWidth={2} />
              <Text selectable numberOfLines={1} style={[
                styles.detailText,
                isAr && styles.rtlText,
                { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') },
              ]}>
                {request.vehicleDescription}
              </Text>
            </View>
          ) : null}
          {wait ? (
            <View style={[styles.detailItem, isAr && styles.rtlRow]}>
              <Clock3 size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[
                styles.detailText,
                isAr && styles.rtlText,
                { color: theme.textMuted, fontFamily: fontFor(theme, isAr, 'medium') },
              ]}>
                {wait}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {details.action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${details.action} : ${name}`}
          accessibilityState={{ disabled: updating, busy: updating }}
          disabled={updating}
          onPress={onAdvance}
          style={({ pressed }) => [
            styles.actionButton,
            isAr && styles.rtlRow,
            { backgroundColor: section.color },
            updating && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {updating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={[
                styles.actionText,
                isAr && styles.rtlText,
                { fontFamily: fontFor(theme, isAr, 'bold') },
              ]}>
                {details.action}
              </Text>
              <ChevronRight
                size={17}
                color="#fff"
                strokeWidth={2.4}
                style={isAr ? styles.chevronRtl : undefined}
              />
            </>
          )}
        </Pressable>
      ) : (
        <View style={[styles.completedRow, isAr && styles.rtlRow]}>
          <CheckCircle2 size={16} color={theme.success} strokeWidth={2.2} />
          <Text style={[
            styles.completedText,
            isAr && styles.rtlText,
            { color: theme.success, fontFamily: fontFor(theme, isAr, 'semibold') },
          ]}>
            {t('pickup.admin.handoffConfirmed')}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 40 },
  summaryCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 14,
  },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryTitleBlock: { flex: 1 },
  summaryEyebrow: { color: '#FFFFFFB8', fontSize: 10, letterSpacing: 1.1 },
  summaryTitle: { color: '#fff', fontSize: 21, lineHeight: 27, marginTop: 2 },
  summarySubtitle: { color: '#FFFFFFD9', fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  activeCountBubble: { width: 69, height: 69, borderRadius: 23, backgroundColor: '#FFFFFF1F', alignItems: 'center', justifyContent: 'center' },
  activeCount: { color: '#fff', fontSize: 23, lineHeight: 27, fontVariant: ['tabular-nums'] },
  activeCountLabel: { color: '#FFFFFFCC', fontSize: 9.5 },
  summaryStats: { flexDirection: 'row', marginTop: 17, gap: 7 },
  summaryStat: { flex: 1, minWidth: 0, alignItems: 'center', backgroundColor: '#FFFFFF12', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 3 },
  summaryStatValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  summaryStatLabel: { color: '#FFFFFFC9', fontSize: 8.5, marginTop: 1 },
  sessionCard: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 14, gap: 11, flexDirection: 'column' },
  sessionLoadingCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sessionTextBlock: { flex: 1 },
  sessionTitle: { fontSize: 13.5 },
  sessionMessage: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sessionStatePill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  sessionStateText: { fontSize: 8.5, letterSpacing: 0.6 },
  sessionError: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, padding: 9, gap: 7 },
  sessionErrorText: { flex: 1, fontSize: 10.5, lineHeight: 14 },
  sessionButton: { minHeight: 44, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13 },
  sessionButtonText: { fontSize: 12.5 },
  errorBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 11, gap: 8, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17 },
  retryButton: { minHeight: 38, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 5 },
  retryText: { fontSize: 11.5 },
  queueHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, marginBottom: 17 },
  queueTitle: { fontSize: 18 },
  queueSubtitle: { fontSize: 11.5, marginTop: 2 },
  totalPill: { minHeight: 35, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 6 },
  totalText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  loading: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
  emptyCard: { borderRadius: 24, padding: 12, marginTop: 4 },
  emptyStateWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyStateIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyStateTitle: { fontSize: 14, marginTop: 10, textAlign: 'center' },
  emptyStateMessage: { maxWidth: 260, fontSize: 12, lineHeight: 17, marginTop: 4, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 9, gap: 9 },
  sectionIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitleBlock: { flex: 1 },
  sectionTitle: { fontSize: 14.5 },
  sectionSubtitle: { fontSize: 10.5, marginTop: 1 },
  sectionCount: { minWidth: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  sectionCountText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  queueCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 14, marginBottom: 10, gap: 11 },
  queueCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  studentAvatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  studentInitial: { fontSize: 16 },
  studentBlock: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 14.5 },
  studentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  studentClass: { maxWidth: 92, fontSize: 10.5 },
  arrivalTime: { fontSize: 10, flexShrink: 1 },
  statusBadge: { minHeight: 29, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  statusBadgeText: { fontSize: 9.5 },
  detailsRow: { borderRadius: 12, padding: 9, gap: 7 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailText: { flex: 1, fontSize: 11.5 },
  actionButton: { minHeight: 45, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, gap: 7 },
  actionText: { color: '#fff', fontSize: 13.5 },
  completedRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  completedText: { fontSize: 12 },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  arabicEyebrow: { letterSpacing: 0 },
  chevronRtl: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.55 },
})
