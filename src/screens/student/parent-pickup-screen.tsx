import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  BusFront,
  Car,
  CheckCircle2,
  Clock3,
  Megaphone,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { Card, EmptyState } from '../../components/dashboard'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useParentData } from '../../hooks/useParentData'
import {
  announcePickupArrival,
  cancelPickupArrival,
  pickupSessionIsCurrentlyOpen,
  subscribeParentPickupRequests,
  subscribeTodayParentTransport,
  subscribeTodayPickupSession,
} from '../../services/pickup-service'
import type {
  PickupRequest,
  PickupSession,
  PickupStatus,
  TransportPassenger,
  TransportPassengerStatus,
} from '../../types/pickup'

const STATUS_ORDER: Exclude<PickupStatus, 'cancelled'>[] = [
  'waiting',
  'called',
  'ready',
  'completed',
]

interface StatusCopy {
  title: string
  message: string
  shortLabel: string
  icon: LucideIcon
  color: string
  surface: string
}

type LatinFontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'black'

function fontFor(theme: Theme, isAr: boolean, weight: LatinFontWeight): string {
  if (!isAr) return theme.fonts[weight]
  if (weight === 'regular') return theme.fonts.arabic
  if (weight === 'medium' || weight === 'semibold') return theme.fonts.arabicSemi
  return theme.fonts.arabicBold
}

function statusCopy(status: PickupStatus, theme: Theme, t: TFunction): StatusCopy {
  const visual: Record<PickupStatus, Pick<StatusCopy, 'icon' | 'color' | 'surface'>> = {
    waiting: {
      icon: Clock3,
      color: theme.warning,
      surface: theme.warningSurface,
    },
    called: {
      icon: Megaphone,
      color: theme.info,
      surface: theme.infoSurface,
    },
    ready: {
      icon: UserCheck,
      color: theme.success,
      surface: theme.successSurface,
    },
    completed: {
      icon: CheckCircle2,
      color: theme.success,
      surface: theme.successSurface,
    },
    cancelled: {
      icon: X,
      color: theme.danger,
      surface: theme.dangerSurface,
    },
  }
  return {
    ...visual[status],
    title: t(`pickup.parent.status.${status}.title`),
    message: t(`pickup.parent.status.${status}.message`),
    shortLabel: t(`pickup.parent.status.${status}.shortLabel`),
  }
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime() || 0
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const date = toDate.call(value)
      return date instanceof Date ? date.getTime() : 0
    }
  }
  return 0
}

function latestRequestForChild(
  requests: PickupRequest[],
  eleveId: string,
): PickupRequest | undefined {
  return requests
    .filter(request => request.eleveId === eleveId && request.status !== 'cancelled')
    .sort((a, b) => toMillis(b.arrivedAt) - toMillis(a.arrivedAt))[0]
}

function transportStatusCopy(status: TransportPassengerStatus, theme: Theme, t: TFunction) {
  const visual: Record<TransportPassengerStatus, { color: string; surface: string }> = {
    scheduled: { color: theme.info, surface: theme.infoSurface },
    boarded: { color: theme.primary, surface: theme.primarySurface },
    dropped_off: { color: theme.success, surface: theme.successSurface },
    absent: { color: theme.warning, surface: theme.warningSurface },
    cancelled: { color: theme.danger, surface: theme.dangerSurface },
  }
  const statusKey = status === 'dropped_off' ? 'droppedOff' : status
  return { ...visual[status], label: t(`pickup.parent.transport.status.${statusKey}`) }
}

function transportDirectionLabel(direction: TransportPassenger['direction'], t: TFunction): string {
  return direction === 'to_school'
    ? t('pickup.parent.transport.direction.toSchool')
    : t('pickup.parent.transport.direction.fromSchool')
}

