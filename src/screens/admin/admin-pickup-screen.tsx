import React, { useEffect, useMemo, useState } from 'react'
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
import { EmptyState } from '../../components/dashboard'
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

function statusDetails(status: ActivePickupStatus, theme: Theme) {
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
      title: 'À appeler',
      subtitle: 'Parents arrivés · du plus ancien au plus récent',
      badge: 'En attente',
      action: 'Appeler l’élève',
      color: theme.warning,
      surface: theme.warningSurface,
      icon: Clock3,
    },
    called: {
      title: 'Appelés',
      subtitle: 'Élèves en cours de préparation',
      badge: 'Appelé',
      action: 'Marquer prêt',
      color: theme.info,
      surface: theme.infoSurface,
      icon: Megaphone,
    },
    ready: {
      title: 'Prêts',
      subtitle: 'Élèves prêts pour la remise',
      badge: 'Prêt',
      action: 'Confirmer la sortie',
      color: theme.success,
      surface: theme.successSurface,
      icon: UserCheck,
    },
    completed: {
      title: 'Sorties terminées',
      subtitle: 'Remises confirmées aujourd’hui',
      badge: 'Terminé',
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

function arrivalLabel(value: unknown): string {
  const date = timestampToDate(value)
  if (!date) return 'Heure d’arrivée indisponible'
  return `Arrivé à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function waitingLabel(value: unknown): string | null {
  const date = timestampToDate(value)
  if (!date) return null
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `${minutes} min d’attente`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min d’attente`
}

function studentName(request: PickupRequest): string {
  return [request.elevePrenom, request.eleveNom].filter(Boolean).join(' ').trim() || 'Élève'
}

export default function AdminPickupScreen() {
  const theme = useTheme()
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
        setSessionError('Impossible de charger le créneau Smart Pickup.')
      },
    )
  }, [sessionSubscriptionKey])

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
      const details = statusDetails(status, theme)
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
    [theme, visibleQueue],
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
      setSessionError('Impossible d’ouvrir le créneau Smart Pickup.')
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
      setSessionError('Impossible de fermer le créneau Smart Pickup.')
    } finally {
      setSessionUpdating(false)
    }
  }

  const confirmClosePickupSession = () => {
    if (!sessionIsOpen || sessionUpdating) return
    Alert.alert(
      'Fermer Smart Pickup ?',
      'Les parents ne pourront plus annoncer une nouvelle arrivée. Les demandes déjà reçues resteront dans la file.',
      [
        { text: 'Garder ouvert', style: 'cancel' },
        {
          text: 'Fermer le créneau',
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
        'Confirmer la remise ?',
        `Avant de terminer, vérifiez l’identité de la personne autorisée ou le code de retrait pour ${studentName(request)}. Cette action est irréversible.`,
        [
          { text: 'Revenir', style: 'cancel' },
          {
            text: 'Identité vérifiée',
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
    <ScreenLayout title="Sortie scolaire">
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
              <View style={styles.summaryTopRow}>
                <View style={styles.summaryTitleBlock}>
                  <Text style={[styles.summaryEyebrow, { fontFamily: theme.fonts.semibold }]}>FILE EN DIRECT</Text>
                  <Text style={[styles.summaryTitle, { fontFamily: theme.fonts.black }]}>Sortie du jour</Text>
                  <Text style={[styles.summarySubtitle, { fontFamily: theme.fonts.regular }]}>Les demandes apparaissent automatiquement.</Text>
                </View>
                <View style={styles.activeCountBubble} accessibilityLabel={`${activeCount} élèves en cours`}>
                  <Text style={[styles.activeCount, { fontFamily: theme.fonts.black }]}>{activeCount}</Text>
                  <Text style={[styles.activeCountLabel, { fontFamily: theme.fonts.semibold }]}>en cours</Text>
                </View>
              </View>
              <View style={styles.summaryStats}>
                <SummaryStat label="À appeler" value={counts.waiting} icon={Clock3} />
                <SummaryStat label="Appelés" value={counts.called} icon={Megaphone} />
                <SummaryStat label="Prêts" value={counts.ready} icon={UserCheck} />
                <SummaryStat label="Terminés" value={counts.completed} icon={CheckCircle2} />
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
              onOpen={() => { void openPickupSession() }}
              onClose={confirmClosePickupSession}
              onRetry={() => setSessionSubscriptionKey(key => key + 1)}
            />

            {loadError ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
              >
                <AlertTriangle size={18} color={theme.danger} strokeWidth={2.1} />
                <Text selectable style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>Impossible de charger la file de sortie.</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Réessayer de charger la file"
                  onPress={() => setSubscriptionKey(key => key + 1)}
                  style={({ pressed }) => [styles.retryButton, { borderColor: theme.danger }, pressed && styles.pressed]}
                >
                  <RefreshCw size={15} color={theme.danger} strokeWidth={2.2} />
                  <Text style={[styles.retryText, { color: theme.danger, fontFamily: theme.fonts.bold }]}>Réessayer</Text>
                </Pressable>
              </View>
            ) : null}

            {mutationError ? (
              <View
                accessibilityRole="alert"
                style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}
              >
                <AlertTriangle size={18} color={theme.danger} strokeWidth={2.1} />
                <Text selectable style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>La mise à jour a échoué. L’état affiché reste inchangé.</Text>
              </View>
            ) : null}

            {!loading && visibleQueue.length > 0 ? (
              <View style={styles.queueHeading}>
                <View>
                  <Text style={[styles.queueTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>File d’attente</Text>
                  <Text style={[styles.queueSubtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Ordre d’arrivée dans chaque étape</Text>
                </View>
                <View style={[styles.totalPill, { backgroundColor: theme.surfaceAlt }]}>
                  <Users size={14} color={theme.primary} strokeWidth={2} />
                  <Text style={[styles.totalText, { color: theme.primary, fontFamily: theme.fonts.bold }]}>{visibleQueue.length}</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
        ListEmptyComponent={(
          loading ? (
            <View style={styles.loading} accessibilityLabel="Chargement de la file de sortie">
              <ActivityIndicator color={theme.primary} size="large" />
              <Text style={[styles.loadingText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>Chargement de la file…</Text>
            </View>
          ) : !loadError ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }, theme.shadows.xs]}>
              <EmptyState
                icon={School}
                title="Aucune arrivée signalée"
                message="La file se mettra à jour dès qu’un parent annoncera son arrivée."
              />
            </View>
          ) : null
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader section={section} theme={theme} />
        )}
        renderItem={({ item, section }) => (
          <QueueCard
            request={item}
            section={section}
            theme={theme}
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
  onOpen: () => void
  onClose: () => void
  onRetry: () => void
}) {
  const closesAt = timestampToDate(session?.closesAt)
  const expired = Boolean(session?.isOpen && closesAt && closesAt.getTime() < now)
  const closeTime = closesAt?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const title = isOpen
    ? 'Créneau parent ouvert'
    : expired
      ? 'Créneau expiré'
      : 'Créneau parent fermé'
  const message = isOpen && closeTime
    ? `Les arrivées sont acceptées jusqu’à ${closeTime}.`
    : expired
      ? 'La fenêtre de trois heures est terminée. Vous pouvez la rouvrir si nécessaire.'
      : 'Ouvrez une fenêtre de trois heures pour autoriser les annonces parent.'
  const color = isOpen ? theme.success : theme.warning
  const surface = isOpen ? theme.successSurface : theme.warningSurface

  if (loading) {
    return (
      <View style={[styles.sessionCard, styles.sessionLoadingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary} size="small" />
        <View style={styles.sessionTextBlock}>
          <Text style={[styles.sessionTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>Chargement du créneau…</Text>
          <Text style={[styles.sessionMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>Vérification de l’accès parent en direct.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.sessionCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <View style={styles.sessionHeader}>
        <View style={[styles.sessionIcon, { backgroundColor: surface }]}>
          {isOpen
            ? <CheckCircle2 size={20} color={color} strokeWidth={2.2} />
            : <Clock3 size={20} color={color} strokeWidth={2.2} />}
        </View>
        <View style={styles.sessionTextBlock}>
          <Text accessibilityLiveRegion="polite" style={[styles.sessionTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{title}</Text>
          <Text style={[styles.sessionMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{message}</Text>
        </View>
        <View style={[styles.sessionStatePill, { backgroundColor: surface }]}>
          <Text style={[styles.sessionStateText, { color, fontFamily: theme.fonts.bold }]}>{isOpen ? 'OUVERT' : 'FERMÉ'}</Text>
        </View>
      </View>

      {error ? (
        <View accessibilityRole="alert" style={[styles.sessionError, { backgroundColor: theme.dangerSurface }]}>
          <AlertTriangle size={15} color={theme.danger} strokeWidth={2} />
          <Text selectable style={[styles.sessionErrorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualiser le créneau Smart Pickup"
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
        accessibilityLabel={isOpen ? 'Fermer le créneau Smart Pickup' : 'Ouvrir Smart Pickup pendant trois heures'}
        accessibilityState={{ disabled: updating, busy: updating }}
        disabled={updating}
        onPress={isOpen ? onClose : onOpen}
        style={({ pressed }) => [
          styles.sessionButton,
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
            <Text style={[styles.sessionButtonText, { color: isOpen ? theme.danger : '#fff', fontFamily: theme.fonts.bold }]}>
              {isOpen ? 'Fermer le créneau' : 'Ouvrir pour 3 heures'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  )
}

function SummaryStat({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <View style={styles.summaryStat} accessibilityLabel={`${label} : ${value}`}>
      <Icon size={13} color="#FFFFFFD9" strokeWidth={2.1} />
      <Text style={styles.summaryStatValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.summaryStatLabel}>{label}</Text>
    </View>
  )
}

function SectionHeader({ section, theme }: { section: QueueSection; theme: Theme }) {
  const Icon = section.icon
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: section.surface }]}>
        <Icon size={17} color={section.color} strokeWidth={2.2} />
      </View>
      <View style={styles.sectionTitleBlock}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{section.title}</Text>
        <Text numberOfLines={1} style={[styles.sectionSubtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{section.subtitle}</Text>
      </View>
      <View style={[styles.sectionCount, { backgroundColor: section.surface }]}>
        <Text style={[styles.sectionCountText, { color: section.color, fontFamily: theme.fonts.black }]}>{section.data.length}</Text>
      </View>
    </View>
  )
}

function QueueCard({
  request,
  section,
  theme,
  updating,
  onAdvance,
}: {
  request: PickupRequest
  section: QueueSection
  theme: Theme
  updating: boolean
  onAdvance: () => void
}) {
  const details = statusDetails(section.status, theme)
  const Icon = details.icon
  const name = studentName(request)
  const wait = waitingLabel(request.arrivedAt)

  return (
    <View style={[styles.queueCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      <View style={styles.queueCardTop}>
        <View style={[styles.studentAvatar, { backgroundColor: section.surface }]}>
          <Text style={[styles.studentInitial, { color: section.color, fontFamily: theme.fonts.black }]}>
            {name.slice(0, 1).toLocaleUpperCase()}
          </Text>
        </View>
        <View style={styles.studentBlock}>
          <Text selectable numberOfLines={1} style={[styles.studentName, { color: theme.text, fontFamily: theme.fonts.bold }]}>{name}</Text>
          <View style={styles.studentMetaRow}>
            {request.classe ? (
              <Text selectable numberOfLines={1} style={[styles.studentClass, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{request.classe}</Text>
            ) : null}
            <Text style={[styles.arrivalTime, { color: theme.textMuted, fontFamily: theme.fonts.regular }]}>{arrivalLabel(request.arrivedAt)}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: section.surface }]}>
          <Icon size={13} color={section.color} strokeWidth={2.2} />
          <Text style={[styles.statusBadgeText, { color: section.color, fontFamily: theme.fonts.bold }]}>{details.badge}</Text>
        </View>
      </View>

      {(request.vehicleDescription || wait) ? (
        <View style={[styles.detailsRow, { backgroundColor: theme.surface }]}>
          {request.vehicleDescription ? (
            <View style={styles.detailItem}>
              <Car size={14} color={theme.primary} strokeWidth={2} />
              <Text selectable numberOfLines={1} style={[styles.detailText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{request.vehicleDescription}</Text>
            </View>
          ) : null}
          {wait ? (
            <View style={styles.detailItem}>
              <Clock3 size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.detailText, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{wait}</Text>
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
            { backgroundColor: section.color },
            updating && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {updating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={[styles.actionText, { fontFamily: theme.fonts.bold }]}>{details.action}</Text>
              <ChevronRight size={17} color="#fff" strokeWidth={2.4} />
            </>
          )}
        </Pressable>
      ) : (
        <View style={styles.completedRow}>
          <CheckCircle2 size={16} color={theme.success} strokeWidth={2.2} />
          <Text style={[styles.completedText, { color: theme.success, fontFamily: theme.fonts.semibold }]}>Remise confirmée</Text>
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
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.55 },
})
