import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { httpsCallable } from 'firebase/functions'
import { useTranslation } from 'react-i18next'
import { functions } from '../../config/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { subscribeMessages } from '../../services/messagesService'
import type { AppointmentMode } from '../../services/appointments-service'
import TeacherActionPanel from './teacher-action-panel'

export type DashboardAction = { kind: 'homework' | 'absences' | 'attendance' | 'reviews' | 'delivery' | 'appointments' | 'messages'; count: number; classe?: string; seance?: string; lessonKey?: string; date?: string }
type Result = { actions: DashboardAction[]; checkedAt: number; nextAppointment: { date: string; time: string } | null }
export default function ActionCenter({ mode, onAction }: { mode: AppointmentMode; onAction: (action: DashboardAction) => void }) {
  const theme = useTheme(), { t, i18n } = useTranslation(), { profile } = useAuth()
  const [result, setResult] = useState<Result | null>(null), [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true), [unread, setUnread] = useState<number | null>(null), [messageError, setMessageError] = useState(false)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    try {
      const response = await httpsCallable<{ mode: AppointmentMode }, Result>(functions, 'getDashboardActions', { timeout: 15_000 })({ mode })
      if (generation.current === current) { setResult(response.data); setFailed(false) }
    } catch { if (generation.current === current) setFailed(true) }
    finally { if (generation.current === current) setLoading(false) }
  }, [mode, profile?.uid])
  useEffect(() => {
    setResult(null); setUnread(null); setMessageError(false)
    if (!profile?.uid) return
    const uid = profile.uid
    return subscribeMessages(uid, mode === 'teacher' ? 'professeur' : mode, rows => {
      setUnread(rows.filter(row => row.fromId !== uid && !(row.readBy || []).includes(uid)).length); setMessageError(false)
    }, () => setMessageError(true))
  }, [profile?.uid, mode, retry])
  useFocusEffect(useCallback(() => {
    void refresh()
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh() }, 60_000)
    const active = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    return () => { generation.current++; clearInterval(timer); active.remove() }
  }, [refresh]))
  const rows = [...(result?.actions || []), ...(unread ? [{ kind: 'messages' as const, count: unread }] : [])]
  if (mode === 'teacher') return <TeacherActionPanel rows={rows} loading={loading} failed={failed || messageError}
    complete={!loading && !failed && !messageError && unread !== null && !!result}
    checkedAt={result?.checkedAt} nextAppointment={result?.nextAppointment}
    onRefresh={() => { setRetry(n => n + 1); void refresh() }} onAction={onAction} />
  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 10, marginBottom: 16 }}>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 16 }}>{t('actionCenter.title')}</Text>
      {(failed || messageError) && <Text style={{ color: theme.danger }}>{t('actionCenter.failed')}</Text>}
      {loading && !result && <ActivityIndicator color={theme.primary} />}
      {!loading && !failed && !messageError && unread !== null && rows.length === 0 && <Text style={{ color: theme.textSoft }}>{t('actionCenter.clear')}</Text>}
      {rows.map((row, index) => (
        <Pressable key={`${row.kind}:${index}`} accessibilityRole="button" onPress={() => onAction(row)} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 3 }}>
          <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{t(`actionCenter.${row.kind}`, { count: row.count, classe: row.classe, seance: row.seance })}</Text>
          {row.date && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{row.date}</Text>}
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onAction({ kind: 'appointments', count: 0 })} style={{ minHeight: 44, justifyContent: 'center', gap: 3 }}>
        <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{t('appointments.title')}</Text>
        {result?.nextAppointment && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{t('actionCenter.nextMeeting', result.nextAppointment)}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setRetry(n => n + 1); void refresh() }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: theme.textSoft, fontSize: 12 }}>{t('actionCenter.refresh')}{result?.checkedAt ? ` · ${new Date(result.checkedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
      </Pressable>
    </View>
  )
}
