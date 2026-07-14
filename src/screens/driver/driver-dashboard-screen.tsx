import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Bus,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import {
  reportTripDelay,
  localServiceDate,
  subscribeToDriverTrips,
  subscribeTripPassengers,
  updatePassengerStatus,
  updateTripStatus,
} from '../../services/pickup-service'
import type {
  PickupPassenger,
  PickupTrip,
  TransportPassengerStatus,
  TransportTripStatus,
} from '../../types/pickup'
import { minTouch } from '../../theme/designTokens'

type Copy = ReturnType<typeof copyFor>
type MutableTripStatus = Exclude<TransportTripStatus, 'scheduled'>
type MutablePassengerStatus = Exclude<TransportPassengerStatus, 'scheduled'>

function copyFor(language: string) {
  if (language === 'ar') {
    return {
      title: 'النقل المدرسي', today: 'رحلات اليوم', trips: 'الرحلات', passengers: 'التلاميذ',
      noTrips: 'لا توجد رحلة اليوم', noTripsHint: 'ستظهر هنا الرحلات التي عيّنتها الإدارة لك.',
      noPassengers: 'لا يوجد تلاميذ في هذه الرحلة.', loading: 'جارٍ تحميل الرحلات…',
      loadError: 'تعذر تحميل الرحلات. تحقق من الاتصال وحاول مجدداً.',
      passengerError: 'تعذر تحميل قائمة التلاميذ.', actionError: 'لم يتم حفظ التغيير. حاول مجدداً.',
      accountError: 'لا يوجد حساب سائق نشط لهذه الجلسة.', retry: 'إعادة المحاولة',
      route: 'المسار', vehicle: 'المركبة', departure: 'الانطلاق', stop: 'المحطة', className: 'القسم',
      progress: 'تقدم الرحلة', stagePlanned: 'مخططة', stageBoarding: 'الصعود',
      stageInProgress: 'في الطريق', stageCompleted: 'منتهية',
      status: {
        scheduled: 'مخططة', boarding: 'صعود التلاميذ', in_transit: 'في الطريق',
        arrived: 'وصلت', completed: 'منتهية', cancelled: 'ملغاة',
      },
      passengerStatus: {
        scheduled: 'في الانتظار', boarded: 'صعد', dropped_off: 'تم إنزاله', absent: 'غائب', cancelled: 'ملغى',
      },
      direction: { to_school: 'نحو المدرسة', from_school: 'العودة من المدرسة' },
      waiting: 'في الانتظار', onboard: 'داخل المركبة', dropped: 'تم إنزالهم', absent: 'غياب',
      beginBoarding: 'بدء الصعود', startTrip: 'بدء الرحلة', markArrived: 'تأكيد الوصول',
      completeTrip: 'إنهاء الرحلة', boarded: 'تأكيد الصعود', droppedOff: 'تأكيد النزول',
      markAbsent: 'تسجيل غياب', confirmAbsent: (student: string) => `تأكيد غياب ${student} عن الرحلة؟`,
      confirmDropTitle: 'تأكيد تسليم التلميذ', plannedStop: 'المحطة المقررة',
      confirmDrop: (student: string, stop: string) => `أكد أن ${student} نزل في ${stop} وتم تسليمه لشخص مخول. هذا الإجراء نهائي ولا يمكن التراجع عنه.`,
      cancel: 'إلغاء', confirm: 'تأكيد',
      confirmComplete: 'هل تم إنزال جميع التلاميذ أو تسجيل غيابهم؟ إنهاء الرحلة نهائي ولا يمكن التراجع عنه.',
      resolveWaiting: 'عيّن كل تلميذ كصاعد أو غائب قبل الانطلاق.',
      resolveOnboard: 'أكد نزول كل التلاميذ قبل إنهاء الرحلة.',
      delay: 'التأخير', reportDelay: 'الإبلاغ عن تأخير', editDelay: 'تعديل التأخير',
      delayReported: 'تأخير متوقع', clearDelay: 'إلغاء التأخير', minutes: 'د',
      privacy: 'يعرض هذا الفضاء فقط المعلومات الضرورية للرحلة.', student: 'تلميذ',
    }
  }

  if (language.startsWith('en')) {
    return {
      title: 'School transport', today: "Today's trips", trips: 'Trips', passengers: 'Passengers',
      noTrips: 'No trip today', noTripsHint: 'Trips assigned by the school will appear here.',
      noPassengers: 'No students are assigned to this trip.', loading: 'Loading trips…',
      loadError: 'Trips could not be loaded. Check your connection and try again.',
      passengerError: 'The passenger list could not be loaded.', actionError: 'The change was not saved. Try again.',
      accountError: 'No active driver account is available for this session.', retry: 'Try again',
      route: 'Route', vehicle: 'Vehicle', departure: 'Departure', stop: 'Stop', className: 'Class',
      progress: 'Trip progress', stagePlanned: 'Planned', stageBoarding: 'Boarding',
      stageInProgress: 'In progress', stageCompleted: 'Completed',
      status: {
        scheduled: 'Planned', boarding: 'Boarding', in_transit: 'In progress',
        arrived: 'Arrived', completed: 'Completed', cancelled: 'Cancelled',
      },
      passengerStatus: {
        scheduled: 'Waiting', boarded: 'On board', dropped_off: 'Dropped off', absent: 'Absent', cancelled: 'Cancelled',
      },
      direction: { to_school: 'To school', from_school: 'From school' },
      waiting: 'Waiting', onboard: 'On board', dropped: 'Dropped off', absent: 'Absent',
      beginBoarding: 'Start boarding', startTrip: 'Start trip', markArrived: 'Confirm arrival',
      completeTrip: 'Complete trip', boarded: 'Confirm boarding', droppedOff: 'Confirm drop-off',
      markAbsent: 'Mark absent', confirmAbsent: (student: string) => `Confirm that ${student} is absent from the trip?`,
      confirmDropTitle: 'Confirm student handoff', plannedStop: 'the planned stop',
      confirmDrop: (student: string, stop: string) => `Confirm that ${student} got off at ${stop} and was handed to an authorized person. This action cannot be undone.`,
      cancel: 'Cancel', confirm: 'Confirm',
      confirmComplete: 'Have all students been dropped off or marked absent? Completing the trip is final and cannot be undone.',
      resolveWaiting: 'Mark every student as boarded or absent before departure.',
      resolveOnboard: 'Confirm every drop-off before completing the trip.',
      delay: 'Delay', reportDelay: 'Report delay', editDelay: 'Edit delay',
      delayReported: 'Expected delay', clearDelay: 'Clear delay', minutes: 'min',
      privacy: 'Only information needed for this trip is shown.', student: 'Student',
    }
  }

  return {
    title: 'Transport scolaire', today: "Tournées d’aujourd’hui", trips: 'Tournées', passengers: 'Passagers',
    noTrips: 'Aucune tournée aujourd’hui', noTripsHint: 'Les tournées attribuées par l’école apparaîtront ici.',
    noPassengers: 'Aucun élève n’est affecté à cette tournée.', loading: 'Chargement des tournées…',
    loadError: 'Impossible de charger les tournées. Vérifiez la connexion puis réessayez.',
    passengerError: 'Impossible de charger la liste des élèves.', actionError: 'La modification n’a pas été enregistrée. Réessayez.',
    accountError: 'Aucun compte chauffeur actif pour cette session.', retry: 'Réessayer',
    route: 'Circuit', vehicle: 'Véhicule', departure: 'Départ', stop: 'Arrêt', className: 'Classe',
    progress: 'Progression du trajet', stagePlanned: 'Prévu', stageBoarding: 'Embarquement',
    stageInProgress: 'En trajet', stageCompleted: 'Terminé',
    status: {
      scheduled: 'Prévu', boarding: 'Embarquement', in_transit: 'En trajet',
      arrived: 'Arrivé', completed: 'Terminé', cancelled: 'Annulé',
    },
    passengerStatus: {
      scheduled: 'En attente', boarded: 'À bord', dropped_off: 'Déposé', absent: 'Absent', cancelled: 'Annulé',
    },
    direction: { to_school: 'Vers l’école', from_school: 'Retour de l’école' },
    waiting: 'En attente', onboard: 'À bord', dropped: 'Déposés', absent: 'Absents',
    beginBoarding: 'Commencer l’embarquement', startTrip: 'Démarrer le trajet',
    markArrived: 'Confirmer l’arrivée', completeTrip: 'Terminer le trajet',
    boarded: 'Confirmer la montée', droppedOff: 'Confirmer la descente', markAbsent: 'Marquer absent',
    confirmAbsent: (student: string) => `Confirmer l’absence de ${student} pour cette tournée ?`,
    confirmDropTitle: 'Confirmer la remise de l’élève', plannedStop: 'l’arrêt prévu',
    confirmDrop: (student: string, stop: string) => `Confirmez que ${student} est descendu à ${stop} et a été remis à une personne autorisée. Cette action est irréversible.`,
    cancel: 'Annuler', confirm: 'Confirmer',
    confirmComplete: 'Tous les élèves ont-ils été déposés ou marqués absents ? La fin de tournée est définitive et irréversible.',
    resolveWaiting: 'Marquez chaque élève comme monté ou absent avant le départ.',
    resolveOnboard: 'Confirmez chaque descente avant de terminer la tournée.',
    delay: 'Retard', reportDelay: 'Signaler un retard', editDelay: 'Modifier le retard',
    delayReported: 'Retard estimé', clearDelay: 'Retirer le retard', minutes: 'min',
    privacy: 'Seules les informations nécessaires à cette tournée sont affichées.', student: 'Élève',
  }
}

