import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Text, View } from 'react-native'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../config/firebase'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { decideAbsenceRequest, type AbsenceRequestDoc } from '../../services/absenceRequestsService'
import type { StaffLesson, StaffStackParamList } from '../../navigation/StaffStack'
import { StaffButton } from './staff-ui'
import { staffCopy } from './staff-copy'

type Row = { id: string; nom: string; prenom: string; status: 'present' | 'absent' | 'retard'; baseVersion: string }
export function useStaffClasses() {
  const [classes, setClasses] = useState<string[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => { let active = true; setLoading(true); setError(false)
    void httpsCallable<unknown, { classes: string[] }>(functions, 'getStaffClasses')({}).then(({ data }) => { if (active) setClasses(data.classes) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  return { classes, loading, error, refresh: () => setRetry(n => n + 1) }
}
export function StaffPrayerClassesScreen() {
  const { classes, loading, error, refresh } = useStaffClasses(), { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme()
  const nav = useNavigation<NativeStackNavigationProp<StaffStackParamList>>()
  return <ScreenLayout title={copy.prayer}><FlatList contentContainerStyle={{ padding: 20 }} data={classes} keyExtractor={value => value}
    ListHeaderComponent={<>{loading && <ActivityIndicator />}{error && <Text style={{ color: theme.danger }}>{copy.error}</Text>}<StaffButton title={copy.retry} onPress={refresh} /></>}
    ListEmptyComponent={!loading && !error ? <Text style={{ color: theme.text }}>{copy.empty}</Text> : null}
    renderItem={({ item }) => <StaffButton title={item} onPress={() => nav.navigate('StaffPrayer', { classe: item })} />} /></ScreenLayout>
}
export function StaffLessonsScreen() {
  const { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme(), nav = useNavigation<NativeStackNavigationProp<StaffStackParamList>>()
  const [lessons, setLessons] = useState<StaffLesson[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => { let active = true; setLoading(true); setError(false)
    void httpsCallable<unknown, { lessons: StaffLesson[] }>(functions, 'getStaffAttendanceLessons')({}).then(({ data }) => { if (active) setLessons(data.lessons) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  return <ScreenLayout title={copy.attendance}><FlatList contentContainerStyle={{ padding: 20 }} data={lessons} keyExtractor={item => `${item.teacherUid}:${item.lessonKey}`}
    ListHeaderComponent={<>{loading && <ActivityIndicator />}{error && <Text style={{ color: theme.danger }}>{copy.error}</Text>}<StaffButton title={copy.retry} onPress={() => setRetry(n => n + 1)} /></>}
    ListEmptyComponent={!loading && !error ? <Text style={{ color: theme.text }}>{copy.empty}</Text> : null}
    renderItem={({ item }) => <StaffButton title={`${item.classe} · ${item.seance}`} onPress={() => nav.navigate('StaffAttendance', item)} />} /></ScreenLayout>
}
export function StaffAttendanceScreen() {
  const { params } = useRoute<RouteProp<StaffStackParamList, 'StaffAttendance'>>(), { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme()
  const [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [retry, setRetry] = useState(0)
  const operation = useRef(''), busy = useRef(false)
  useEffect(() => { let active = true; setLoading(true); setError(''); setSaved(false)
    void httpsCallable<unknown, { students: Row[] }>(functions, 'loadAttendance')(params).then(({ data }) => { if (active) { setRows(data.students); operation.current = '' } }).catch(() => { if (active) setError(copy.error) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params.teacherUid, params.lessonKey, params.date, retry, copy.error])
  const save = async () => {
    if (busy.current || loading || !rows.length) return
    busy.current = true; setSaving(true); setError(''); setSaved(false)
    if (!operation.current) operation.current = doc(collection(db, '_ids')).id
    try {
      const { data } = await httpsCallable<unknown, { versions: Record<string, string> }>(functions, 'submitAttendance')({ ...params, operationId: operation.current, rows: rows.map(({ id, status, baseVersion }) => ({ id, status, baseVersion })) })
      setRows(current => current.map(row => ({ ...row, baseVersion: data.versions[row.id] }))); operation.current = ''; setSaved(true)
    } catch (failure) { setError((failure as { code?: string }).code?.includes('failed-precondition') ? copy.conflict : copy.error) }
    finally { busy.current = false; setSaving(false) }
  }
  return <ScreenLayout title={`${copy.attendance} · ${params.classe}`}><FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ padding: 20 }}
    ListHeaderComponent={<>{loading && <ActivityIndicator />}{error !== '' && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}{saved && <Text style={{ color: theme.success }}>{copy.saved}</Text>}<Text style={{ color: theme.text }}>{params.date} · {params.seance}</Text><StaffButton title={copy.retry} disabled={saving} onPress={() => setRetry(n => n + 1)} /></>}
    ListEmptyComponent={!loading && !error ? <Text style={{ color: theme.text }}>{copy.empty}</Text> : null}
    renderItem={({ item }) => <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}><Text style={{ color: theme.text }}>{item.nom} {item.prenom}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(['present', 'absent', 'retard'] as const).map(status => <StaffButton key={status} title={copy[status]} selected={item.status === status} disabled={saving || loading} onPress={() => { operation.current = ''; setSaved(false); setRows(current => current.map(row => row.id === item.id ? { ...row, status } : row)) }} />)}</View>
    </View>}
    ListFooterComponent={<StaffButton title={copy.save} disabled={saving || loading || rows.length === 0} onPress={() => { void save() }} />} /></ScreenLayout>
}
export function StaffDeclarationsScreen() {
  const { profile } = useAuth(), { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme()
  const [rows, setRows] = useState<(AbsenceRequestDoc & { id: string })[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [busy, setBusy] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => { setLoading(true); setError(false)
    return onSnapshot(query(collection(db, 'absenceRequests'), where('status', '==', 'pending')), snap => { setRows(snap.docs.map(d => ({ ...d.data(), id: d.id } as AbsenceRequestDoc & { id: string }))); setLoading(false) }, () => { setError(true); setLoading(false) })
  }, [retry])
  const decide = async (id: string, status: 'approved' | 'declined') => {
    if (!profile?.uid || busy) return
    setBusy(id); setError(false)
    try { await decideAbsenceRequest(id, status, profile.uid) } catch { setError(true) } finally { setBusy('') }
  }
  return <ScreenLayout title={copy.declarations}><FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ padding: 20 }}
    ListHeaderComponent={<>{loading && <ActivityIndicator />}{error && <Text style={{ color: theme.danger }}>{copy.error}</Text>}<StaffButton title={copy.retry} onPress={() => setRetry(n => n + 1)} /></>}
    ListEmptyComponent={!loading && !error ? <Text style={{ color: theme.text }}>{copy.empty}</Text> : null}
    renderItem={({ item }) => <View><Text style={{ color: theme.text }}>{item.eleveNom} · {item.classe} · {item.date}</Text><Text style={{ color: theme.textSoft }}>{item.reason}</Text>
      <StaffButton title={copy.approve} disabled={!!busy} onPress={() => { void decide(item.id, 'approved') }} /><StaffButton title={copy.decline} disabled={!!busy} onPress={() => { void decide(item.id, 'declined') }} /></View>} /></ScreenLayout>
}
