import React, { useCallback, useRef, useState } from 'react'
import { Alert, AppState } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../config/firebase'
import { useTheme } from '../../contexts/ThemeContext'
import type { AdminDashboardNav } from '../../navigation/types'
import type { AppliedScope, StatsScope } from '../../types/stats'
import type { AbsenceDoc } from '../../services/absencesService'
import { toDocs } from '../../services/firestore'
import { getJourScolaire, getJoursScolaires } from '../../services/calendarService'
import { localISODate } from '../../utils/academicPeriod'
import { buildTodayRollCallSessions, rollCallSessionKey, type RollCallSlot } from '../../utils/rollCalls'
import { summarizeAdminHome } from '../../utils/admin-home-summary'
import { adminHomeCopy } from '../../utils/admin-home-copy'
import AdminHomeView, { type AdminHomeData } from '../../components/dashboard/admin-home-view'

export default function AdminDashboardScreen() {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const nav = useNavigation<AdminDashboardNav>()
  const [data, setData] = useState<AdminHomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openingStudents, setOpeningStudents] = useState(false)
  const request = useRef(0)
  const focused = useRef(false)
  const directoryRequest = useRef(false)

  const load = useCallback(async () => {
    const id = ++request.current
    const today = localISODate()
    setData(previous => previous && localISODate(new Date(previous.updatedAt)) !== today ? null : previous)
    setLoading(true)
    setError(false)
    try {
      const horizon = new Date()
      horizon.setDate(horizon.getDate() + 60)
      const [jour, calendar, attendance, schedule] = await Promise.all([
        getJourScolaire(today),
        getJoursScolaires(today, localISODate(horizon)),
        getDocs(query(collection(db, 'absences'), where('date', '==', today))),
        getDocs(collection(db, 'emploiDuTemps')),
      ])
      if (id !== request.current || !focused.current) return
      const absent = new Set<string>()
      const pointed = new Set<string>()
      const completed = new Set<string>()
      for (const record of toDocs<AbsenceDoc>(attendance)) {
        if (record.eleveId) {
          pointed.add(record.eleveId)
          if (record.statut === 'absent') absent.add(record.eleveId)
        }
        if (record.classe && record.seance) completed.add(rollCallSessionKey(record.classe, record.seance))
      }
      const now = new Date()
      const summary = summarizeAdminHome(
        buildTodayRollCallSessions(toDocs<RollCallSlot>(schedule), completed, now),
        Boolean(jour?.annuleCours),
      )
      const event = calendar.find(day => day.date > today && day.type !== 'normal' && day.label.trim())
      setData({ ...summary, absents: absent.size, pointed: pointed.size, updatedAt: now.getTime(),
        dayLabel: jour?.label, event: event ? { date: event.date, label: event.label } : undefined })
    } catch {
      if (id === request.current && focused.current) setError(true)
    } finally {
      if (id === request.current && focused.current) setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    focused.current = true
    void load()
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load()
    })
    return () => { focused.current = false; request.current++; subscription.remove() }
  }, [load]))

  const openStudents = async () => {
    if (directoryRequest.current) return
    directoryRequest.current = true
    setOpeningStudents(true)
    try {
      // The existing directory requires the scope actually returned by the server.
      const result = await httpsCallable<StatsScope, { applied: AppliedScope }>(functions, 'getFilteredSchoolStats', { timeout: 15000 })({
        period: 'mois', cycle: '', niveau: '', classe: '', matiere: '',
      })
      if (!result.data.applied) throw new Error('Missing scope')
      if (focused.current) nav.navigate('AdminScopeStudents', { scope: result.data.applied, segment: 'all' })
    } catch {
      if (focused.current) Alert.alert(adminHomeCopy(i18n.language).directoryError)
    } finally {
      directoryRequest.current = false
      setOpeningStudents(false)
    }
  }

  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.surface }}>
    <StatusBar style="dark" />
    <AdminHomeView language={i18n.language} data={data} loading={loading} error={error}
      openingStudents={openingStudents} onRefresh={() => { void load() }}
      onAbsences={() => nav.navigate('AdminAbsences')}
      onCalls={classe => nav.navigate('AdminRollCalls', classe ? { classe } : undefined)}
      onStudents={() => { void openStudents() }}
      onTeachers={() => nav.navigate('AdminUsers', { role: 'professeur' })}
      onMessage={() => nav.navigate('AdminMessages', { initialTab: 'inbox' })}
      onHomework={() => nav.navigate('AdminDevoirs')}
      onCalendar={() => nav.navigate('AdminCalendarTab')} />
  </SafeAreaView>
}
