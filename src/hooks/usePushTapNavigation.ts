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

  const handleResponse = useCallback((response: Notifications.NotificationResponse | null) => {
    if (!response) return
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
        handleResponse(resp)
        // Effacer pour ne pas re-déclencher au prochain mount/refresh.
        Notifications.clearLastNotificationResponseAsync().catch(() => {})
      })
      .catch(() => {})
  }, [handleResponse])

  // Le rôle/la nav deviennent prêts après le tap → flush.
  useEffect(() => { flush() }, [role, enabled, flush])
}
