/**
 * Domaine Smart Pickup.
 *
 * Les documents Firestore ne dupliquent pas les noms des parents. Les demandes
 * de sortie sont enrichies à la lecture depuis `eleves/{eleveId}`. Une fiche
 * passager transporte seulement le prénom/nom de l'élève nécessaires au
 * chauffeur, qui n'a pas accès à la fiche scolaire complète.
 */
import type { Timestamp } from 'firebase/firestore'

/** Date civile locale, toujours sérialisée en `YYYY-MM-DD`. */
export type ServiceDate = string

export type PickupStatus =
  | 'waiting'
  | 'called'
  | 'ready'
  | 'completed'
  | 'cancelled'

/** Forme réellement persistée dans `pickupRequests`. */
export interface PickupRequestRecord {
  id?:                 string
  parentUid:           string
  eleveId:             string
  serviceDate:         ServiceDate
  status:              PickupStatus
  vehicleDescription?: string
  queueNumber?:        number
  zone?:               string
  managedByUid?:       string
  arrivedAt?:          Timestamp
  calledAt?:           Timestamp
  readyAt?:            Timestamp
  completedAt?:        Timestamp
  cancelledAt?:        Timestamp
  updatedAt?:          Timestamp
}

/**
 * Vue rendue aux écrans. Les champs élève sont hydratés depuis `eleves` et ne
 * sont pas stockés une seconde fois dans `pickupRequests`.
 */
export interface PickupRequest extends Omit<PickupRequestRecord, 'id'> {
  id:            string
  elevePrenom?: string
  eleveNom?:    string
  classe?:      string
}

export interface AnnouncePickupArrivalInput {
  parentUid:           string
  eleveId:             string
  vehicleDescription?: string
}

export interface PickupSession {
  id:           string
  serviceDate:  ServiceDate
  isOpen:       boolean
  openedByUid:  string
  closedByUid?: string
  opensAt?:     Timestamp
  closesAt?:    Timestamp
  closedAt?:    Timestamp
  createdAt?:   Timestamp
  updatedAt?:   Timestamp
}

/** Capacité additive : le rôle principal dans `users` reste inchangé. */
export interface DriverProfile {
  id?:        string
  uid:        string
  active:     boolean
  routeIds?:  string[]
  vehicleId?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export type TransportDirection = 'to_school' | 'from_school'

export type TransportTripStatus =
  | 'scheduled'
  | 'boarding'
  | 'in_transit'
  | 'arrived'
  | 'completed'
  | 'cancelled'

export interface TransportStop {
  id:           string
  label:        string
  sequence:     number
  plannedTime?: string
}

export interface TransportTrip {
  id:              string
  driverUid:       string
  serviceDate:     ServiceDate
  direction:       TransportDirection
  routeId:         string
  routeLabel:      string
  vehicleId?:      string
  vehicleLabel:    string
  scheduledTime:   string
  status:          TransportTripStatus
  stops:           TransportStop[]
  stopIds:         string[]
  currentStopId?:  string
  etaMinutes?:     number
  delayMinutes?:   number
  delayReason?:    string
  delayRevision?:  number
  delayUpdatedAt?: Timestamp
  incidentMessage?: string
  boardingAt?:     Timestamp
  startedAt?:      Timestamp
  arrivedAt?:      Timestamp
  completedAt?:    Timestamp
  cancelledAt?:    Timestamp
  createdAt?:      Timestamp
  updatedAt?:      Timestamp
}

export interface CreateTransportTripInput {
  driverUid:     string
  serviceDate:   ServiceDate
  direction:     TransportDirection
  routeId:       string
  routeLabel:    string
  vehicleId?:    string
  vehicleLabel:  string
  scheduledTime: string
  stops:         TransportStop[]
}

export type TransportPassengerStatus =
  | 'scheduled'
  | 'boarded'
  | 'dropped_off'
  | 'absent'
  | 'cancelled'

/**
 * Vue minimale d'un élève dans un trajet. Aucun parentUid, contact, note ou
 * absence n'est dupliqué. Le parent est autorisé via `eleves.parentUid` dans
 * les règles, jamais via une valeur contrôlée par le client.
 */
export interface TransportPassenger {
  id:            string
  tripId:        string
  eleveId:       string
  elevePrenom:   string
  eleveNom?:     string
  classe?:       string
  serviceDate:   ServiceDate
  direction:     TransportDirection
  routeLabel:    string
  vehicleLabel:  string
  scheduledTime: string
  stopId:        string
  stopLabel:     string
  status:        TransportPassengerStatus
  delayMinutes?: number
  delayRevision?: number
  delayUpdatedAt?: Timestamp
  boardedAt?:    Timestamp
  droppedOffAt?: Timestamp
  absentAt?:     Timestamp
  cancelledAt?:  Timestamp
  updatedAt?:    Timestamp
  createdAt?:    Timestamp
}

export interface AssignTransportPassengerInput {
  eleveId:       string
  elevePrenom:   string
  eleveNom?:     string
  classe?:       string
  stopId:        string
  stopLabel:     string
}

/** Noms courts conservés pour les écrans chauffeur. */
export type PickupTrip = TransportTrip
export type PickupPassenger = TransportPassenger
