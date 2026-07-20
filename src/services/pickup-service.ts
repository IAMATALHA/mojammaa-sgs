/**
 * Smart Pickup — frontière Firestore temps réel.
 *
 * Les écrans ne reçoivent que les documents autorisés par les règles. Les
 * noms de la file de sortie sont hydratés depuis `eleves` afin de ne pas les
 * dupliquer dans chaque demande parent.
 */
import {
  addDoc,
  collection,
  collectionGroup,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../config/firebase'
import { isActiveEleve, type EleveDoc } from './elevesService'
import { docData, toDocs } from './firestore'
import type {
  AnnouncePickupArrivalInput,
  AssignTransportPassengerInput,
  CreateTransportTripInput,
  DriverProfile,
  PickupRequest,
  PickupRequestRecord,
  PickupSession,
  PickupStatus,
  ServiceDate,
  TransportPassenger,
  TransportPassengerStatus,
  TransportTrip,
  TransportTripStatus,
} from '../types/pickup'

const PICKUP_COLLECTION = 'pickupRequests'
const PICKUP_SESSION_COLLECTION = 'pickupSessions'
const DRIVER_COLLECTION = 'driverProfiles'
const TRIP_COLLECTION = 'transportTrips'

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date civile du téléphone, sans conversion UTC qui peut changer le jour. */
export function localServiceDate(date = new Date()): ServiceDate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function pickupDocumentId(serviceDate: ServiceDate, eleveId: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Error('Date de sortie invalide.')
  if (!eleveId || eleveId.includes('/')) throw new Error('Identifiant élève invalide.')
  return `${serviceDate}_${eleveId}`
}

function timestampMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis
    if (typeof toMillis === 'function') return Number(toMillis.call(value)) || 0
  }
  return 0
}

async function studentMap(ids: string[]): Promise<Map<string, EleveDoc>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const result = new Map<string, EleveDoc>()
  // Limite conservatrice compatible avec les versions Firestore déjà utilisées
  // dans le projet. Les règles vérifient chaque élève retourné.
  for (let offset = 0; offset < unique.length; offset += 10) {
    const chunk = unique.slice(offset, offset + 10)
    const snap = await getDocs(query(
      collection(db, 'eleves'),
      where(documentId(), 'in', chunk),
    ))
    toDocs<EleveDoc>(snap)
      .filter(isActiveEleve)
      .forEach(student => result.set(student.id, student))
  }
  return result
}

async function hydratePickupRequests(records: PickupRequest[]): Promise<PickupRequest[]> {
  if (records.length === 0) return []
  const students = await studentMap(records.map(record => record.eleveId))
  return records.map(record => {
    const student = students.get(record.eleveId)
    return {
      ...record,
      elevePrenom: student?.prenomLatin || student?.prenom || '',
      eleveNom: student?.nomLatin || student?.nom || '',
      classe: student?.classe || '',
    }
  })
}

