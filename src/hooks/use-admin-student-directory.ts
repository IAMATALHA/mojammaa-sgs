import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'
import type { AdminDashboardNav } from '../navigation/types'
import type { AppliedScope, StatsScope } from '../types/stats'
import { adminHomeCopy } from '../utils/admin-home-copy'

/** Resolve the actual server scope before entering the existing student directory. */
export function useAdminStudentDirectory() {
  const nav = useNavigation<AdminDashboardNav>()
  const { i18n } = useTranslation()
  const [openingStudents, setOpeningStudents] = useState(false)
  const request = useRef(0)
  const busy = useRef(false)

  useFocusEffect(useCallback(() => {
    setOpeningStudents(false)
    return () => { request.current++; busy.current = false }
  }, []))

  const openStudents = async (focusSearch = false) => {
    if (busy.current) return
    const id = ++request.current
    busy.current = true
    setOpeningStudents(true)
    try {
      const result = await httpsCallable<StatsScope, { applied: AppliedScope }>(functions, 'getFilteredSchoolStats', { timeout: 15000 })({
        period: 'mois', cycle: '', niveau: '', classe: '', matiere: '',
      })
      if (!result.data.applied) throw new Error('Missing scope')
      if (id === request.current) nav.navigate('AdminScopeStudents', { scope: result.data.applied, segment: 'all', focusSearch })
    } catch {
      if (id === request.current) Alert.alert(adminHomeCopy(i18n.language).directoryError)
    } finally {
      if (id === request.current) {
        busy.current = false
        setOpeningStudents(false)
      }
    }
  }

  return { openingStudents, openStudents }
}
