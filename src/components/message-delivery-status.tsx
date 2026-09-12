import React, { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import { retryMessageDelivery, type MessageDoc } from '../services/messagesService'

export default function MessageDeliveryStatus({ message, allowRetry = false }: { message: MessageDoc; allowRetry?: boolean }) {
  const { t } = useTranslation()
  const theme = useTheme()
  const [retrying, setRetrying] = useState(false)
  const status = message.push?.status || 'saved'
  const issue = ['no_recipient', 'no_device', 'failed', 'partial_failure', 'blocked'].includes(status)
  const canRetry = allowRetry && !!message.id && issue && status !== 'blocked'
  const retry = async () => {
    if (!message.id || retrying) return
    setRetrying(true)
    try {
      const queued = await retryMessageDelivery(message.id)
      Alert.alert(t(queued ? 'communication.retryQueued' : 'communication.retryUnavailable'))
    } catch { Alert.alert(t('common.error'), t('communication.sendFailed')) }
    finally { setRetrying(false) }
  }
  return (
    <View style={{ marginTop: 8, gap: 3 }}>
      <Text style={{ color: issue ? theme.danger : theme.textSoft, fontSize: 12 }}>
        {t(`communication.delivery.${status}`)}
      </Text>
      {!!message.push?.recipients && (
        <Text style={{ color: theme.textSoft, fontSize: 11 }}>
          {t('communication.deliveryCounts', {
            sent: message.push.transmitted || 0, total: message.push.recipients,
          })}
        </Text>
      )}
      {canRetry && (
        <Pressable onPress={retry} disabled={retrying} accessibilityRole="button"
          accessibilityLabel={t('communication.retry')} accessibilityState={{ disabled: retrying, busy: retrying }}
          style={{ alignSelf: 'flex-start', paddingVertical: 12 }}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('communication.retry')}</Text>
        </Pressable>
      )}
    </View>
  )
}
