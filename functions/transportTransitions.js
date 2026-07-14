'use strict'

const { FieldValue } = require('firebase-admin/firestore')

const TRANSITIONS = Object.freeze({
  scheduled: new Set(['boarding', 'cancelled']),
  boarding: new Set(['in_transit', 'cancelled']),
  in_transit: new Set(['arrived']),
  arrived: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set(),
})

const TRANSITION_TIMESTAMPS = Object.freeze({
  boarding: 'boardingAt',
  in_transit: 'startedAt',
  arrived: 'arrivedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
})

class TransportTransitionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TransportTransitionError'
    this.code = code
  }
}

function isKnownStatus(status) {
  return typeof status === 'string' && Object.hasOwn(TRANSITIONS, status)
}

function canTransitionTrip(currentStatus, nextStatus) {
  return isKnownStatus(currentStatus)
    && isKnownStatus(nextStatus)
    && (currentStatus === nextStatus || TRANSITIONS[currentStatus].has(nextStatus))
}

function assertPassengerInvariant(nextStatus, statuses) {
  if (!Array.isArray(statuses)) {
    throw new TransportTransitionError('internal', 'Passenger state unavailable.')
  }

  if (nextStatus === 'in_transit') {
    const allowed = new Set(['boarded', 'absent', 'cancelled'])
    if (statuses.length === 0 || statuses.some((status) => !allowed.has(status))) {
      throw new TransportTransitionError(
        'failed-precondition',
        'Every passenger must be boarded, absent, or cancelled before departure.',
      )
    }
  }

  if (nextStatus === 'completed') {
    const terminal = new Set(['dropped_off', 'absent', 'cancelled'])
    if (statuses.length === 0 || statuses.some((status) => !terminal.has(status))) {
      throw new TransportTransitionError(
        'failed-precondition',
        'Every passenger must have a terminal status before completion.',
      )
    }
  }

  // Annulation possible avant départ seulement, tant que personne n'est à bord.
  if (nextStatus === 'cancelled') {
    const cancellable = new Set(['scheduled', 'absent', 'cancelled'])
    if (statuses.some((status) => !cancellable.has(status))) {
      throw new TransportTransitionError(
        'failed-precondition',
        'A trip with a boarded passenger cannot be cancelled.',
      )
    }
  }
}

/**
 * Transition sécurisée d'une tournée.
 *
 * L'identité vient exclusivement du contexte authentifié. La tournée, le
 * profil chauffeur et la requête passagers sont lus dans la même transaction :
 * une mutation passager concurrente force ainsi un retry avant la fin.
 */
