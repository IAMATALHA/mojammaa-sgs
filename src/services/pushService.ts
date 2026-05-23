/**
 * pushService — envoyer des notifications via l'API Expo Push.
 *
 * Doc : https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * On envoie directement depuis le device du prof (pas via Cloud Function)
 * pour simplifier le déploiement. C'est OK tant que le volume est faible.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushMessage {
  to:    string                   // ExpoPushToken
  title: string
  body:  string
  data?: Record<string, any>
  sound?: 'default' | null
}

export interface PushReceipt {
  status: 'ok' | 'error'
  id?:    string
  message?: string
  details?: any
}

/**
 * Envoie un (ou plusieurs) push. L'API Expo accepte un batch de 100 max ;
 * on chunke automatiquement.
 *
 * Retourne les receipts pour permettre la gestion d'erreur côté caller.
 */
export async function sendPush(messages: PushMessage[]): Promise<PushReceipt[]> {
  if (messages.length === 0) return []

  // Sécurité : ne garder que les tokens au format ExponentPushToken[...]
  const safe = messages.filter(m =>
    typeof m.to === 'string' && m.to.startsWith('ExponentPushToken')
  )
  if (safe.length === 0) return []

  // Format Expo : sound + title + body
  const payload = safe.map(m => ({
    to:    m.to,
    sound: m.sound ?? 'default',
    title: m.title,
    body:  m.body,
    data:  m.data,
  }))

  // Chunks of 100
  const out: PushReceipt[] = []
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: {
          'Accept':          'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type':    'application/json',
        },
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        out.push({ status: 'error', message: `HTTP ${res.status}` })
        continue
      }
      const json = await res.json()
      const data = Array.isArray(json?.data) ? json.data : []
      data.forEach((r: any) => out.push(r))
    } catch (e: any) {
      out.push({ status: 'error', message: e?.message || 'fetch failed' })
    }
  }
  return out
}