function nextTripStatus(status: TransportTripStatus): MutableTripStatus | null {
  if (status === 'scheduled') return 'boarding'
  if (status === 'boarding') return 'in_transit'
  if (status === 'in_transit') return 'arrived'
  if (status === 'arrived') return 'completed'
  return null
}

function stageFor(status: TransportTripStatus): number {
  if (status === 'boarding') return 1
  if (status === 'in_transit' || status === 'arrived') return 2
  if (status === 'completed') return 3
  return 0
}

function passengerName(passenger: PickupPassenger, fallback: string): string {
  return [passenger.elevePrenom, passenger.eleveNom]
    .map(part => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ') || fallback
}

export default function DriverDashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { i18n } = useTranslation()
  const { user, isLoading: authLoading } = useAuth()
  const copy = useMemo(() => copyFor(i18n.language), [i18n.language])
  const isAr = i18n.language === 'ar'
  const serviceDate = useMemo(() => localServiceDate(), [])

  const [trips, setTrips] = useState<PickupTrip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [passengers, setPassengers] = useState<PickupPassenger[]>([])
  const [tripLoading, setTripLoading] = useState(true)
  const [passengerLoading, setPassengerLoading] = useState(false)
  const [tripError, setTripError] = useState<string | null>(null)
  const [passengerError, setPassengerError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [delayPanelTripId, setDelayPanelTripId] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (authLoading) {
      setTripLoading(true)
      return
    }
    if (!user?.uid) {
      setTrips([])
      setSelectedTripId(null)
      setTripLoading(false)
      setTripError(copy.accountError)
      return
    }

    setTripLoading(true)
    setTripError(null)
    return subscribeToDriverTrips(
      user.uid,
      serviceDate,
      nextTrips => {
        const sorted = [...nextTrips].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
        setTrips(sorted)
        setSelectedTripId(current => (
          current && sorted.some(trip => trip.id === current) ? current : sorted[0]?.id ?? null
        ))
        setTripLoading(false)
      },
      () => {
        setTripError(copy.loadError)
        setTripLoading(false)
      },
    )
  }, [authLoading, copy.accountError, copy.loadError, retryKey, serviceDate, user?.uid])

  const selectedTrip = useMemo(
    () => trips.find(trip => trip.id === selectedTripId) ?? null,
    [selectedTripId, trips],
  )

  useEffect(() => {
    setPassengers([])
    setPassengerError(null)
    if (!selectedTrip?.id) {
      setPassengerLoading(false)
      return
    }
    setPassengerLoading(true)
    return subscribeTripPassengers(
      selectedTrip.id,
      list => {
        setPassengers(list)
        setPassengerLoading(false)
      },
      () => {
        setPassengers([])
        setPassengerError(copy.passengerError)
        setPassengerLoading(false)
      },
    )
  }, [copy.passengerError, selectedTrip?.id])

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<void>,
    successMessage: string,
    onSuccess?: () => void,
  ) => {
    setActionError(null)
    setPendingAction(key)
    try {
      await action()
      onSuccess?.()
      AccessibilityInfo.announceForAccessibility(successMessage)
    } catch {
      setActionError(copy.actionError)
    } finally {
      setPendingAction(null)
    }
  }, [copy.actionError])

  const counts = useMemo(() => ({
    scheduled: passengers.filter(item => item.status === 'scheduled').length,
    boarded: passengers.filter(item => item.status === 'boarded').length,
    droppedOff: passengers.filter(item => item.status === 'dropped_off').length,
    absent: passengers.filter(item => item.status === 'absent').length,
  }), [passengers])

  const advanceTrip = useCallback((trip: PickupTrip) => {
    if (passengerError) return
    const next = nextTripStatus(trip.status)
    if (!next) return
    const label = copy.status[next]
    const execute = () => void runAction(
      `trip:${trip.id}`,
      () => updateTripStatus(trip.id, next),
      label,
      () => setTrips(current => current.map(item => item.id === trip.id ? { ...item, status: next } : item)),
    )
    if (next === 'completed') {
      Alert.alert(copy.completeTrip, copy.confirmComplete, [
        { text: copy.cancel, style: 'cancel' },
        { text: copy.confirm, onPress: execute },
      ])
      return
    }
    execute()
  }, [copy, passengerError, runAction])

  const setPassengerStatus = useCallback((passenger: PickupPassenger, status: MutablePassengerStatus) => {
    if (!selectedTrip || passengerError) return
    const displayName = passengerName(passenger, copy.student)
    const execute = () => void runAction(
      `passenger:${passenger.eleveId}`,
      () => updatePassengerStatus(selectedTrip.id, passenger.eleveId, status),
      copy.passengerStatus[status],
      () => setPassengers(current => current.map(item => (
        item.eleveId === passenger.eleveId ? { ...item, status } : item
      ))),
    )
    if (status === 'absent') {
      Alert.alert(copy.markAbsent, copy.confirmAbsent(displayName), [
        { text: copy.cancel, style: 'cancel' },
        { text: copy.confirm, style: 'destructive', onPress: execute },
      ])
      return
    }
    if (status === 'dropped_off') {
      Alert.alert(
        copy.confirmDropTitle,
        copy.confirmDrop(displayName, passenger.stopLabel || copy.plannedStop),
        [
          { text: copy.cancel, style: 'cancel' },
          { text: copy.confirm, style: 'destructive', onPress: execute },
        ],
      )
      return
    }
    execute()
  }, [copy, passengerError, runAction, selectedTrip])

  const setDelay = useCallback((minutes: number) => {
    if (!selectedTrip || passengerError) return
    void runAction(
      `delay:${selectedTrip.id}`,
      () => reportTripDelay(selectedTrip.id, minutes),
      minutes > 0 ? `${copy.delayReported} ${minutes} ${copy.minutes}` : copy.clearDelay,
      () => {
        setTrips(current => current.map(item => (
          item.id === selectedTrip.id ? { ...item, delayMinutes: minutes } : item
        )))
        setDelayPanelTripId(null)
      },
    )
  }, [copy, passengerError, runAction, selectedTrip])

  const next = selectedTrip ? nextTripStatus(selectedTrip.status) : null
  const blocksDeparture = next === 'in_transit' && (passengerLoading || !!passengerError || counts.scheduled > 0)
  const blocksCompletion = next === 'completed'
    && (passengerLoading || !!passengerError || counts.scheduled > 0 || counts.boarded > 0)
  const advanceDisabled = !!pendingAction || !!passengerError || blocksDeparture || blocksCompletion

  return (
    <ScreenLayout title={copy.title} showBack={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
      >
        <View style={[styles.workspaceBar, { backgroundColor: theme.card, borderColor: theme.border }, isAr && styles.rowReverse]}>
          <View style={[styles.workspaceIdentity, isAr && styles.rowReverse]}>
            <View style={[styles.workspaceIcon, { backgroundColor: theme.primarySurface }]}>
              <Bus size={17} color={theme.primary} strokeWidth={2.1} />
            </View>
            <Text style={[styles.workspaceLabel, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
              {copy.title}
            </Text>
          </View>
        </View>

        <View style={[styles.sectionHeader, isAr && styles.rowReverse]}>
          <View style={[styles.titleBlock, isAr && styles.rtlBlock]}>
            <Text selectable style={[styles.eyebrow, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
              {copy.today}
            </Text>
            <Text selectable style={[styles.sectionTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
              {trips.length} {copy.trips.toLowerCase()}
            </Text>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: theme.successSurface }]}>
            <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            <Text style={[styles.liveText, { color: theme.success, fontFamily: theme.fonts.bold }]}>LIVE</Text>
          </View>
        </View>

        {tripError ? (
          <ErrorBanner message={tripError} copy={copy} theme={theme} onRetry={() => setRetryKey(key => key + 1)} />
        ) : null}
        {actionError ? <ErrorBanner message={actionError} copy={copy} theme={theme} /> : null}

        {tripLoading ? (
          <StateCard theme={theme} icon={<ActivityIndicator color={theme.primary} />} title={copy.loading} />
        ) : trips.length === 0 ? (
          <StateCard
            theme={theme}
            icon={<Bus size={28} color={theme.textMuted} />}
            title={copy.noTrips}
            message={copy.noTripsHint}
          />
        ) : (
          <>
            {trips.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>
                {trips.map(trip => {
                  const active = trip.id === selectedTripId
                  return (
                    <Pressable
                      key={trip.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${trip.routeLabel}, ${trip.scheduledTime}, ${copy.status[trip.status]}`}
                      onPress={() => setSelectedTripId(trip.id)}
                      style={({ pressed }) => [
                        styles.tripChip,
                        {
                          backgroundColor: active ? theme.primary : theme.card,
                          borderColor: active ? theme.primary : theme.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.tripChipTitle, { color: active ? theme.white : theme.text, fontFamily: theme.fonts.bold }]}>
                        {trip.routeLabel}
                      </Text>
                      <Text style={[styles.tripChipTime, { color: active ? theme.white : theme.textSoft, fontFamily: theme.fonts.medium }]}>
                        {trip.scheduledTime}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            ) : null}

            {selectedTrip ? (
              <>
                <TripCard trip={selectedTrip} copy={copy} theme={theme} isAr={isAr} />
                <TripProgress status={selectedTrip.status} copy={copy} theme={theme} />

                <View style={styles.statsRow}>
                  <CountChip value={counts.scheduled} label={copy.waiting} color={theme.warning} theme={theme} />
                  <CountChip value={counts.boarded} label={copy.onboard} color={theme.primary} theme={theme} />
                  <CountChip value={counts.droppedOff} label={copy.dropped} color={theme.success} theme={theme} />
                  <CountChip value={counts.absent} label={copy.absent} color={theme.danger} theme={theme} />
                </View>

                {next ? (
                  <View style={styles.actionBlock}>
                    <PrimaryButton
                      label={next === 'boarding' ? copy.beginBoarding
                        : next === 'in_transit' ? copy.startTrip
                          : next === 'arrived' ? copy.markArrived : copy.completeTrip}
                      disabled={advanceDisabled}
                      busy={pendingAction === `trip:${selectedTrip.id}`}
                      onPress={() => advanceTrip(selectedTrip)}
                      theme={theme}
                    />
                    {blocksDeparture ? <Hint text={copy.resolveWaiting} theme={theme} /> : null}
                    {blocksCompletion ? <Hint text={copy.resolveOnboard} theme={theme} /> : null}
                  </View>
                ) : null}

                {selectedTrip.status !== 'completed' && selectedTrip.status !== 'cancelled' ? (
                  <View style={[styles.delayCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.delayHeader, isAr && styles.rowReverse]}>
                      <View style={[styles.delayIcon, { backgroundColor: theme.warningSurface }]}>
                        <Clock3 size={18} color={theme.warning} />
                      </View>
                      <View style={[styles.delayTextBlock, isAr && styles.rtlBlock]}>
                        <Text style={[styles.delayTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{copy.delay}</Text>
                        <Text selectable style={[styles.delaySubtitle, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                          {(selectedTrip.delayMinutes ?? 0) > 0
                            ? `${copy.delayReported} : ${selectedTrip.delayMinutes} ${copy.minutes}`
                            : copy.reportDelay}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={(selectedTrip.delayMinutes ?? 0) > 0 ? copy.editDelay : copy.reportDelay}
                        accessibilityState={{ disabled: !!passengerError || !!pendingAction }}
                        disabled={!!passengerError || !!pendingAction}
                        onPress={() => setDelayPanelTripId(current => current === selectedTrip.id ? null : selectedTrip.id)}
                        style={({ pressed }) => [
                          styles.smallButton,
                          { borderColor: theme.warning },
                          (!!passengerError || !!pendingAction) && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.smallButtonText, { color: theme.warning, fontFamily: theme.fonts.bold }]}>± {copy.minutes}</Text>
                      </Pressable>
                    </View>
                    {delayPanelTripId === selectedTrip.id ? (
                      <View style={styles.delayOptions}>
                        {[5, 10, 15].map(minutes => (
                          <Pressable
                            key={minutes}
                            accessibilityRole="button"
                            accessibilityLabel={`${copy.reportDelay}, ${minutes} ${copy.minutes}`}
                            accessibilityState={{ selected: selectedTrip.delayMinutes === minutes, disabled: !!passengerError || !!pendingAction }}
                            disabled={!!passengerError || !!pendingAction}
                            onPress={() => setDelay(minutes)}
                            style={({ pressed }) => [
                              styles.delayOption,
                              {
                                backgroundColor: selectedTrip.delayMinutes === minutes ? theme.warning : theme.warningSurface,
                                borderColor: theme.warning,
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={{ color: selectedTrip.delayMinutes === minutes ? theme.white : theme.warning, fontFamily: theme.fonts.bold }}>
                              +{minutes} {copy.minutes}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.passengerHeading, isAr && styles.rowReverse]}>
                  <Users size={20} color={theme.primary} />
                  <Text style={[styles.passengerTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
                    {copy.passengers} · {passengers.length}
                  </Text>
                </View>

                {passengerError ? <ErrorBanner message={passengerError} copy={copy} theme={theme} /> : null}
                {passengerLoading ? (
                  <StateCard theme={theme} icon={<ActivityIndicator color={theme.primary} />} title={copy.loading} compact />
                ) : passengers.length === 0 ? (
                  <StateCard theme={theme} icon={<Users size={24} color={theme.textMuted} />} title={copy.noPassengers} compact />
                ) : (
                  <View style={styles.passengerList}>
                    {passengers.map(passenger => (
                      <PassengerCard
                        key={passenger.id}
                        passenger={passenger}
                        tripStatus={selectedTrip.status}
                        pending={pendingAction === `passenger:${passenger.eleveId}`}
                        actionsDisabled={!!pendingAction || !!passengerError}
                        onStatus={status => setPassengerStatus(passenger, status)}
                        copy={copy}
                        theme={theme}
                        isAr={isAr}
                      />
                    ))}
                  </View>
                )}

                <View style={[styles.privacy, { backgroundColor: theme.primarySurface }]}>
                  <CheckCircle2 size={15} color={theme.primary} />
                  <Text style={[styles.privacyText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{copy.privacy}</Text>
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function TripCard({ trip, copy, theme, isAr }: { trip: PickupTrip; copy: Copy; theme: Theme; isAr: boolean }) {
  const tone = trip.status === 'completed' || trip.status === 'arrived'
    ? { color: theme.success, bg: theme.successSurface }
    : trip.status === 'cancelled'
      ? { color: theme.danger, bg: theme.dangerSurface }
      : trip.status === 'boarding'
        ? { color: theme.warning, bg: theme.warningSurface }
        : { color: theme.primary, bg: theme.primarySurface }
  return (
    <View style={[styles.tripCard, { backgroundColor: theme.primaryDark }, theme.shadows.sm]}>
      <View style={[styles.tripTop, isAr && styles.rowReverse]}>
        <View style={styles.busIcon}><Bus size={24} color={theme.primary} /></View>
        <View style={[styles.tripTitleBlock, isAr && styles.rtlBlock]}>
          <Text selectable numberOfLines={2} style={[styles.routeTitle, { color: theme.white, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
            {trip.routeLabel}
          </Text>
          <Text selectable style={[styles.direction, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium }]}>
            {copy.direction[trip.direction]}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusText, { color: tone.color, fontFamily: theme.fonts.bold }]}>{copy.status[trip.status]}</Text>
        </View>
      </View>
      <View style={[styles.tripMeta, isAr && styles.rowReverse]}>
        <Meta icon={<Clock3 size={15} color="#FFFFFF" />} label={copy.departure} value={trip.scheduledTime} isAr={isAr} theme={theme} />
        <Meta icon={<Bus size={15} color="#FFFFFF" />} label={copy.vehicle} value={trip.vehicleLabel} isAr={isAr} theme={theme} />
      </View>
    </View>
  )
}

function Meta({ icon, label, value, isAr, theme }: { icon: React.ReactNode; label: string; value: string; isAr: boolean; theme: Theme }) {
  return (
    <View style={[styles.meta, isAr && styles.rowReverse]}>
      {icon}
      <View style={isAr && styles.rtlBlock}>
        <Text style={[styles.metaLabel, { fontFamily: theme.fonts.medium }]}>{label}</Text>
        <Text selectable numberOfLines={1} style={[styles.metaValue, { fontFamily: theme.fonts.bold }]}>{value}</Text>
      </View>
    </View>
  )
}

function TripProgress({ status, copy, theme }: { status: TransportTripStatus; copy: Copy; theme: Theme }) {
  const current = stageFor(status)
  const stages = [copy.stagePlanned, copy.stageBoarding, copy.stageInProgress, copy.stageCompleted]
  return (
    <View
      accessible
      accessibilityLabel={`${copy.progress}: ${stages[current]}`}
      style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <Text style={[styles.progressTitle, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{copy.progress}</Text>
      <View style={styles.progressRow}>
        {stages.map((label, index) => (
          <React.Fragment key={label}>
            <View style={styles.progressStep}>
              <View style={[styles.progressDot, { backgroundColor: index <= current ? theme.primary : theme.surfaceAlt }]}>
                {index < current ? <CheckCircle2 size={14} color={theme.white} /> : null}
              </View>
              <Text numberOfLines={2} style={[styles.progressLabel, { color: index <= current ? theme.text : theme.textMuted, fontFamily: theme.fonts.medium }]}>
                {label}
              </Text>
            </View>
            {index < stages.length - 1 ? (
              <View style={[styles.progressLine, { backgroundColor: index < current ? theme.primary : theme.border }]} />
            ) : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  )
}

function CountChip({ value, label, color, theme }: { value: number; label: string; color: string; theme: Theme }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.countChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.countValue, { color, fontFamily: theme.fonts.black }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.countLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{label}</Text>
    </View>
  )
}

function PassengerCard({ passenger, tripStatus, pending, actionsDisabled, onStatus, copy, theme, isAr }: {
  passenger: PickupPassenger
  tripStatus: TransportTripStatus
  pending: boolean
  actionsDisabled: boolean
  onStatus: (status: MutablePassengerStatus) => void
  copy: Copy
  theme: Theme
  isAr: boolean
}) {
  const tone = passenger.status === 'dropped_off'
    ? { color: theme.success, bg: theme.successSurface }
    : passenger.status === 'absent' || passenger.status === 'cancelled'
      ? { color: theme.danger, bg: theme.dangerSurface }
      : passenger.status === 'boarded'
        ? { color: theme.primary, bg: theme.primarySurface }
        : { color: theme.warning, bg: theme.warningSurface }
  const canBoard = passenger.status === 'scheduled' && tripStatus === 'boarding'
  const canDrop = passenger.status === 'boarded' && (tripStatus === 'in_transit' || tripStatus === 'arrived')
  const displayName = passengerName(passenger, copy.student)
  const initial = passenger.elevePrenom.trim().charAt(0).toUpperCase() || '•'
  return (
    <View style={[styles.passengerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.passengerTop, isAr && styles.rowReverse]}>
        <View style={[styles.avatar, { backgroundColor: theme.primarySurface }]}>
          <Text style={[styles.avatarText, { color: theme.primary, fontFamily: theme.fonts.black }]}>{initial}</Text>
        </View>
        <View style={[styles.passengerInfo, isAr && styles.rtlBlock]}>
          <Text selectable numberOfLines={1} style={[styles.passengerName, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
            {displayName}
          </Text>
          <View style={[styles.passengerMeta, isAr && styles.rowReverse]}>
            {passenger.classe ? (
              <Text selectable numberOfLines={1} style={[styles.passengerMetaText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
                {copy.className} · {passenger.classe}
              </Text>
            ) : null}
            {passenger.stopLabel ? (
              <View style={[styles.stopLine, isAr && styles.rowReverse]}>
                <MapPin size={12} color={theme.textSoft} />
                <Text selectable numberOfLines={1} style={[styles.passengerMetaText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>
                  {passenger.stopLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.passengerStatus, { backgroundColor: tone.bg }]}>
          <Text numberOfLines={1} style={[styles.passengerStatusText, { color: tone.color, fontFamily: theme.fonts.bold }]}>
            {copy.passengerStatus[passenger.status]}
          </Text>
        </View>
      </View>

      {canBoard ? (
        <View style={[styles.passengerActions, isAr && styles.rowReverse]}>
          <SecondaryButton
            label={copy.boarded}
            accessibilityLabel={`${copy.boarded}: ${displayName}`}
            icon={<UserCheck size={16} color={theme.white} />}
            color={theme.primary}
            textColor={theme.white}
            disabled={actionsDisabled}
            busy={pending}
            onPress={() => onStatus('boarded')}
            theme={theme}
          />
          <SecondaryButton
            label={copy.markAbsent}
            accessibilityLabel={`${copy.markAbsent}: ${displayName}`}
            icon={<UserX size={16} color={theme.danger} />}
            color={theme.dangerSurface}
            textColor={theme.danger}
            disabled={actionsDisabled}
            onPress={() => onStatus('absent')}
            theme={theme}
          />
        </View>
      ) : canDrop ? (
        <View style={styles.passengerActions}>
          <SecondaryButton
            label={copy.droppedOff}
            accessibilityLabel={`${copy.droppedOff}: ${displayName}`}
            icon={<CheckCircle2 size={16} color={theme.white} />}
            color={theme.success}
            textColor={theme.white}
            disabled={actionsDisabled}
            busy={pending}
            onPress={() => onStatus('dropped_off')}
            theme={theme}
          />
        </View>
      ) : null}
    </View>
  )
}

function PrimaryButton({ label, disabled, busy, onPress, theme }: {
  label: string; disabled: boolean; busy: boolean; onPress: () => void; theme: Theme
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: disabled ? theme.borderStrong : theme.primary },
        pressed && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color={theme.white} /> : <Bus size={18} color={theme.white} />}
      <Text style={[styles.primaryButtonText, { color: theme.white, fontFamily: theme.fonts.bold }]}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({ label, accessibilityLabel, icon, color, textColor, disabled, busy, onPress, theme }: {
  label: string
  accessibilityLabel?: string
  icon: React.ReactNode
  color: string
  textColor: string
  disabled: boolean
  busy?: boolean
  onPress: () => void
  theme: Theme
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, { backgroundColor: color }, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={textColor} /> : icon}
      <Text style={[styles.secondaryButtonText, { color: textColor, fontFamily: theme.fonts.bold }]}>{label}</Text>
    </Pressable>
  )
}

function ErrorBanner({ message, copy, theme, onRetry }: { message: string; copy: Copy; theme: Theme; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.dangerSurface, borderColor: theme.danger }]}>
      <AlertTriangle size={18} color={theme.danger} />
      <Text selectable style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.semibold }]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel={copy.retry} onPress={onRetry} style={styles.retryButton}>
          <RefreshCw size={16} color={theme.danger} />
        </Pressable>
      ) : null}
    </View>
  )
}

function StateCard({ theme, icon, title, message, compact }: {
  theme: Theme; icon: React.ReactNode; title: string; message?: string; compact?: boolean
}) {
  return (
    <View style={[styles.stateCard, compact && styles.stateCardCompact, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {icon}
      <Text selectable style={[styles.stateTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{title}</Text>
      {message ? <Text selectable style={[styles.stateMessage, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{message}</Text> : null}
    </View>
  )
}

function Hint({ text, theme }: { text: string; theme: Theme }) {
  return (
    <View style={styles.hint}>
      <AlertTriangle size={14} color={theme.warning} />
      <Text style={[styles.hintText, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: 16 },
  workspaceBar: {
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  workspaceIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  workspaceIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  workspaceLabel: { flex: 1, fontSize: 12.5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleBlock: { flex: 1 },
  eyebrow: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7 },
  sectionTitle: { fontSize: 24, lineHeight: 29, marginTop: 2 },
  liveBadge: { minHeight: 30, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 999 },
  liveText: { fontSize: 10, letterSpacing: 0.8 },
  tripChips: { gap: 8, paddingRight: 20 },
  tripChip: { minHeight: minTouch, maxWidth: 180, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  tripChipTitle: { fontSize: 13 },
  tripChipTime: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  tripCard: { borderRadius: 24, padding: 18, gap: 16, overflow: 'hidden' },
  tripTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  busIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  tripTitleBlock: { flex: 1, minWidth: 0 },
  routeTitle: { fontSize: 20, lineHeight: 24 },
  direction: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 3 },
  statusPill: { maxWidth: 104, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 10, textAlign: 'center' },
  tripMeta: { flexDirection: 'row', gap: 20 },
  meta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { color: 'rgba(255,255,255,0.66)', fontSize: 10 },
  metaValue: { color: '#FFFFFF', fontSize: 13, marginTop: 1, fontVariant: ['tabular-nums'] },
  progressCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, gap: 12 },
  progressTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  progressStep: { width: 56, alignItems: 'center', gap: 5 },
  progressDot: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  progressLine: { flex: 1, height: 2, marginTop: 11 },
  progressLabel: { fontSize: 9, lineHeight: 12, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 7 },
  countChip: { flex: 1, minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 5, alignItems: 'center' },
  countValue: { fontSize: 20, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 8.5, marginTop: 2 },
  actionBlock: { gap: 8 },
  primaryButton: { minHeight: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 14 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 4 },
  hintText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  delayCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 12, gap: 12 },
  delayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  delayIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  delayTextBlock: { flex: 1 },
  delayTitle: { fontSize: 13 },
  delaySubtitle: { fontSize: 11.5, marginTop: 2 },
  smallButton: { minWidth: minTouch, minHeight: minTouch, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  smallButtonText: { fontSize: 12 },
  delayOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  delayOption: { minHeight: minTouch, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  clearDelay: { minHeight: minTouch, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  passengerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  passengerTitle: { fontSize: 18 },
  passengerList: { gap: 10 },
  passengerCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 13, gap: 12 },
  passengerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17 },
  passengerInfo: { flex: 1, minWidth: 0 },
  passengerName: { fontSize: 14.5 },
  passengerMeta: { gap: 3, marginTop: 3 },
  passengerMetaText: { fontSize: 10.5 },
  stopLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  passengerStatus: { maxWidth: 88, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  passengerStatusText: { fontSize: 9.5, textAlign: 'center' },
  passengerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: { minHeight: minTouch, flexGrow: 1, flexBasis: 130, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  secondaryButtonText: { fontSize: 11.5 },
  errorBanner: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 9 },
  errorText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  retryButton: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  stateCard: { minHeight: 180, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 24 },
  stateCardCompact: { minHeight: 110 },
  stateTitle: { fontSize: 14, textAlign: 'center' },
  stateMessage: { maxWidth: 270, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  privacy: { minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  privacyText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
})
