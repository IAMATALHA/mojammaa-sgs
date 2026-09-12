import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { AppState } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { listAppointments, type Appointment, type AppointmentMode } from '../services/appointments-service'

export function useAppointments(mode: AppointmentMode, history = false) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Appointment[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    if (!profile?.uid) { setRows([]); setCursor(null); setLoading(false); return }
    setLoading(true)
    try {
      const result = await listAppointments(mode, history)
      if (current === generation.current) { setRows(result.rows); setCursor(result.cursor); setError(false) }
    } catch { if (current === generation.current) { setRows([]); setCursor(null); setError(true) } }
    finally { if (current === generation.current) setLoading(false) }
  }, [mode, history, profile?.uid])
  useEffect(() => { setRows([]); setCursor(null); setError(false); return () => { generation.current++ } }, [profile?.uid, mode, history])
  useFocusEffect(useCallback(() => {
    void refresh()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh() })
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh() }, 60_000)
    return () => { generation.current++; listener.remove(); clearInterval(timer) }
  }, [refresh]))
  const more = async () => {
    if (!cursor || loading) return
    const current = ++generation.current
    setLoading(true)
    try {
      const result = await listAppointments(mode, history, cursor)
      if (current === generation.current) { setRows(old => [...new Map([...old, ...result.rows].map(row => [row.id, row])).values()]); setCursor(result.cursor); setError(false) }
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setLoading(false) }
  }
  return { rows, loading, error, refresh, more, hasMore: !!cursor }
}