export default function ParentPickupScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')
  const { profile } = useAuth()
  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [vehicleDescription, setVehicleDescription] = useState('')
  const [requests, setRequests] = useState<PickupRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null)
  const [pickupSession, setPickupSession] = useState<PickupSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [sessionSubscriptionKey, setSessionSubscriptionKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [transportPassengers, setTransportPassengers] = useState<TransportPassenger[]>([])
  const [transportLoading, setTransportLoading] = useState(true)
  const [transportError, setTransportError] = useState(false)
  const [transportSubscriptionKey, setTransportSubscriptionKey] = useState(0)
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const childIdsKey = parent.children.map(child => child.id).sort().join('|')
  const childIds = useMemo(
    () => childIdsKey ? childIdsKey.split('|') : [],
    [childIdsKey],
  )

  useEffect(() => {
    if (parent.children.length === 0) {
      setSelectedChildId('')
      return
    }
    if (!parent.children.some(child => child.id === selectedChildId)) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  useEffect(() => {
    if (!profile?.uid) {
      setRequests([])
      setRequestsLoading(false)
      return
    }

    setRequestsLoading(true)
    setLoadErrorKey(null)
    return subscribeParentPickupRequests(
      profile.uid,
      childIds,
      (nextRequests: PickupRequest[]) => {
        setRequests(nextRequests)
        setRequestsLoading(false)
        setLoadErrorKey(null)
      },
      () => {
        setLoadErrorKey('pickup.parent.errors.requestsLoad')
        setRequestsLoading(false)
      },
    )
  }, [profile?.uid, childIds])

  useEffect(() => {
    setSessionLoading(true)
    setSessionError(false)
    return subscribeTodayPickupSession(
      session => {
        setPickupSession(session)
        setSessionLoading(false)
        setSessionError(false)
        setNow(Date.now())
      },
      () => {
        setSessionLoading(false)
        setSessionError(true)
      },
    )
  }, [sessionSubscriptionKey])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setTransportPassengers([])
    setTransportLoading(true)
    setTransportError(false)
    return subscribeTodayParentTransport(
      childIds,
      passengers => {
        setTransportPassengers(passengers)
        setTransportLoading(false)
        setTransportError(false)
      },
      () => {
        setTransportPassengers([])
        setTransportLoading(false)
        setTransportError(true)
      },
    )
  }, [childIds, transportSubscriptionKey])

  const selectedChild = useMemo(
    () => parent.children.find(child => child.id === selectedChildId),
    [parent.children, selectedChildId],
  )
  const selectedRequest = useMemo(
    () => latestRequestForChild(requests, selectedChildId),
    [requests, selectedChildId],
  )
  const requestIsActive = selectedRequest
    ? selectedRequest.status !== 'completed' && selectedRequest.status !== 'cancelled'
    : false
  const sessionIsOpen = pickupSessionIsCurrentlyOpen(pickupSession, now)
  const authorizedTransportPassengers = useMemo(() => {
    const allowedChildren = new Set(childIds)
    return transportPassengers.filter(passenger => allowedChildren.has(passenger.eleveId))
  }, [childIds, transportPassengers])

  const announceArrival = async () => {
    if (!profile?.uid || !selectedChild || !sessionIsOpen || requestIsActive || submitting) return
    setSubmitting(true)
    setActionErrorKey(null)
    try {
      await announcePickupArrival({
        parentUid: profile.uid,
        eleveId: selectedChild.id,
        vehicleDescription: vehicleDescription.trim() || undefined,
      })
    } catch {
      setActionErrorKey('pickup.parent.errors.announce')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmCancellation = () => {
    if (!selectedRequest || selectedRequest.status !== 'waiting' || submitting) return
    Alert.alert(
      t('pickup.parent.cancelDialog.title'),
      t('pickup.parent.cancelDialog.message'),
      [
        { text: t('pickup.parent.cancelDialog.keep'), style: 'cancel' },
        {
          text: t('pickup.parent.cancelDialog.confirm'),
          style: 'destructive',
          onPress: () => {
            setSubmitting(true)
            setActionErrorKey(null)
            cancelPickupArrival(selectedRequest.id)
              .catch(() => setActionErrorKey('pickup.parent.errors.cancel'))
              .finally(() => setSubmitting(false))
          },
        },
      ],
    )
  }

  const initialLoading = parent.loading || requestsLoading

  return (
    <ScreenLayout title={t('pickup.screenTitle')}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.hero,
            isAr && styles.rtlRow,
            { backgroundColor: theme.primaryDark, borderColor: theme.primaryBorder },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.heroIcon}>
            <Car size={25} color="#fff" strokeWidth={2} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroEyebrow, isAr && styles.rtlText, { fontFamily: fontFor(theme, isAr, 'semibold'), letterSpacing: isAr ? 0 : 1.1 }]}>{t('pickup.parent.hero.eyebrow')}</Text>
            <Text style={[styles.heroTitle, isAr && styles.rtlText, { fontFamily: fontFor(theme, isAr, 'black') }]}>{t('pickup.parent.hero.title')}</Text>
            <Text style={[styles.heroSubtitle, isAr && styles.rtlText, { fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.hero.subtitle')}</Text>
          </View>
        </View>

        <ParentSessionStatus
          session={pickupSession}
          loading={sessionLoading}
          error={sessionError}
          now={now}
          theme={theme}
          onRetry={() => setSessionSubscriptionKey(key => key + 1)}
        />

        {(parent.error || loadErrorKey) ? (
          <View
            accessibilityRole="alert"
            style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
          >
            <Text selectable style={[styles.errorText, isAr && styles.rtlText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') }]}>
              {loadErrorKey ? t(loadErrorKey) : t('pickup.parent.errors.childrenLoad')}
            </Text>
          </View>
        ) : null}

        {initialLoading ? (
          <View style={styles.loading} accessibilityLabel={t('pickup.parent.a11y.loading')}>
            <ActivityIndicator color={theme.primary} size="large" />
            <Text style={[styles.loadingText, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') }]}>{t('common.loading')}</Text>
          </View>
        ) : parent.children.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title={t('parent.noChildren')}
              message={t('pickup.parent.children.emptyMessage')}
            />
          </Card>
        ) : (
          <>
            <View style={[styles.sectionHeading, isAr && styles.rtlBlock]}>
              <Text style={[styles.sectionTitle, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.children.title')}</Text>
              <Text style={[styles.sectionHint, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.children.hint')}</Text>
            </View>

            <ScrollView
              horizontal
              contentInsetAdjustmentBehavior="automatic"
              showsHorizontalScrollIndicator={false}
              style={styles.childScroller}
              contentContainerStyle={[styles.childChips, isAr && styles.rtlRow]}
            >
              {parent.children.map(child => {
                const selected = child.id === selectedChildId
                return (
                  <Pressable
                    key={child.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${child.firstName}, ${child.classe}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedChildId(child.id)
                      setActionErrorKey(null)
                    }}
                    style={({ pressed }) => [
                      styles.childChip,
                      isAr && styles.rtlRow,
                      {
                        backgroundColor: selected ? theme.primary : theme.card,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: selected ? '#FFFFFF22' : child.avatarColor }]}>
                      <Text style={[styles.avatarText, { color: '#fff', fontFamily: fontFor(theme, isAr, 'bold') }]}>
                        {child.firstName.slice(0, 1).toLocaleUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text numberOfLines={1} style={[styles.childName, isAr && styles.rtlText, { color: selected ? '#fff' : theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>
                        {child.firstName}
                      </Text>
                      <Text numberOfLines={1} style={[styles.childClass, isAr && styles.rtlText, { color: selected ? '#FFFFFFCC' : theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') }]}>
                        {child.classe}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </ScrollView>

            {selectedRequest ? (
              <PickupStatusCard request={selectedRequest} theme={theme} />
            ) : (
              <Card style={styles.arrivalCard}>
                <View style={[styles.cardTitleRow, isAr && styles.rtlRow]}>
                  <View style={[styles.smallIcon, { backgroundColor: theme.primarySurface }]}>
                    <Car size={18} color={theme.primary} strokeWidth={2.1} />
                  </View>
                  <View style={styles.cardTitleText}>
                    <Text style={[styles.cardTitle, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.vehicle.title')}</Text>
                    <Text style={[styles.cardSubtitle, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.vehicle.subtitle')}</Text>
                  </View>
                </View>
                <TextInput
                  accessibilityLabel={t('pickup.parent.vehicle.a11yLabel')}
                  value={vehicleDescription}
                  onChangeText={setVehicleDescription}
                  maxLength={80}
                  placeholder={t('pickup.parent.vehicle.placeholder')}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  style={[
                    styles.input,
                    isAr && styles.rtlInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: theme.borderStrong,
                      fontFamily: fontFor(theme, isAr, 'regular'),
                    },
                  ]}
                />
                <View style={[styles.privacyRow, isAr && styles.rtlRow]}>
                  <ShieldCheck size={14} color={theme.success} strokeWidth={2} />
                  <Text style={[styles.privacyText, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.vehicle.privacyHint')}</Text>
                </View>
              </Card>
            )}

            {actionErrorKey ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
              >
                <Text selectable style={[styles.errorText, isAr && styles.rtlText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') }]}>{t(actionErrorKey)}</Text>
              </View>
            ) : null}

            {!selectedRequest ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sessionIsOpen
                  ? t('pickup.parent.arrival.a11yLabel', {
                    name: selectedChild?.firstName || t('pickup.parent.children.fallback'),
                  })
                  : t('pickup.parent.session.closedTitle')}
                accessibilityHint={sessionIsOpen
                  ? t('pickup.parent.arrival.a11yHint')
                  : t('pickup.parent.arrival.closedHint')}
                accessibilityState={{ disabled: submitting || !sessionIsOpen, busy: submitting || sessionLoading }}
                disabled={submitting || !selectedChild || !sessionIsOpen}
                onPress={announceArrival}
                style={({ pressed }) => [
                  styles.primaryButton,
                  isAr && styles.rtlRow,
                  { backgroundColor: sessionIsOpen ? theme.accent : theme.borderStrong },
                  (submitting || !selectedChild || !sessionIsOpen) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Car size={21} color="#fff" strokeWidth={2.4} />}
                <Text style={[styles.primaryButtonText, isAr && styles.rtlText, { fontFamily: fontFor(theme, isAr, 'bold') }]}>
                  {sessionLoading
                    ? t('pickup.parent.session.checking')
                    : sessionIsOpen
                      ? t('pickup.arrivalCta')
                      : t('pickup.parent.arrival.closedCta')}
                </Text>
              </Pressable>
            ) : selectedRequest.status === 'waiting' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pickup.parent.arrival.cancelCta')}
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={confirmCancellation}
                style={({ pressed }) => [
                  styles.cancelButton,
                  isAr && styles.rtlRow,
                  { backgroundColor: theme.card, borderColor: theme.danger },
                  submitting && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {submitting ? <ActivityIndicator color={theme.danger} /> : <X size={18} color={theme.danger} strokeWidth={2.4} />}
                <Text style={[styles.cancelButtonText, isAr && styles.rtlText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.arrival.cancelCta')}</Text>
              </Pressable>
            ) : null}

            <ParentTransportSection
              children={parent.children}
              passengers={authorizedTransportPassengers}
              loading={transportLoading}
              error={transportError}
              theme={theme}
              onRetry={() => setTransportSubscriptionKey(key => key + 1)}
            />
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function ParentTransportSection({
  children,
  passengers,
  loading,
  error,
  theme,
  onRetry,
}: {
  children: ReturnType<typeof useParentData>['children']
  passengers: TransportPassenger[]
  loading: boolean
  error: boolean
  theme: Theme
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')

  return (
    <View style={styles.transportSection}>
      <View style={[styles.sectionHeading, isAr && styles.rtlBlock]}>
        <Text style={[styles.sectionTitle, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.transport.title')}</Text>
        <Text style={[styles.sectionHint, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.transport.hint')}</Text>
      </View>

      {loading ? (
        <Card style={styles.transportStateCard}>
          <View style={[styles.transportLoadingRow, isAr && styles.rtlRow]}>
            <ActivityIndicator color={theme.primary} size="small" />
            <Text style={[styles.transportStateText, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') }]}>{t('pickup.parent.transport.loading')}</Text>
          </View>
        </Card>
      ) : error ? (
        <View accessibilityRole="alert" style={[styles.transportError, isAr && styles.rtlRow, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
          <X size={18} color={theme.danger} strokeWidth={2.2} />
          <Text selectable style={[styles.transportErrorText, isAr && styles.rtlText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'semibold') }]}>{t('pickup.parent.transport.loadError')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pickup.parent.transport.retryA11y')}
            onPress={onRetry}
            hitSlop={8}
            style={({ pressed }) => [styles.sessionRetry, pressed && styles.pressed]}
          >
            <RefreshCw size={17} color={theme.danger} strokeWidth={2.2} />
          </Pressable>
        </View>
      ) : passengers.length === 0 ? (
        <Card style={styles.transportStateCard}>
          <EmptyState
            icon={BusFront}
            title={t('pickup.parent.transport.emptyTitle')}
            message={t('pickup.parent.transport.emptyMessage')}
          />
        </Card>
      ) : (
        children.map(child => {
          const childPassengers = passengers.filter(passenger => passenger.eleveId === child.id)
          const fullName = [child.firstName, child.lastName].filter(Boolean).join(' ').trim()
            || t('pickup.parent.transport.childFallback')
          return (
            <Card key={child.id} style={styles.transportChildCard}>
              <View style={[styles.transportChildHeader, isAr && styles.rtlRow]}>
                <View style={[styles.transportChildIcon, { backgroundColor: theme.primarySurface }]}>
                  <BusFront size={18} color={theme.primary} strokeWidth={2.1} />
                </View>
                <Text selectable numberOfLines={1} style={[styles.transportChildName, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>{fullName}</Text>
              </View>

              {childPassengers.length === 0 ? (
                <Text style={[styles.transportNoTrip, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.transport.noTripForChild')}</Text>
              ) : childPassengers.map((passenger, index) => (
                <TransportTripRow
                  key={`${passenger.tripId}:${passenger.id}`}
                  passenger={passenger}
                  isLast={index === childPassengers.length - 1}
                  theme={theme}
                />
              ))}
            </Card>
          )
        })
      )}
    </View>
  )
}

function TransportTripRow({
  passenger,
  isLast,
  theme,
}: {
  passenger: TransportPassenger
  isLast: boolean
  theme: Theme
}) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')
  const status = transportStatusCopy(passenger.status, theme, t)
  const direction = transportDirectionLabel(passenger.direction, t)
  const circuit = passenger.stopLabel
    ? `${passenger.routeLabel} · ${passenger.stopLabel}`
    : passenger.routeLabel
  const delayMinutes = typeof passenger.delayMinutes === 'number'
    && Number.isFinite(passenger.delayMinutes)
    && passenger.delayMinutes > 0
    ? Math.round(passenger.delayMinutes)
    : 0
  const delayAccessibility = delayMinutes > 0
    ? t('pickup.parent.transport.delayA11y', { count: delayMinutes })
    : ''
  const separator = isAr ? '، ' : ', '
  const accessibilityParts = [
    direction,
    passenger.scheduledTime,
    circuit,
    passenger.vehicleLabel,
    `${status.label}${delayAccessibility ? `${separator}${delayAccessibility}` : ''}`,
  ]

  return (
    <View
      accessible
      accessibilityLabel={accessibilityParts.join(separator)}
      style={[
        styles.transportTrip,
        !isLast && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.transportTripTop, isAr && styles.rtlRow]}>
        <View style={[styles.directionPill, { backgroundColor: theme.surface }]}>
          <Text style={[styles.directionText, isAr && styles.rtlText, { color: theme.primary, fontFamily: fontFor(theme, isAr, 'semibold') }]}>{direction}</Text>
        </View>
        <View style={[styles.transportStatusPill, { backgroundColor: status.surface }]}>
          <Text style={[styles.transportStatusText, isAr && styles.rtlText, { color: status.color, fontFamily: fontFor(theme, isAr, 'bold') }]}>{status.label}</Text>
        </View>
      </View>
      {delayMinutes > 0 ? (
        <View style={[styles.transportDelayAlert, isAr && styles.rtlRow, { backgroundColor: theme.warningSurface }]}>
          <AlertTriangle size={14} color={theme.warning} strokeWidth={2.2} />
          <Text selectable style={[styles.transportDelayText, isAr && styles.rtlText, { color: theme.warning, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.transport.delay', { count: delayMinutes })}</Text>
        </View>
      ) : null}
      <View style={[styles.transportMetaRow, isAr && styles.rtlRow]}>
        <Clock3 size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable style={[styles.transportTime, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'bold') }]}>{passenger.scheduledTime}</Text>
        <MapPin size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable numberOfLines={1} style={[styles.transportMetaText, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') }]}>{circuit}</Text>
      </View>
      <View style={[styles.transportMetaRow, isAr && styles.rtlRow]}>
        <BusFront size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable numberOfLines={1} style={[styles.transportMetaText, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'medium') }]}>{passenger.vehicleLabel}</Text>
      </View>
    </View>
  )
}

function ParentSessionStatus({
  session,
  loading,
  error,
  now,
  theme,
  onRetry,
}: {
  session: PickupSession | null
  loading: boolean
  error: boolean
  now: number
  theme: Theme
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const isAr = language.startsWith('ar')

  if (loading) {
    return (
      <View style={[styles.sessionBanner, isAr && styles.rtlRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary} size="small" />
        <View style={styles.sessionTextBlock}>
          <Text style={[styles.sessionTitle, isAr && styles.rtlText, { color: theme.text, fontFamily: fontFor(theme, isAr, 'semibold') }]}>{t('pickup.parent.session.checking')}</Text>
          <Text style={[styles.sessionMessage, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.session.connecting')}</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View accessibilityRole="alert" style={[styles.sessionBanner, isAr && styles.rtlRow, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
        <X size={19} color={theme.danger} strokeWidth={2.2} />
        <View style={styles.sessionTextBlock}>
          <Text style={[styles.sessionTitle, isAr && styles.rtlText, { color: theme.danger, fontFamily: fontFor(theme, isAr, 'bold') }]}>{t('pickup.parent.session.unavailableTitle')}</Text>
          <Text style={[styles.sessionMessage, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{t('pickup.parent.session.unavailableMessage')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pickup.parent.session.retryA11y')}
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [styles.sessionRetry, pressed && styles.pressed]}
        >
          <RefreshCw size={17} color={theme.danger} strokeWidth={2.2} />
        </Pressable>
      </View>
    )
  }

  const open = pickupSessionIsCurrentlyOpen(session, now)
  const closesAt = toMillis(session?.closesAt)
  const timeLocale = isAr ? 'ar-MA' : language.startsWith('en') ? 'en-US' : 'fr-FR'
  const closeTime = closesAt
    ? new Date(closesAt).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })
    : null
  const expired = Boolean(session?.isOpen && closesAt && closesAt < now)
  const title = open
    ? t('pickup.parent.session.openTitle')
    : expired
      ? t('pickup.parent.session.expiredTitle')
      : t('pickup.parent.session.closedTitle')
  const message = open && closeTime
    ? t('pickup.parent.session.openMessage', { time: closeTime })
    : expired
      ? t('pickup.parent.session.expiredMessage')
      : t('pickup.parent.session.closedMessage')
  const color = open ? theme.success : theme.warning
  const surface = open ? theme.successSurface : theme.warningSurface

  return (
    <View accessibilityLiveRegion="polite" style={[styles.sessionBanner, isAr && styles.rtlRow, { backgroundColor: surface, borderColor: color }]}>
      {open
        ? <CheckCircle2 size={20} color={color} strokeWidth={2.2} />
        : <Clock3 size={20} color={color} strokeWidth={2.2} />}
      <View style={styles.sessionTextBlock}>
        <Text style={[styles.sessionTitle, isAr && styles.rtlText, { color, fontFamily: fontFor(theme, isAr, 'bold') }]}>{title}</Text>
        <Text style={[styles.sessionMessage, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>{message}</Text>
      </View>
    </View>
  )
}

function PickupStatusCard({ request, theme }: { request: PickupRequest; theme: Theme }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')
  const current = statusCopy(request.status, theme, t)
  const CurrentIcon = current.icon
  const currentIndex = request.status === 'cancelled' ? -1 : STATUS_ORDER.indexOf(request.status)

  return (
    <Card style={styles.statusCard}>
      <View style={[styles.currentStatus, isAr && styles.rtlRow, { backgroundColor: current.surface }]}>
        <View style={[styles.statusIcon, { backgroundColor: current.color }]}>
          <CurrentIcon size={22} color="#fff" strokeWidth={2.2} />
        </View>
        <View style={styles.currentStatusText}>
          <Text accessibilityLiveRegion="polite" style={[styles.statusTitle, isAr && styles.rtlText, { color: current.color, fontFamily: fontFor(theme, isAr, 'bold') }]}>
            {current.title}
          </Text>
          <Text style={[styles.statusMessage, isAr && styles.rtlText, { color: theme.textSoft, fontFamily: fontFor(theme, isAr, 'regular') }]}>
            {current.message}
          </Text>
        </View>
      </View>

      {request.status !== 'cancelled' ? (
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: currentIndex + 1 }} style={[styles.timeline, isAr && styles.rtlRow]}>
          {STATUS_ORDER.map((status, index) => {
            const reached = index <= currentIndex
            const meta = statusCopy(status, theme, t)
            return (
              <React.Fragment key={status}>
                <View style={styles.timelineStep}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: reached ? meta.color : theme.surfaceAlt,
                        borderColor: reached ? meta.color : theme.borderStrong,
                      },
                    ]}
                  >
                    {reached ? <CheckCircle2 size={13} color="#fff" strokeWidth={2.8} /> : null}
                  </View>
                  <Text style={[styles.timelineLabel, { color: reached ? theme.text : theme.textMuted, fontFamily: fontFor(theme, isAr, 'medium') }]}>
                    {meta.shortLabel}
                  </Text>
                </View>
                {index < STATUS_ORDER.length - 1 ? (
                  <View style={[styles.timelineLine, { backgroundColor: index < currentIndex ? theme.success : theme.border }]} />
                ) : null}
              </React.Fragment>
            )
          })}
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  rtlRow: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput: { textAlign: 'right', writingDirection: 'rtl' },
  scrollContent: { paddingBottom: 40, gap: 16 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: '#FFFFFF1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroEyebrow: { color: '#FFFFFFB8', fontSize: 10, letterSpacing: 1.1 },
  heroTitle: { color: '#fff', fontSize: 19, lineHeight: 24, marginTop: 2 },
  heroSubtitle: { color: '#FFFFFFD9', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  sessionBanner: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 17, padding: 13, gap: 10 },
  sessionTextBlock: { flex: 1 },
  sessionTitle: { fontSize: 13.5 },
  sessionMessage: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  sessionRetry: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  transportSection: { gap: 10, marginTop: 8 },
  transportStateCard: { paddingVertical: 8 },
  transportLoadingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  transportStateText: { fontSize: 12.5 },
  transportError: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 15, padding: 11, gap: 8 },
  transportErrorText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  transportChildCard: { gap: 4 },
  transportChildHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 5 },
  transportChildIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  transportChildName: { flex: 1, fontSize: 14 },
  transportNoTrip: { fontSize: 11.5, lineHeight: 17, paddingTop: 6 },
  transportTrip: { paddingVertical: 10, gap: 7 },
  transportTripTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  directionPill: { minHeight: 27, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 9 },
  directionText: { fontSize: 10.5 },
  transportStatusPill: { minHeight: 27, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 9 },
  transportStatusText: { fontSize: 9.5 },
  transportDelayAlert: { minHeight: 30, flexDirection: 'row', alignItems: 'center', borderRadius: 9, paddingHorizontal: 9, gap: 6 },
  transportDelayText: { fontSize: 10.5 },
  transportMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transportTime: { fontSize: 11.5, marginEnd: 4 },
  transportMetaText: { flex: 1, fontSize: 11, minWidth: 0 },
  errorBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  errorText: { fontSize: 12.5, lineHeight: 18 },
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
  sectionHeading: { gap: 2 },
  sectionTitle: { fontSize: 17 },
  sectionHint: { fontSize: 12.5 },
  childScroller: { flexGrow: 0, flexShrink: 0, marginHorizontal: -20 },
  childChips: { paddingHorizontal: 20, gap: 10 },
  childChip: {
    minHeight: 58,
    minWidth: 142,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 9,
  },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15 },
  childName: { fontSize: 13.5, maxWidth: 112 },
  childClass: { fontSize: 10.5, marginTop: 1, maxWidth: 112 },
  arrivalCard: { gap: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  smallIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitleText: { flex: 1 },
  cardTitle: { fontSize: 14.5 },
  cardSubtitle: { fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  input: { height: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  privacyText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
  statusCard: { gap: 17 },
  currentStatus: { flexDirection: 'row', borderRadius: 17, padding: 14, gap: 12 },
  statusIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  currentStatusText: { flex: 1 },
  statusTitle: { fontSize: 15.5, lineHeight: 20 },
  statusMessage: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  timeline: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 2 },
  timelineStep: { width: 50, alignItems: 'center' },
  timelineDot: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 9.5, marginTop: 5, textAlign: 'center' },
  timelineLine: { flex: 1, height: 2, marginTop: 12 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: '#fff', fontSize: 16 },
  cancelButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  cancelButtonText: { fontSize: 14 },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.55 },
})
