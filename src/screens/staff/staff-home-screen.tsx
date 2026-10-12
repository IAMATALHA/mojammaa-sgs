import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, ScrollView, Text } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { httpsCallable } from 'firebase/functions'
import { subscribeMessages } from '../../services/messagesService'
import { functions } from '../../config/firebase'
import ScreenLayout from '../../components/ScreenLayout'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/driver-workspace-context'
import { useTheme } from '../../contexts/ThemeContext'
import { hasRight } from '../../utils/staff-rights'
import { staffPages } from '../../utils/staff-pages'
import { StaffButton } from './staff-ui'
import { staffCopy } from './staff-copy'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { StaffStackParamList } from '../../navigation/StaffStack'

type Task = { kind: string; count: number }
export default function StaffHomeScreen() {
  const { profile, logout } = useAuth(), { i18n } = useTranslation(), theme = useTheme()
  const { canUseParentWorkspace, openParentWorkspace } = useWorkspace()
  const nav = useNavigation<NativeStackNavigationProp<StaffStackParamList>>()
  const copy = staffCopy(i18n.language), pages = staffPages(profile)
  const [tasks, setTasks] = useState<Task[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useFocusEffect(useCallback(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try { const result = await httpsCallable<{ mode: string }, { actions: Task[] }>(functions, 'getDashboardActions')({ mode: 'staff' }); if (active) { setTasks(result.data.actions); setError(false) } }
      catch { if (active) setError(true) }
      finally { if (active) setLoading(false) }
    }
    void load(); const timer = setInterval(load, 60_000)
    return () => { active = false; clearInterval(timer) }
  }, [profile?.uid, retry]))
  const [unread, setUnread] = useState(0)
  const inbox = hasRight(profile || undefined, 'messages.boite')
  useEffect(() => {
    setUnread(0)
    if (!inbox || !profile?.uid) return
    const uid = profile.uid
    return subscribeMessages(uid, 'staff', rows => setUnread(rows.filter(row => row.fromId !== uid && !row.readBy?.includes(uid)).length), () => setError(true))
  }, [profile?.uid, inbox, retry])
  const text = { color: theme.text, fontFamily: i18n.language.startsWith('ar') ? theme.fonts.arabic : theme.fonts.regular }
  return <ScreenLayout title={copy.home} showBack={false}><ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
    <Text style={[text, { fontSize: 22 }]}>{profile?.prenom} {profile?.nom}</Text>
    <Text style={text}>{i18n.language.startsWith('ar') ? profile?.poste?.nomAr || profile?.poste?.nom : profile?.poste?.nom}</Text>
    <Text accessibilityRole="header" style={[text, { fontSize: 18 }]}>{copy.todo}</Text>
    {loading && <ActivityIndicator color={theme.primary} />}
    {error && <Text accessibilityRole="alert" style={text}>{copy.error}</Text>}
    {!loading && !error && tasks.length === 0 && unread === 0 && <Text style={text}>{copy.clear}</Text>}
    {inbox && unread > 0 && <StaffButton title={`${copy.messages} · ${unread}`} onPress={() => nav.navigate('StaffMessages')} />}
    {tasks.map(task => task.kind === 'appointments' && hasRight(profile || undefined, 'rendezvous') ? <StaffButton key={task.kind} title={`${copy.appointments} · ${task.count}`} onPress={() => nav.navigate('StaffAppointments')} />
      : task.kind === 'declarations' && hasRight(profile || undefined, 'absences.saisir') ? <StaffButton key={task.kind} title={`${copy.declarations} · ${task.count}`} onPress={() => nav.navigate('StaffDeclarations')} /> : null)}
    <StaffButton title={copy.retry} disabled={loading} onPress={() => setRetry(value => value + 1)} />
    {pages.length === 0 && <Text style={text}>{copy.noRights}</Text>}
    {pages.map(page => <StaffButton key={page.key} title={`${copy[page.key as keyof typeof copy]}${page.path ? ` · ${copy.web}` : ''}`} onPress={() => {
      if (page.path) void Linking.openURL(`https://mojammaa.com${page.path}`).catch(() => setError(true))
      else nav.navigate(page.route as 'StaffLessons')
    }} />)}
    {canUseParentWorkspace && <StaffButton title={copy.parent} onPress={openParentWorkspace} />}
    <StaffButton title={copy.logout} onPress={() => { void logout().catch(() => setError(true)) }} />
  </ScrollView></ScreenLayout>
}