function subscribeHydratedPickupQuery(
  pickupQuery: Query,
  onChange: (list: PickupRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let generation = 0
  const unsubscribe = onSnapshot(
    pickupQuery,
    snap => {
      const current = ++generation
      const records = toDocs<PickupRequestRecord>(snap)
      hydratePickupRequests(records)
        .then(list => {
          if (current !== generation) return
          onChange(list.sort((a, b) => timestampMillis(a.arrivedAt) - timestampMillis(b.arrivedAt)))
        })
        .catch(error => {
          if (current === generation) onError?.(error instanceof Error ? error : new Error(String(error)))
        })
    },
    error => onError?.(error),
  )
  return () => {
    generation++
    unsubscribe()
  }
}

export function subscribeParentPickupRequests(
  parentUid: string,
  eleveIds: string[],
  onChange: (list: PickupRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const serviceDate = localServiceDate()
  const uniqueIds = [...new Set(eleveIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    onChange([])
    return () => undefined
  }

  let generation = 0
  let active = true
  const initialized = new Set<string>()
  const records = new Map<string, PickupRequest>()

  const emit = () => {
    if (!active || initialized.size !== uniqueIds.length) return
    const current = ++generation
    hydratePickupRequests([...records.values()])
      .then(list => {
        if (!active || current !== generation) return
        onChange(list.sort((a, b) => timestampMillis(a.arrivedAt) - timestampMillis(b.arrivedAt)))
      })
      .catch(error => {
        if (active && current === generation) {
          onError?.(error instanceof Error ? error : new Error(String(error)))
        }
      })
  }

  const unsubscribes = uniqueIds.map(eleveId => onSnapshot(
    query(
      collection(db, PICKUP_COLLECTION),
      where('parentUid', '==', parentUid),
      where('serviceDate', '==', serviceDate),
      where('eleveId', '==', eleveId),
    ),
    snap => {
      initialized.add(eleveId)
      const record = toDocs<PickupRequestRecord>(snap)[0]
      if (record) records.set(eleveId, record)
      else records.delete(eleveId)
      emit()
    },
    error => onError?.(error),
  ))

  return () => {
    active = false
    generation++
    unsubscribes.forEach(unsubscribe => unsubscribe())
  }
}

export function subscribeTodayPickupQueue(
  onChange: (list: PickupRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribeHydratedPickupQuery(
    query(
      collection(db, PICKUP_COLLECTION),
      where('serviceDate', '==', localServiceDate()),
    ),
    onChange,
    onError,
  )
}

export async function announcePickupArrival(input: AnnouncePickupArrivalInput): Promise<void> {
  const serviceDate = localServiceDate()
  const requestRef = doc(db, PICKUP_COLLECTION, pickupDocumentId(serviceDate, input.eleveId))
  const vehicleDescription = input.vehicleDescription?.trim()
  if (vehicleDescription && vehicleDescription.length > 80) {
    throw new Error('La description du véhicule est limitée à 80 caractères.')
  }

  const existing = await getDoc(requestRef)
  if (existing.exists()) {
    const current = docData<PickupRequestRecord>(existing)
    if (current?.status !== 'cancelled') {
      throw new Error(current?.status === 'completed'
        ? 'La sortie de cet enfant est déjà terminée aujourd’hui.'
        : 'Une arrivée est déjà active pour cet enfant.')
    }
    await updateDoc(requestRef, {
      status: 'waiting',
      arrivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      cancelledAt: deleteField(),
      vehicleDescription: vehicleDescription || deleteField(),
    })
    return
  }

  const record: Record<string, unknown> = {
    parentUid: input.parentUid,
    eleveId: input.eleveId,
    serviceDate,
    status: 'waiting',
    arrivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (vehicleDescription) record.vehicleDescription = vehicleDescription
  await setDoc(requestRef, record)
}

export async function cancelPickupArrival(requestId: string): Promise<void> {
  await updateDoc(doc(db, PICKUP_COLLECTION, requestId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export function subscribeTodayPickupSession(
  onChange: (session: PickupSession | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const serviceDate = localServiceDate()
  return onSnapshot(
    doc(db, PICKUP_SESSION_COLLECTION, serviceDate),
    snap => onChange(snap.exists()
      ? { ...snap.data(), id: snap.id } as PickupSession
      : null),
    error => onError?.(error),
  )
}

export function pickupSessionIsCurrentlyOpen(
  session: PickupSession | null,
  now = Date.now(),
): boolean {
  if (!session?.isOpen || !session.opensAt || !session.closesAt) return false
  return session.opensAt.toMillis() <= now && session.closesAt.toMillis() >= now
}

export async function openTodayPickupSession(durationMinutes = 180): Promise<void> {
  const managerUid = auth.currentUser?.uid
  if (!managerUid) throw new Error('Session expirée.')
  const safeDuration = Math.round(durationMinutes)
  if (!Number.isFinite(safeDuration) || safeDuration < 15 || safeDuration > 360) {
    throw new Error('Le créneau doit durer entre 15 minutes et 6 heures.')
  }

  const serviceDate = localServiceDate()
  const ref = doc(db, PICKUP_SESSION_COLLECTION, serviceDate)
  const current = await getDoc(ref)
  const common = {
    serviceDate,
    isOpen: true,
    openedByUid: managerUid,
    opensAt: serverTimestamp(),
    closesAt: Timestamp.fromMillis(Date.now() + safeDuration * 60_000),
    updatedAt: serverTimestamp(),
  }
  if (current.exists()) {
    await updateDoc(ref, {
      ...common,
      closedAt: deleteField(),
      closedByUid: deleteField(),
    })
  } else {
    await setDoc(ref, { ...common, createdAt: serverTimestamp() })
  }
}

export async function closeTodayPickupSession(): Promise<void> {
  const managerUid = auth.currentUser?.uid
  if (!managerUid) throw new Error('Session expirée.')
  await updateDoc(doc(db, PICKUP_SESSION_COLLECTION, localServiceDate()), {
    isOpen: false,
    closedAt: serverTimestamp(),
    closedByUid: managerUid,
    updatedAt: serverTimestamp(),
  })
}

export async function updatePickupStatus(
  requestId: string,
  nextStatus: Exclude<PickupStatus, 'waiting' | 'cancelled'>,
): Promise<void> {
  if (!['called', 'ready', 'completed'].includes(nextStatus)) {
    throw new Error('Transition de sortie invalide.')
  }
  const managerUid = auth.currentUser?.uid
  if (!managerUid) throw new Error('Session expirée.')
  const timestampField = nextStatus === 'called'
    ? 'calledAt'
    : nextStatus === 'ready'
      ? 'readyAt'
      : 'completedAt'
  await updateDoc(doc(db, PICKUP_COLLECTION, requestId), {
    status: nextStatus,
    [timestampField]: serverTimestamp(),
    managedByUid: managerUid,
    updatedAt: serverTimestamp(),
  })
}

export function subscribeDriverProfile(
  uid: string,
  onChange: (profile: DriverProfile | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DRIVER_COLLECTION, uid),
    snap => onChange(snap.exists() ? { ...snap.data(), id: snap.id } as DriverProfile : null),
    error => onError?.(error),
  )
}

function sortTrips(trips: TransportTrip[]): TransportTrip[] {
  return trips.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
}

export function subscribeToDriverTrips(
  driverUid: string,
  serviceDate: ServiceDate,
  onChange: (trips: TransportTrip[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, TRIP_COLLECTION),
      where('driverUid', '==', driverUid),
      where('serviceDate', '==', serviceDate),
    ),
    snap => onChange(sortTrips(toDocs<Omit<TransportTrip, 'id'>>(snap))),
    error => onError?.(error),
  )
}

export function subscribeTodayTransportTripsAdmin(
  onChange: (trips: TransportTrip[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, TRIP_COLLECTION), where('serviceDate', '==', localServiceDate())),
    snap => onChange(sortTrips(toDocs<Omit<TransportTrip, 'id'>>(snap))),
    error => onError?.(error),
  )
}

export function subscribeTripPassengers(
  tripId: string,
  onChange: (passengers: TransportPassenger[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, TRIP_COLLECTION, tripId, 'passengers'),
    snap => onChange(
      toDocs<Omit<TransportPassenger, 'id'>>(snap).sort((a, b) =>
        (a.stopLabel || '').localeCompare(b.stopLabel || '')
        || a.elevePrenom.localeCompare(b.elevePrenom)),
    ),
    error => onError?.(error),
  )
}

export function subscribeTodayParentTransport(
  eleveIds: string[],
  onChange: (passengers: TransportPassenger[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uniqueIds = [...new Set(eleveIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    onChange([])
    return () => undefined
  }

  const serviceDate = localServiceDate()
  let active = true
  const initialized = new Set<string>()
  const byChild = new Map<string, TransportPassenger[]>()
  const emit = () => {
    if (!active || initialized.size !== uniqueIds.length) return
    onChange(
      [...byChild.values()]
        .flat()
        .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
    )
  }

  const unsubscribes = uniqueIds.map(eleveId => onSnapshot(
    query(
      collectionGroup(db, 'passengers'),
      where('eleveId', '==', eleveId),
      where('serviceDate', '==', serviceDate),
    ),
    snap => {
      initialized.add(eleveId)
      byChild.set(eleveId, toDocs<Omit<TransportPassenger, 'id'>>(snap))
      emit()
    },
    error => onError?.(error),
  ))

  return () => {
    active = false
    unsubscribes.forEach(unsubscribe => unsubscribe())
  }
}

export async function updateTripStatus(
  tripId: string,
  nextStatus: Exclude<TransportTripStatus, 'scheduled'>,
): Promise<void> {
  if (!['boarding', 'in_transit', 'arrived', 'completed', 'cancelled'].includes(nextStatus)) {
    throw new Error('Transition de tournée invalide.')
  }
  const transition = httpsCallable<
    { tripId: string; nextStatus: Exclude<TransportTripStatus, 'scheduled'> },
    { changed: boolean; status: TransportTripStatus }
  >(functions, 'updateTransportTripStatus')
  await transition({ tripId, nextStatus })
}

export async function reportTripDelay(
  tripId: string,
  delayMinutes: number,
  reason?: string,
): Promise<void> {
  const minutes = Math.round(delayMinutes)
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
    throw new Error('Le retard doit être compris entre 1 et 180 minutes.')
  }
  const cleanReason = reason?.trim()
  if (cleanReason && cleanReason.length > 160) {
    throw new Error('Le motif du retard est limité à 160 caractères.')
  }
  const report = httpsCallable<
    { tripId: string; delayMinutes: number; reason?: string },
    { changed: boolean; delayMinutes: number; revision: number }
  >(functions, 'reportTransportTripDelay')
  await report({ tripId, delayMinutes: minutes, reason: cleanReason || undefined })
}

export async function updatePassengerStatus(
  tripId: string,
  passengerId: string,
  nextStatus: Exclude<TransportPassengerStatus, 'scheduled'>,
): Promise<void> {
  if (!['boarded', 'dropped_off', 'absent', 'cancelled'].includes(nextStatus)) {
    throw new Error('État passager invalide.')
  }
  const updates: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  }
  if (nextStatus === 'boarded') updates.boardedAt = serverTimestamp()
  if (nextStatus === 'dropped_off') updates.droppedOffAt = serverTimestamp()
  if (nextStatus === 'absent') updates.absentAt = serverTimestamp()
  if (nextStatus === 'cancelled') updates.cancelledAt = serverTimestamp()
  await updateDoc(doc(db, TRIP_COLLECTION, tripId, 'passengers', passengerId), updates)
}

export async function createTransportTrip(input: CreateTransportTripInput): Promise<string> {
  if (!Array.isArray(input.stops) || input.stops.length === 0 || input.stops.length > 100) {
    throw new Error('La tournée doit contenir entre 1 et 100 arrêts.')
  }
  const stopIds = input.stops.map(stop => stop.id)
  if (new Set(stopIds).size !== stopIds.length || stopIds.some(id => !id || id.includes('/'))) {
    throw new Error('Les identifiants d’arrêt doivent être uniques et valides.')
  }
  const ref = await addDoc(collection(db, TRIP_COLLECTION), {
    ...input,
    stopIds,
    status: 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function assignPassengerToTrip(
  tripId: string,
  input: AssignTransportPassengerInput,
): Promise<void> {
  const tripSnap = await getDoc(doc(db, TRIP_COLLECTION, tripId))
  const trip = docData<Omit<TransportTrip, 'id'>>(tripSnap)
  if (!trip) throw new Error('Tournée introuvable.')
  if (!trip.stopIds?.includes(input.stopId)) throw new Error('Arrêt absent de cette tournée.')
  await setDoc(doc(db, TRIP_COLLECTION, tripId, 'passengers', input.eleveId), {
    tripId,
    ...input,
    serviceDate: trip.serviceDate,
    direction: trip.direction,
    routeLabel: trip.routeLabel,
    vehicleLabel: trip.vehicleLabel,
    scheduledTime: trip.scheduledTime,
    status: 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
