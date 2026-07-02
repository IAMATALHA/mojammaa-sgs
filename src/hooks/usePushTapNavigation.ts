/**
 * usePushTapNavigation — ouvre le bon écran quand l'utilisateur TAPE une
 * notification push (app au premier plan, en arrière-plan ou tuée).
 *
 * La CF `onMessageCreated` met `{ messageId, type }` dans le payload data ;
 * on route vers l'écran Messages du rôle courant avec `messageId` en param,
 * et l'écran ouvre le détail du message dès qu'il apparaît dans la liste.
 *
 * Démarrage à froid : la réponse est récupérée via
 * getLastNotificationResponseAsync() puis effacée (clearLastNotification-
 * ResponseAsync) pour ne pas re-naviguer à chaque remontage.
 */
import { useEffect, useRef, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import { navigationRef } from '../navigation/navigationRef'

type RoleLogic = 'admin' | 'teacher' | 'student'

function navigateToMessages(role: RoleLogic, messageId?: string) {
  if (!navigationRef.isReady()) return false
  const params = messageId ? { messageId } : undefined
  if (role === 'admin') {
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

export function usePushTapNavigation(role: RoleLogic | null, enabled: boolean) {
  // Tap reçu avant que la nav/le rôle soient prêts (cold start) → en attente.
  const pending = useRef<{ messageId?: string } | null>(null)

  const roleRef = useRef<RoleLogic | null>(role)
  const enabledRef = useRef(enabled)
  roleRef.current = role
  enabledRef.current = enabled

  const flush = useCallback(() => {
    if (!pending.current || !enabledRef.current || !roleRef.current) return
    if (navigateToMessages(roleRef.current, pending.current.messageId)) {
      pending.current = null
    }
  }, [])

  // Une même notification ne doit jamais être traitée deux fois : sur Android,
  // l'intent de lancement reste attaché à la tâche et
  // getLastNotificationResponseAsync() RE-RENVOIE le vieux tap à chaque
  // démarrage à froid (clearLastNotificationResponseAsync ne purge que le
  // cache JS) → l'app « retombait » sur Messages après chaque login.
  const handledId = useRef<string | null>(null)
  // Fenêtre de lancement : sur Android, le listener PEUT aussi re-recevoir la
  // réponse de l'intent recyclé dans les premières secondes du démarrage.
  const startedAt = useRef(Date.now())

  const handleResponse = useCallback((response: Notifications.NotificationResponse | null, coldStart = false) => {
    if (!response) return
    const id = response.notification?.request?.identifier || null
    if (id && handledId.current === id) return
    const inLaunchWindow = Date.now() - startedAt.current < 8000
    if (coldStart || inLaunchWindow) {
      // Au démarrage : n'honorer qu'un tap FRAIS (< 2 min) — au-delà, c'est
      // l'intent recyclé d'une vieille notification, pas une intention.
      // (Un vrai tap sur une vieille notification, app déjà ouverte, passe
      // par le listener HORS fenêtre de lancement → toujours honoré.)
      const raw = response.notification?.date
      const ms = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : 0
      if (!ms || Date.now() - ms > 2 * 60_000) return
    }
    handledId.current = id
    const data = response.notification?.request?.content?.data as Record<string, unknown> | undefined
    const messageId = typeof data?.messageId === 'string' ? data.messageId : undefined
    pending.current = { messageId }
    flush()
  }, [flush])

  // Tap pendant que l'app tourne (foreground/background).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse)
    return () => sub.remove()
  }, [handleResponse])

  // Démarrage à froid : notification qui a LANCÉ l'app.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then(resp => {
        if (!resp) return
        handleResponse(resp, true)
        // Effacer pour ne pas re-déclencher au prochain mount/refresh.
        Notifications.clearLastNotificationResponseAsync().catch(() => {})
      })
      .catch(() => {})
  }, [handleResponse])

  // Le rôle/la nav deviennent prêts après le tap → flush.
  useEffect(() => { flush() }, [role, enabled, flush])
}
