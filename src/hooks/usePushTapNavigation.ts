/**
 * usePushTapNavigation — ouvre le bon écran quand l'utilisateur TAPE une
 * notification push (app au premier plan, en arrière-plan ou tuée).
 *
 * Les messages ouvrent leur détail. Les notifications Smart Pickup et
 * transport ouvrent l'écran parent de sortie/suivi, sans transporter d'ID
 * sensible dans le payload.
 *
 * Démarrage à froid : la réponse est récupérée via
 * getLastNotificationResponseAsync() puis effacée (clearLastNotification-
 * ResponseAsync) pour ne pas re-naviguer à chaque remontage.
 *
 * Intent Android rejoué : reconnu à l'identifiant de la notification, déjà
 * traité lors d'un lancement précédent (liste conservée sur le téléphone) —
 * plus à l'âge de la notification. Un vrai tap, aujourd'hui, sur une
 * notification d'il y a une heure ouvre donc bien le message (audit
 * 2026-10-15, A01).
 */
import { useEffect, useRef, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { navigationRef } from '../navigation/navigationRef'

const HANDLED_KEY = 'pushTap.handledIds'
const HANDLED_MAX = 30

async function readHandledIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
  } catch { return [] }
}

type MessageRole = 'staff' | 'admin' | 'teacher' | 'student'
type PushIntent =
  | { kind: 'message'; messageId: string; workspace?: 'parent' }
  | { kind: 'pickup'; workspace: 'parent' }

interface PushWorkspaceOptions {
  canOpenParentWorkspace: boolean
  openParentWorkspace: () => void
}

function navigateToMessages(role: MessageRole, messageId?: string) {
  if (!navigationRef.isReady()) return false
  const params = messageId ? { messageId } : undefined
  if (role === 'staff') {
    navigationRef.navigate('StaffMessages', params)
  } else if (role === 'admin') {
    navigationRef.navigate('AdminTabs', { screen: 'AdminMessages', params })
  } else if (role === 'teacher') {
    navigationRef.navigate('TeacherTabs', { screen: 'TeacherMessages', params })
  } else {
    // Côté parent, la racine EST le Tab.Navigator : StudentMessages est un
    // onglet de premier niveau, on navigue donc directement (voir StudentStack).
    navigationRef.navigate('StudentMessages', params)
  }
  return true
}

function navigateToPickup(role: MessageRole) {
  if (!navigationRef.isReady() || role !== 'student') return false
  // Module reporté : les anciennes notifications restent sans lien cassé.
  navigationRef.navigate('HomeTab', { screen: 'StudentHome' })
  return true
}

function navigateIntent(role: MessageRole, intent: PushIntent) {
  return intent.kind === 'pickup'
    ? navigateToPickup(role)
    : navigateToMessages(role, intent.messageId)
}

export function usePushTapNavigation(
  role: MessageRole | null,
  enabled: boolean,
  workspaceOptions?: PushWorkspaceOptions,
) {
  // Tap reçu avant que la nav/le rôle soient prêts (cold start) → en attente.
  const pending = useRef<PushIntent | null>(null)

  const roleRef = useRef<MessageRole | null>(role)
  const enabledRef = useRef(enabled)
  const canOpenParentRef = useRef(workspaceOptions?.canOpenParentWorkspace === true)
  const openParentRef = useRef(workspaceOptions?.openParentWorkspace)
  roleRef.current = role
  enabledRef.current = enabled
  canOpenParentRef.current = workspaceOptions?.canOpenParentWorkspace === true
  openParentRef.current = workspaceOptions?.openParentWorkspace

  const requestRequiredWorkspace = useCallback(() => {
    if (
      pending.current?.workspace === 'parent'
      && roleRef.current !== 'student'
      && canOpenParentRef.current
    ) {
      openParentRef.current?.()
      return true
    }
    return false
  }, [])

  const flush = useCallback(() => {
    if (pending.current?.workspace === 'parent' && roleRef.current !== 'student') return
    if (!pending.current || !enabledRef.current || !roleRef.current) return
    if (navigateIntent(roleRef.current, pending.current)) {
      pending.current = null
    }
  }, [])

  // Une même notification ne doit jamais être traitée deux fois : sur Android,
  // l'intent de lancement reste attaché à la tâche et
  // getLastNotificationResponseAsync() RE-RENVOIE le vieux tap à chaque
  // démarrage à froid (clearLastNotificationResponseAsync ne purge que le
  // cache JS) → l'app « retombait » sur Messages après chaque login. Les
  // identifiants traités sont donc conservés d'un lancement à l'autre.
  const handledIds = useRef<Promise<string[]> | null>(null)
  if (!handledIds.current) handledIds.current = readHandledIds()
  // Garde synchrone : le listener et getLastNotificationResponseAsync peuvent
  // livrer la même réponse au démarrage, avant la fin de la lecture ci-dessus.
  const seenThisRun = useRef(new Set<string>())

  const handleResponse = useCallback(async (response: Notifications.NotificationResponse | null) => {
    if (!response) return
    const id = response.notification?.request?.identifier || null
    if (id) {
      if (seenThisRun.current.has(id)) return
      seenThisRun.current.add(id)
      const known = await handledIds.current!
      if (known.includes(id)) return
      const next = [...known, id].slice(-HANDLED_MAX)
      handledIds.current = Promise.resolve(next)
      AsyncStorage.setItem(HANDLED_KEY, JSON.stringify(next)).catch(() => {})
    } else {
      // Sans identifiant, impossible de reconnaître un intent rejoué : on
      // n'honore qu'un tap frais (< 2 min).
      const raw = response.notification?.date
      const ms = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : 0
      if (!ms || Date.now() - ms > 2 * 60_000) return
    }
    const data = response.notification?.request?.content?.data as Record<string, unknown> | undefined
    const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined
    const type = typeof data?.type === 'string' ? data.type : ''
    if (['pickup_status', 'transport_passenger_status', 'transport_delay'].includes(type)) {
      pending.current = { kind: 'pickup', workspace: 'parent' }
    } else if (messageId) {
      pending.current = {
        kind: 'message',
        messageId,
        workspace: data?.workspace === 'parent' ? 'parent' : undefined,
      }
    } else {
      return
    }
    requestRequiredWorkspace()
    flush()
  }, [flush, requestRequiredWorkspace])

  // Tap pendant que l'app tourne (foreground/background).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => { void handleResponse(response) })
    return () => sub.remove()
  }, [handleResponse])

  // Démarrage à froid : notification qui a LANCÉ l'app.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then(async resp => {
        if (!resp) return
        await handleResponse(resp)
        // Effacer pour ne pas re-déclencher au prochain mount/refresh.
        Notifications.clearLastNotificationResponseAsync().catch(() => {})
      })
      .catch(() => {})
  }, [handleResponse])

  // Le rôle/la nav deviennent prêts après le tap → flush.
  useEffect(() => {
    requestRequiredWorkspace()
    flush()
  }, [
    role,
    enabled,
    workspaceOptions?.canOpenParentWorkspace,
    requestRequiredWorkspace,
    flush,
  ])
}
