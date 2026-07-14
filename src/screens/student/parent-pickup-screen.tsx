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

function statusCopy(status: PickupStatus, theme: Theme): StatusCopy {
  const copy: Record<PickupStatus, StatusCopy> = {
    waiting: {
      title: 'Arrivée signalée',
      message: 'L’école a reçu votre signal. Votre enfant sera appelé à son tour.',
      shortLabel: 'Arrivé',
      icon: Clock3,
      color: theme.warning,
      surface: theme.warningSurface,
    },
    called: {
      title: 'Votre enfant est appelé',
      message: 'L’équipe prépare votre enfant pour la sortie.',
      shortLabel: 'Appelé',
      icon: Megaphone,
      color: theme.info,
      surface: theme.infoSurface,
    },
    ready: {
      title: 'Prêt à sortir',
      message: 'Votre enfant est prêt. Restez dans la zone de remise prévue.',
      shortLabel: 'Prêt',
      icon: UserCheck,
      color: theme.success,
      surface: theme.successSurface,
    },
    completed: {
      title: 'Sortie terminée',
      message: 'La remise de votre enfant a été confirmée par l’école.',
      shortLabel: 'Terminé',
      icon: CheckCircle2,
      color: theme.success,
      surface: theme.successSurface,
    },
    cancelled: {
      title: 'Signal annulé',
      message: 'Vous pouvez signaler une nouvelle arrivée si nécessaire.',
      shortLabel: 'Annulé',
      icon: X,
      color: theme.danger,
      surface: theme.dangerSurface,
    },
  }
  return copy[status]
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

function transportStatusCopy(status: TransportPassengerStatus, theme: Theme) {
  const copy: Record<TransportPassengerStatus, { label: string; color: string; surface: string }> = {
    scheduled: { label: 'Planifié', color: theme.info, surface: theme.infoSurface },
    boarded: { label: 'À bord', color: theme.primary, surface: theme.primarySurface },
    dropped_off: { label: 'Déposé', color: theme.success, surface: theme.successSurface },
    absent: { label: 'Absent', color: theme.warning, surface: theme.warningSurface },
    cancelled: { label: 'Annulé', color: theme.danger, surface: theme.dangerSurface },
  }
  return copy[status]
}

function transportDirectionLabel(direction: TransportPassenger['direction']): string {
  return direction === 'to_school' ? 'Vers l’école' : 'Retour de l’école'
}

export default function ParentPickupScreen() {
  const theme = useTheme()
  const { profile } = useAuth()
  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [vehicleDescription, setVehicleDescription] = useState('')
  const [requests, setRequests] = useState<PickupRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickupSession, setPickupSession] = useState<PickupSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [sessionSubscriptionKey, setSessionSubscriptionKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [transportPassengers, setTransportPassengers] = useState<TransportPassenger[]>([])
  const [transportLoading, setTransportLoading] = useState(true)
  const [transportError, setTransportError] = useState(false)
  const [transportSubscriptionKey, setTransportSubscriptionKey] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
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
    setLoadError(null)
    return subscribeParentPickupRequests(
      profile.uid,
      childIds,
      (nextRequests: PickupRequest[]) => {
        setRequests(nextRequests)
        setRequestsLoading(false)
        setLoadError(null)
      },
      () => {
        setLoadError('Impossible de suivre la sortie scolaire.')
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
    setActionError(null)
    try {
      await announcePickupArrival({
        parentUid: profile.uid,
        eleveId: selectedChild.id,
        vehicleDescription: vehicleDescription.trim() || undefined,
      })
    } catch {
      setActionError('Votre arrivée n’a pas pu être signalée. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmCancellation = () => {
    if (!selectedRequest || selectedRequest.status !== 'waiting' || submitting) return
    Alert.alert(
      'Annuler mon arrivée ?',
      'L’élève sera retiré de la file d’attente.',
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler l’arrivée',
          style: 'destructive',
          onPress: () => {
            setSubmitting(true)
            setActionError(null)
            cancelPickupArrival(selectedRequest.id)
              .catch(() => setActionError('L’annulation a échoué. Réessayez.'))
              .finally(() => setSubmitting(false))
          },
        },
      ],
    )
  }

  const initialLoading = parent.loading || requestsLoading

  return (
    <ScreenLayout title="Sortie scolaire">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.primaryDark, borderColor: theme.primaryBorder },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.heroIcon}>
            <Car size={25} color="#fff" strokeWidth={2} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroEyebrow, { fontFamily: theme.fonts.semibold }]}>SMART PICKUP</Text>
            <Text style={[styles.heroTitle, { fontFamily: theme.fonts.black }]}>Une sortie plus fluide</Text>
            <Text style={[styles.heroSubtitle, { fontFamily: theme.fonts.regular }]}>Signalez votre arrivée sans quitter votre véhicule.</Text>
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

        {(parent.error || loadError) ? (
          <View
            accessibilityRole="alert"
            style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
          >
            <Text selectable style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>
              {loadError || 'Impossible de charger les enfants associés à ce compte.'}
            </Text>
          </View>
        ) : null}

        {initialLoading ? (
          <View style={styles.loading} accessibilityLabel="Chargement de la sortie scolaire">
            <ActivityIndicator color={theme.primary} size="large" />
            <Text style={[styles.loadingText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>Chargement…</Text>
          </View>
        ) : parent.children.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Aucun enfant associé"
              message="Contactez l’administration pour vérifier votre compte parent."
            />
          </Card>
        ) : (
          <>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>Qui récupérez-vous ?</Text>
              <Text style={[styles.sectionHint, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Sélectionnez un enfant</Text>
            </View>

            <ScrollView
              horizontal
              contentInsetAdjustmentBehavior="automatic"
              showsHorizontalScrollIndicator={false}
              style={styles.childScroller}
              contentContainerStyle={styles.childChips}
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
                      setActionError(null)
                    }}
                    style={({ pressed }) => [
                      styles.childChip,
                      {
                        backgroundColor: selected ? theme.primary : theme.card,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: selected ? '#FFFFFF22' : child.avatarColor }]}>
                      <Text style={[styles.avatarText, { color: '#fff', fontFamily: theme.fonts.bold }]}>
                        {child.firstName.slice(0, 1).toLocaleUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text numberOfLines={1} style={[styles.childName, { color: selected ? '#fff' : theme.text, fontFamily: theme.fonts.bold }]}>
                        {child.firstName}
                      </Text>
                      <Text numberOfLines={1} style={[styles.childClass, { color: selected ? '#FFFFFFCC' : theme.textSoft, fontFamily: theme.fonts.medium }]}>
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
                <View style={styles.cardTitleRow}>
                  <View style={[styles.smallIcon, { backgroundColor: theme.primarySurface }]}>
                    <Car size={18} color={theme.primary} strokeWidth={2.1} />
                  </View>
                  <View style={styles.cardTitleText}>
                    <Text style={[styles.cardTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>Votre véhicule</Text>
                    <Text style={[styles.cardSubtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Facultatif, pour vous repérer plus facilement</Text>
                  </View>
                </View>
                <TextInput
                  accessibilityLabel="Description facultative du véhicule"
                  value={vehicleDescription}
                  onChangeText={setVehicleDescription}
                  maxLength={80}
                  placeholder="Ex. Dacia blanche"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: theme.borderStrong,
                      fontFamily: theme.fonts.regular,
                    },
                  ]}
                />
                <View style={styles.privacyRow}>
                  <ShieldCheck size={14} color={theme.success} strokeWidth={2} />
                  <Text style={[styles.privacyText, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>N’indiquez ni numéro de téléphone ni position précise.</Text>
                </View>
              </Card>
            )}

            {actionError ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
              >
                <Text selectable style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{actionError}</Text>
              </View>
            ) : null}

            {!selectedRequest ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sessionIsOpen
                  ? `Je suis arrivé pour ${selectedChild?.firstName || 'mon enfant'}`
                  : 'Smart Pickup est fermé'}
                accessibilityHint={sessionIsOpen
                  ? 'Ajoute l’enfant à la file de sortie scolaire'
                  : 'L’administration doit ouvrir le créneau avant une annonce'}
                accessibilityState={{ disabled: submitting || !sessionIsOpen, busy: submitting || sessionLoading }}
                disabled={submitting || !selectedChild || !sessionIsOpen}
                onPress={announceArrival}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: sessionIsOpen ? theme.accent : theme.borderStrong },
                  (submitting || !selectedChild || !sessionIsOpen) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Car size={21} color="#fff" strokeWidth={2.4} />}
                <Text style={[styles.primaryButtonText, { fontFamily: theme.fonts.bold }]}>
                  {sessionLoading
                    ? 'Vérification du créneau…'
                    : sessionIsOpen
                      ? 'Je suis arrivé'
                      : 'Smart Pickup fermé'}
                </Text>
              </Pressable>
            ) : selectedRequest.status === 'waiting' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Annuler mon arrivée"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={confirmCancellation}
                style={({ pressed }) => [
                  styles.cancelButton,
                  { backgroundColor: theme.card, borderColor: theme.danger },
                  submitting && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {submitting ? <ActivityIndicator color={theme.danger} /> : <X size={18} color={theme.danger} strokeWidth={2.4} />}
                <Text style={[styles.cancelButtonText, { color: theme.danger, fontFamily: theme.fonts.bold }]}>Annuler mon arrivée</Text>
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
  return (
    <View style={styles.transportSection}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>Transport scolaire aujourd’hui</Text>
        <Text style={[styles.sectionHint, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Trajets de vos enfants uniquement</Text>
      </View>

      {loading ? (
        <Card style={styles.transportStateCard}>
          <View style={styles.transportLoadingRow}>
            <ActivityIndicator color={theme.primary} size="small" />
            <Text style={[styles.transportStateText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>Chargement des trajets…</Text>
          </View>
        </Card>
      ) : error ? (
        <View accessibilityRole="alert" style={[styles.transportError, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
          <X size={18} color={theme.danger} strokeWidth={2.2} />
          <Text selectable style={[styles.transportErrorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>Impossible de charger le transport scolaire.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réessayer de charger le transport scolaire"
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
            title="Aucun trajet aujourd’hui"
            message="Aucun transport scolaire n’est planifié pour vos enfants."
          />
        </Card>
      ) : (
        children.map(child => {
          const childPassengers = passengers.filter(passenger => passenger.eleveId === child.id)
          const fullName = [child.firstName, child.lastName].filter(Boolean).join(' ').trim() || 'Enfant'
          return (
            <Card key={child.id} style={styles.transportChildCard}>
              <View style={styles.transportChildHeader}>
                <View style={[styles.transportChildIcon, { backgroundColor: theme.primarySurface }]}>
                  <BusFront size={18} color={theme.primary} strokeWidth={2.1} />
                </View>
                <Text selectable numberOfLines={1} style={[styles.transportChildName, { color: theme.text, fontFamily: theme.fonts.bold }]}>{fullName}</Text>
              </View>

              {childPassengers.length === 0 ? (
                <Text style={[styles.transportNoTrip, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Aucun trajet planifié pour cet enfant.</Text>
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
  const status = transportStatusCopy(passenger.status, theme)
  const direction = transportDirectionLabel(passenger.direction)
  const circuit = passenger.stopLabel
    ? `${passenger.routeLabel} · ${passenger.stopLabel}`
    : passenger.routeLabel
  const delayMinutes = typeof passenger.delayMinutes === 'number'
    && Number.isFinite(passenger.delayMinutes)
    && passenger.delayMinutes > 0
    ? Math.round(passenger.delayMinutes)
    : 0
  const delayAccessibility = delayMinutes > 0
    ? `, Retard estimé : ${delayMinutes} minutes`
    : ''

  return (
    <View
      accessible
      accessibilityLabel={`${direction}, ${passenger.scheduledTime}, ${circuit}, ${passenger.vehicleLabel}, ${status.label}${delayAccessibility}`}
      style={[
        styles.transportTrip,
        !isLast && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.transportTripTop}>
        <View style={[styles.directionPill, { backgroundColor: theme.surface }]}>
          <Text style={[styles.directionText, { color: theme.primary, fontFamily: theme.fonts.semibold }]}>{direction}</Text>
        </View>
        <View style={[styles.transportStatusPill, { backgroundColor: status.surface }]}>
          <Text style={[styles.transportStatusText, { color: status.color, fontFamily: theme.fonts.bold }]}>{status.label}</Text>
        </View>
      </View>
      {delayMinutes > 0 ? (
        <View style={[styles.transportDelayAlert, { backgroundColor: theme.warningSurface }]}>
          <AlertTriangle size={14} color={theme.warning} strokeWidth={2.2} />
          <Text selectable style={[styles.transportDelayText, { color: theme.warning, fontFamily: theme.fonts.bold }]}>Retard estimé : {delayMinutes} min</Text>
        </View>
      ) : null}
      <View style={styles.transportMetaRow}>
        <Clock3 size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable style={[styles.transportTime, { color: theme.text, fontFamily: theme.fonts.bold }]}>{passenger.scheduledTime}</Text>
        <MapPin size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable numberOfLines={1} style={[styles.transportMetaText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{circuit}</Text>
      </View>
      <View style={styles.transportMetaRow}>
        <BusFront size={14} color={theme.textMuted} strokeWidth={2} />
        <Text selectable numberOfLines={1} style={[styles.transportMetaText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{passenger.vehicleLabel}</Text>
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
  if (loading) {
    return (
      <View style={[styles.sessionBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary} size="small" />
        <View style={styles.sessionTextBlock}>
          <Text style={[styles.sessionTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>Vérification du créneau…</Text>
          <Text style={[styles.sessionMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Connexion à la sortie scolaire en direct.</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View accessibilityRole="alert" style={[styles.sessionBanner, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
        <X size={19} color={theme.danger} strokeWidth={2.2} />
        <View style={styles.sessionTextBlock}>
          <Text style={[styles.sessionTitle, { color: theme.danger, fontFamily: theme.fonts.bold }]}>Créneau indisponible</Text>
          <Text style={[styles.sessionMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Impossible de vérifier l’ouverture. L’annonce est désactivée.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Réessayer de vérifier le créneau Smart Pickup"
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
  const closeTime = closesAt
    ? new Date(closesAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null
  const expired = Boolean(session?.isOpen && closesAt && closesAt < now)
  const title = open
    ? 'Smart Pickup est ouvert'
    : expired
      ? 'Le créneau est terminé'
      : 'Smart Pickup est fermé'
  const message = open && closeTime
    ? `Vous pouvez annoncer votre arrivée jusqu’à ${closeTime}.`
    : expired
      ? 'L’administration doit rouvrir un créneau pour accepter de nouvelles arrivées.'
      : 'L’administration ouvrira le service au moment de la sortie.'
  const color = open ? theme.success : theme.warning
  const surface = open ? theme.successSurface : theme.warningSurface

  return (
    <View accessibilityLiveRegion="polite" style={[styles.sessionBanner, { backgroundColor: surface, borderColor: color }]}>
      {open
        ? <CheckCircle2 size={20} color={color} strokeWidth={2.2} />
        : <Clock3 size={20} color={color} strokeWidth={2.2} />}
      <View style={styles.sessionTextBlock}>
        <Text style={[styles.sessionTitle, { color, fontFamily: theme.fonts.bold }]}>{title}</Text>
        <Text style={[styles.sessionMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{message}</Text>
      </View>
    </View>
  )
}

function PickupStatusCard({ request, theme }: { request: PickupRequest; theme: Theme }) {
  const current = statusCopy(request.status, theme)
  const CurrentIcon = current.icon
  const currentIndex = request.status === 'cancelled' ? -1 : STATUS_ORDER.indexOf(request.status)

  return (
    <Card style={styles.statusCard}>
      <View style={[styles.currentStatus, { backgroundColor: current.surface }]}>
        <View style={[styles.statusIcon, { backgroundColor: current.color }]}>
          <CurrentIcon size={22} color="#fff" strokeWidth={2.2} />
        </View>
        <View style={styles.currentStatusText}>
          <Text accessibilityLiveRegion="polite" style={[styles.statusTitle, { color: current.color, fontFamily: theme.fonts.bold }]}>
            {current.title}
          </Text>
          <Text style={[styles.statusMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
            {current.message}
          </Text>
        </View>
      </View>

      {request.status !== 'cancelled' ? (
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: currentIndex + 1 }} style={styles.timeline}>
          {STATUS_ORDER.map((status, index) => {
            const reached = index <= currentIndex
            const meta = statusCopy(status, theme)
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
                  <Text style={[styles.timelineLabel, { color: reached ? theme.text : theme.textMuted, fontFamily: theme.fonts.medium }]}>
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
