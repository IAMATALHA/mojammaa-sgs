import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import BottomSheet from '../../components/BottomSheet'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useAppointments } from '../../hooks/use-appointments'
import { subscribeChildrenOfParent, type EleveDoc } from '../../services/elevesService'
import { getStaffDirectory } from '../../services/directoryService'
import { appointmentCommand, appointmentError, newAppointmentOperation, type Appointment, type AppointmentMode } from '../../services/appointments-service'

export function ParentAppointmentsScreen() { return <AppointmentsScreen mode="parent" /> }
export function AdminAppointmentsScreen() { return <AppointmentsScreen mode="admin" /> }
export function TeacherAppointmentsScreen() { return <AppointmentsScreen mode="teacher" /> }

function AppointmentsScreen({ mode }: { mode: AppointmentMode }) {
  const theme = useTheme(), { t } = useTranslation(), { profile } = useAuth()
  const [history, setHistory] = useState(false)
  const data = useAppointments(mode, history)
  const [children, setChildren] = useState<EleveDoc[]>([])
  const [form, setForm] = useState<{ action: 'request' | 'propose' | 'request_change' | 'decline'; row?: Appointment } | null>(null)
  const [teachers, setTeachers] = useState<{ uid: string; nom: string; prenom: string; classes: string[] }[]>([])
  const [eleveId, setEleveId] = useState(''), [topic, setTopic] = useState('learning')
  const [note, setNote] = useState(''), [availability, setAvailability] = useState('')
  const [date, setDate] = useState(''), [time, setTime] = useState(''), [location, setLocation] = useState('')
  const [teacherId, setTeacherId] = useState(''), [duration, setDuration] = useState(30)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const pending = useRef<{ fingerprint: string; operationId: string } | null>(null)
  const inFlight = useRef(false)
  useEffect(() => {
    if (mode !== 'parent' || !profile?.uid) return
    return subscribeChildrenOfParent(profile.uid, setChildren, () => setError('appointments.errors.failed'))
  }, [mode, profile?.uid])
  useEffect(() => {
    if (mode !== 'admin') return
    let active = true
    void getStaffDirectory().then(directory => { if (!directory) throw new Error('directory-unavailable'); if (active) setTeachers(directory.teachers.map(teacher => ({ ...teacher, classes: teacher.classes || [] }))) })
      .catch(() => { if (active) setError('appointments.errors.failed') })
    return () => { active = false }
  }, [mode])
  const open = (action: NonNullable<typeof form>['action'], row?: Appointment) => {
    pending.current = null; setError(null); setForm({ action, row })
    setEleveId(row?.eleveId || children[0]?.codeMassar || children[0]?.id || '')
    setTopic(row?.topic || 'learning'); setNote(action === 'decline' ? '' : row?.note || '')
    setAvailability(row?.availability || ''); setDate(row?.date || ''); setTime(row?.time || '')
    setLocation(row?.location || ''); setTeacherId(row?.teacherId || ''); setDuration(row?.duration || 30)
  }
  const execute = async (payload: Record<string, unknown>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    const fingerprint = JSON.stringify(payload)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, operationId: newAppointmentOperation() }
    try {
      await appointmentCommand({ ...payload, operationId: pending.current.operationId })
      pending.current = null; setForm(null); await data.refresh()
    } catch (e) { setError(appointmentError(e)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const saveForm = () => {
    if (!form) return
    const common = form.row ? { appointmentId: form.row.id, revision: form.row.revision } : {}
    void execute({ ...common, action: form.action,
      ...(form.action === 'request' ? { eleveId, topic, note, availability } : {}),
      ...(form.action === 'propose' ? { date, time, location, teacherId, duration } : {}),
      ...(form.action === 'request_change' ? { availability } : {}),
      ...(form.action === 'decline' ? { adminNote: note } : {}),
    })
  }
  const act = (row: Appointment, action: string) => Alert.alert(t(`appointments.actions.${action}`), t('appointments.confirmAction'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.confirm'), onPress: () => void execute({ action, appointmentId: row.id, revision: row.revision }) },
  ])
  const button = (label: string, onPress: () => void, selected = false, key = label) => (
    <Pressable key={key} disabled={busy} accessibilityRole="button" accessibilityState={{ selected, disabled: busy }} onPress={onPress}
      style={{ padding: 11, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySurface : theme.card }}>
      <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{label}</Text>
    </Pressable>
  )
  const field = (label: string, value: string, onChangeText: (value: string) => void, maxLength = 200, placeholder?: string) => (
    <View style={{ gap: 6 }}><Text style={{ color: theme.text, fontFamily: theme.fonts.semibold }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={theme.textMuted}
        style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text, backgroundColor: theme.surface, minHeight: 48 }} />
    </View>
  )
  return (
    <ScreenLayout title={t('appointments.title')}>
      <Text style={{ color: theme.textSoft, marginBottom: 12 }}>{t(mode === 'teacher' ? 'appointments.teacherIntro' : mode === 'admin' ? 'appointments.adminIntro' : 'appointments.intro')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {button(t('appointments.active'), () => setHistory(false), !history)}
        {button(t('appointments.history'), () => setHistory(true), history)}
        {mode === 'parent' && children.length > 0 && button(t('appointments.new'), () => open('request'))}
      </View>
      {(error || data.error) && <Text accessibilityLiveRegion="polite" style={{ color: theme.danger, marginBottom: 10 }}>{t(error || 'appointments.errors.failed')}</Text>}
      {data.error && button(t('appointments.retry'), () => void data.refresh())}
      {busy && <ActivityIndicator color={theme.primary} />}
      <FlatList data={data.rows} keyExtractor={row => row.id} contentContainerStyle={{ paddingBottom: 32, gap: 12 }} refreshing={data.loading} onRefresh={() => void data.refresh()}
        ListEmptyComponent={data.loading ? <ActivityIndicator color={theme.primary} /> : <Text style={{ color: theme.textSoft, paddingVertical: 24 }}>{t('appointments.empty')}</Text>}
        ListFooterComponent={data.hasMore ? button(t('common.seeMore'), () => void data.more()) : null}
        renderItem={({ item: row }) => (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 8 }}>
            <Text style={{ color: theme.primary, fontFamily: theme.fonts.bold }}>{t(`appointments.status.${row.status}`)}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.fonts.bold }}>{row.childName} · {row.classe}</Text>
            <Text style={{ color: theme.text }}>{t(`appointments.topics.${row.topic}`)}</Text>
            {row.note ? <Text selectable style={{ color: theme.textSoft }}>{row.note}</Text> : null}
            {row.availability ? <Text style={{ color: theme.textSoft }}>{t('appointments.availability')}: {row.availability}</Text> : null}
            {row.date && row.status !== 'requested' ? <Text selectable style={{ color: theme.text }}>{row.date} · {row.time} · {row.duration} min · {t('appointments.timezone')}{'\n'}{row.location} · {row.staffName || t('appointments.administration')}</Text> : null}
            {row.adminNote ? <Text style={{ color: theme.textSoft }}>{row.adminNote}</Text> : null}
            {['requested', 'proposed', 'confirmed'].includes(row.status) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {mode === 'admin' && button(t('appointments.actions.propose'), () => open('propose', row))}
              {mode === 'admin' && ['requested', 'proposed'].includes(row.status) && button(t('appointments.actions.decline'), () => open('decline', row))}
              {mode === 'admin' && row.status === 'confirmed' && (row.endAt || Infinity) <= Date.now() && button(t('appointments.actions.complete'), () => act(row, 'complete'))}
              {mode === 'parent' && row.status === 'proposed' && button(t('appointments.actions.confirm'), () => act(row, 'confirm'))}
              {mode === 'parent' && row.status === 'proposed' && button(t('appointments.actions.request_change'), () => open('request_change', row))}
              {mode !== 'teacher' && button(t('appointments.actions.cancel'), () => act(row, 'cancel'))}
            </View>}
          </View>
        )} />
      <BottomSheet dismissible={!busy} visible={!!form} onClose={() => { if (!busy) setForm(null) }}>
        <View style={{ gap: 12, paddingBottom: 24 }}>
            <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 18 }}>{t(`appointments.actions.${form?.action || 'request'}`)}</Text>
            {error && <Text style={{ color: theme.danger }}>{t(error)}</Text>}
            {form?.action === 'request' && <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children.map(child => button(`${child.prenom} ${child.nom}`, () => setEleveId(child.codeMassar || child.id || ''), eleveId === (child.codeMassar || child.id), child.codeMassar || child.id))}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['learning', 'attendance', 'behavior', 'administrative', 'other'].map(key => button(t(`appointments.topics.${key}`), () => setTopic(key), topic === key))}</View>
              {field(t('appointments.note'), note, setNote, 500)}
            </>}
            {['request', 'request_change'].includes(form?.action || '') && field(t('appointments.availability'), availability, setAvailability)}
            {form?.action === 'decline' && field(t('appointments.declineReason'), note, setNote, 300)}
            {form?.action === 'propose' && <>
              {field(t('appointments.date'), date, setDate, 10, '2026-09-15')}
              {field(t('appointments.time'), time, setTime, 5, '16:00')}
              <Text style={{ color: theme.textSoft }}>{t('appointments.timezone')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[15, 30, 45, 60].map(value => button(`${value} min`, () => setDuration(value), duration === value))}</View>
              {field(t('appointments.location'), location, setLocation, 150)}
              <Text style={{ color: theme.text }}>{t('appointments.with')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {button(t('appointments.administration'), () => setTeacherId(''), !teacherId)}
                {teachers.filter(teacher => teacher.classes.includes(form.row?.classe || '')).map(teacher => button(`${teacher.prenom} ${teacher.nom}`, () => setTeacherId(teacher.uid), teacherId === teacher.uid, teacher.uid))}
              </View>
            </>}
            {button(busy ? t('common.loading') : t('common.save'), saveForm)}
        </View>
      </BottomSheet>
    </ScreenLayout>
  )
}
