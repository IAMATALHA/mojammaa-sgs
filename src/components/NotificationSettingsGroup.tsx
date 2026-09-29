import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { notificationDiagnostics, registerForPushNotificationsAsync } from '../services/NotificationService'

export default function NotificationSettingsGroup() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [status, setStatus] = useState<Awaited<ReturnType<typeof notificationDiagnostics>> | 'checking'>('checking')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    try { setStatus(await notificationDiagnostics()) } catch { setStatus('unregistered') }
  }, [])
  useEffect(() => {
    void refresh()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    return () => listener.remove()
  }, [refresh])
  const activate = async () => {
    if (!profile?.uid || busy) return
    setBusy(true)
    try { await registerForPushNotificationsAsync(profile.uid, true, { force: true }); await refresh() }
    finally { setBusy(false) }
  }
  return (
    <View style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, marginBottom: 14, gap: 8 }}>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 14 }}>{t('notificationSettings.title')}</Text>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.textSoft, fontSize: 13, lineHeight: 19 }}>{t(`notificationSettings.${status}`)}</Text>
      {status !== 'unsupported' && (
        <>
          <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>{t('notificationSettings.language')}</Text>
          <Pressable disabled={busy} accessibilityRole="button" onPress={() => void activate().catch(() => setStatus('unregistered'))} style={{ minHeight: 44, justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color={theme.primary} /> : <Text style={{ color: theme.primary, fontFamily: theme.fonts.bold }}>{t('notificationSettings.refresh')}</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings().catch(() => Alert.alert(t('common.error'), t('notificationSettings.openFailed')))} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{t('notificationSettings.systemSettings')}</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}