async function transitionTransportTrip(db, { uid, tripId, nextStatus }) {
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new TransportTransitionError('unauthenticated', 'Sign in required.')
  }
  if (typeof tripId !== 'string' || tripId.length === 0 || tripId.length > 200) {
    throw new TransportTransitionError('invalid-argument', 'Invalid trip.')
  }
  if (!isKnownStatus(nextStatus) || nextStatus === 'scheduled') {
    throw new TransportTransitionError('invalid-argument', 'Invalid trip status.')
  }

  const tripRef = db.collection('transportTrips').doc(tripId)
  const userRef = db.collection('users').doc(uid)
  const driverRef = db.collection('driverProfiles').doc(uid)

  return db.runTransaction(async (transaction) => {
    const tripSnap = await transaction.get(tripRef)
    const userSnap = await transaction.get(userRef)
    const driverSnap = await transaction.get(driverRef)

    if (!tripSnap.exists) {
      throw new TransportTransitionError('not-found', 'Trip not found.')
    }

    const trip = tripSnap.data() || {}
    const isAdmin = userSnap.exists && userSnap.get('role') === 'admin'
    const isAssignedDriver = driverSnap.exists
      && driverSnap.get('active') === true
      && trip.driverUid === uid

    if (!isAdmin && !isAssignedDriver) {
      throw new TransportTransitionError('permission-denied', 'Trip access denied.')
    }

    const currentStatus = trip.status
    if (!canTransitionTrip(currentStatus, nextStatus)) {
      throw new TransportTransitionError('failed-precondition', 'Invalid trip transition.')
    }

    // Retry idempotent : ne jamais réécrire l'horodatage original.
    if (currentStatus === nextStatus) {
      return { changed: false, status: currentStatus }
    }

    if (['in_transit', 'completed', 'cancelled'].includes(nextStatus)) {
      const passengerSnap = await transaction.get(tripRef.collection('passengers'))
      const passengerStatuses = passengerSnap.docs.map((passenger) => passenger.get('status'))
      assertPassengerInvariant(nextStatus, passengerStatuses)
    }

    const timestampField = TRANSITION_TIMESTAMPS[nextStatus]
    transaction.update(tripRef, {
      status: nextStatus,
      [timestampField]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return { changed: true, status: nextStatus }
  })
}

/** Met à jour le retard et sa projection parent-safe dans une transaction. */
async function reportTransportTripDelay(db, { uid, tripId, delayMinutes, reason }) {
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new TransportTransitionError('unauthenticated', 'Sign in required.')
  }
  if (typeof tripId !== 'string' || tripId.length === 0 || tripId.length > 200) {
    throw new TransportTransitionError('invalid-argument', 'Invalid trip.')
  }
  const minutes = Math.round(Number(delayMinutes))
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 180) {
    throw new TransportTransitionError('invalid-argument', 'Invalid delay.')
  }
  const cleanReason = typeof reason === 'string' ? reason.trim() : ''
  if (cleanReason.length > 160) {
    throw new TransportTransitionError('invalid-argument', 'Delay reason is too long.')
  }

  const tripRef = db.collection('transportTrips').doc(tripId)
  const userRef = db.collection('users').doc(uid)
  const driverRef = db.collection('driverProfiles').doc(uid)

  return db.runTransaction(async (transaction) => {
    const tripSnap = await transaction.get(tripRef)
    const userSnap = await transaction.get(userRef)
    const driverSnap = await transaction.get(driverRef)
    if (!tripSnap.exists) {
      throw new TransportTransitionError('not-found', 'Trip not found.')
    }

    const trip = tripSnap.data() || {}
    const isAdmin = userSnap.exists && userSnap.get('role') === 'admin'
    const isAssignedDriver = driverSnap.exists
      && driverSnap.get('active') === true
      && trip.driverUid === uid
    if (!isAdmin && !isAssignedDriver) {
      throw new TransportTransitionError('permission-denied', 'Trip access denied.')
    }
    if (['completed', 'cancelled'].includes(trip.status)) {
      throw new TransportTransitionError('failed-precondition', 'Trip is closed.')
    }

    const previousMinutes = Number(trip.delayMinutes || 0)
    const previousReason = typeof trip.delayReason === 'string' ? trip.delayReason : ''
    if (previousMinutes === minutes && previousReason === cleanReason) {
      return {
        changed: false,
        delayMinutes: minutes,
        revision: Number.isInteger(trip.delayRevision) ? trip.delayRevision : 0,
      }
    }

    const passengerSnap = await transaction.get(tripRef.collection('passengers'))
    if (passengerSnap.size > 450) {
      throw new TransportTransitionError('resource-exhausted', 'Too many passengers.')
    }
    const revision = (Number.isInteger(trip.delayRevision) ? trip.delayRevision : 0) + 1
    const tripUpdate = {
      delayMinutes: minutes,
      delayRevision: revision,
      delayUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      delayReason: cleanReason || FieldValue.delete(),
    }
    transaction.update(tripRef, tripUpdate)
    passengerSnap.docs.forEach((passenger) => {
      transaction.update(passenger.ref, {
        delayMinutes: minutes,
        delayRevision: revision,
        delayUpdatedAt: FieldValue.serverTimestamp(),
      })
    })

    return { changed: true, delayMinutes: minutes, revision }
  })
}

module.exports = {
  TransportTransitionError,
  assertPassengerInvariant,
  canTransitionTrip,
  reportTransportTripDelay,
  transitionTransportTrip,
}
