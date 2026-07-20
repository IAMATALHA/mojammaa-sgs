/**
 * Frontière Firebase du suivi « classe vers la prière ».
 *
 * Le professeur décide manuellement, mais le départ passe par une callable
 * qui relit côté serveur son rôle, sa classe et son cours réellement en cours.
 * Les transitions suivantes restent protégées par les règles Firestore.
 */
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../config/firebase'
import { toDocs } from './firestore'
import type {
  PrayerClassSession,
  PrayerClassStatus,
  StartPrayerClassSessionInput,
} from '../types/prayer'
import type { ServiceDate } from '../types/pickup'

const PRAYER_SESSION_COLLECTION = 'prayerClassSessions'

function assertServiceDate(serviceDate: string): asserts serviceDate is ServiceDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new Error('Date de prière invalide.')
  }
}

function normalizedClasse(classe: string): string {
  const value = classe.trim()
  if (!value || value.length > 80 || value.includes('/')) throw new Error('Classe invalide.')
  return value
}

export function prayerClassSessionDocumentId(
  serviceDate: ServiceDate,
  classe: string,
): string {
  assertServiceDate(serviceDate)
  return `${serviceDate}_${normalizedClasse(classe)}`
}

/**
 * Demande au serveur d'ouvrir la session déterministe au statut `going`.
 */
export async function startPrayerClassSession(
  input: StartPrayerClassSessionInput,
): Promise<string> {
  const classe = normalizedClasse(input.classe)
  const start = httpsCallable<
    StartPrayerClassSessionInput,
    { id: string; status: PrayerClassStatus; changed: boolean }
  >(functions, 'startPrayerClassSession')
  const result = await start({ classe })
  if (!result.data?.id) throw new Error('Session de prière invalide.')
  return result.data.id
}

/** Avance uniquement `going → praying → returned`; les règles font foi. */
export async function advancePrayerClassSession(
  sessionId: string,
  nextStatus: Exclude<PrayerClassStatus, 'going'>,
): Promise<void> {
  const actorUid = auth.currentUser?.uid
  if (!actorUid) throw new Error('Session expirée.')
  if (!sessionId || sessionId.includes('/')) throw new Error('Session de prière invalide.')
  if (nextStatus !== 'praying' && nextStatus !== 'returned') {
    throw new Error('Transition de prière invalide.')
  }

  const transition = nextStatus === 'praying'
    ? { prayingAt: serverTimestamp(), prayingByUid: actorUid }
    : { returnedAt: serverTimestamp(), returnedByUid: actorUid }
  await updateDoc(doc(db, PRAYER_SESSION_COLLECTION, sessionId), {
    status: nextStatus,
    ...transition,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Session de la classe pour la date.
 *
 * Une requête bornée est volontairement utilisée, plutôt qu'un get direct :
 * les Rules peuvent ainsi prouver la classe autorisée même quand aucun
 * document n'existe encore (état idle).
 */
export function subscribePrayerClassSession(
  serviceDate: ServiceDate,
  classe: string,
  onChange: (session: PrayerClassSession | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  assertServiceDate(serviceDate)
  const safeClasse = normalizedClasse(classe)
  return onSnapshot(
    query(
      collection(db, PRAYER_SESSION_COLLECTION),
      where('serviceDate', '==', serviceDate),
      where('classe', '==', safeClasse),
      orderBy('startedAt', 'desc'),
      limit(1),
    ),
    snapshot => onChange(toDocs<Omit<PrayerClassSession, 'id'>>(snapshot)[0] ?? null),
    error => onError?.(error),
  )
}

/** Session encore active (`going`/`praying`) pour la classe et la date. */
export function subscribeActivePrayerClassSession(
  serviceDate: ServiceDate,
  classe: string,
  onChange: (session: PrayerClassSession | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return subscribePrayerClassSession(
    serviceDate,
    classe,
    session => onChange(session && session.status !== 'returned' ? session : null),
    onError,
  )
}

/** Vue temps réel de toutes les sessions du jour, réservée aux admins. */
export function subscribePrayerClassSessionsForDay(
  serviceDate: ServiceDate,
  onChange: (sessions: PrayerClassSession[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  assertServiceDate(serviceDate)
  return onSnapshot(
    query(
      collection(db, PRAYER_SESSION_COLLECTION),
      where('serviceDate', '==', serviceDate),
      orderBy('startedAt', 'asc'),
    ),
    snapshot => onChange(toDocs<Omit<PrayerClassSession, 'id'>>(snapshot)),
    error => onError?.(error),
  )
}
