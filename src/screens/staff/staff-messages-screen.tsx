import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native'
import { useRoute, type RouteProp } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { hasRight } from '../../utils/staff-rights'
import { subscribeMessages, subscribeSentMessages, markAsRead, sendStaffClassMessage, newPersonalizedSendAttempt, type MessageDoc } from '../../services/messagesService'
import { StaffButton } from './staff-ui'
import { staffCopy } from './staff-copy'
import { useStaffClasses } from './staff-operations-screen'
import type { StaffStackParamList } from '../../navigation/StaffStack'

function Compose() {
  const { profile } = useAuth(), { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme()
  const { classes, loading, error: classError, refresh } = useStaffClasses()
  const [classe, setClasse] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState(false), [sent, setSent] = useState(false)
  const busy = useRef(false), attempt = useRef(newPersonalizedSendAttempt())
  const changed = () => { attempt.current = newPersonalizedSendAttempt(); setSent(false) }
  const send = async () => {
    if (busy.current || !profile || !classe || !subject.trim() || !body.trim()) return
    busy.current = true; setSending(true); setError(false); setSent(false)
    try {
      await sendStaffClassMessage({ classe, subject: subject.trim(), body: body.trim(), sender: profile }, attempt.current)
      attempt.current = newPersonalizedSendAttempt()
      setSubject(''); setBody(''); setSent(true)
    } catch { setError(true) } finally { busy.current = false; setSending(false) }
  }
  const input = { color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 6 }
  return <View><Text style={{ color: theme.text }}>{copy.choose}</Text>{loading && <ActivityIndicator />}{classError && <><Text style={{ color: theme.danger }}>{copy.error}</Text><StaffButton title={copy.retry} onPress={refresh} /></>}
    {classes.map(value => <StaffButton key={value} title={value} disabled={sending} selected={classe === value} onPress={() => { changed(); setClasse(value) }} />)}
    <TextInput accessibilityLabel={copy.subject} placeholder={copy.subject} placeholderTextColor={theme.textMuted} value={subject} onChangeText={value => { changed(); setSubject(value) }} editable={!sending} maxLength={200} style={input} />
    <TextInput accessibilityLabel={copy.body} placeholder={copy.body} placeholderTextColor={theme.textMuted} value={body} onChangeText={value => { changed(); setBody(value) }} editable={!sending} maxLength={10000} multiline style={input} />
    {error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{copy.error}</Text>}{sent && <Text style={{ color: theme.success }}>{copy.sent}</Text>}
    <StaffButton title={copy.send} disabled={sending || !classe || !subject.trim() || !body.trim()} onPress={() => { void send() }} />
  </View>
}
export default function StaffMessagesScreen() {
  const { profile } = useAuth(), { i18n } = useTranslation(), copy = staffCopy(i18n.language), theme = useTheme()
  const route = useRoute<RouteProp<StaffStackParamList, 'StaffMessages'>>()
  const inbox = hasRight(profile || undefined, 'messages.boite'), send = hasRight(profile || undefined, 'messages.envoyer')
  const [rows, setRows] = useState<MessageDoc[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [retry, setRetry] = useState(0), [compose, setCompose] = useState(false)
  useEffect(() => {
    if (!profile) return
    setRows([]); setLoading(true); setError(false)
    const receive = (values: MessageDoc[]) => { setRows(values); setLoading(false) }, failed = () => { setLoading(false); setError(true) }
    return inbox ? subscribeMessages(profile.uid, 'staff', receive, failed) : subscribeSentMessages(profile.uid, receive, failed)
  }, [profile?.uid, inbox, retry])
  useEffect(() => { if (route.params?.messageId && profile && rows.some(row => row.id === route.params?.messageId)) void markAsRead(route.params.messageId, profile.uid).catch(() => setError(true)) }, [route.params?.messageId, rows, profile?.uid])
  return <ScreenLayout title={inbox ? copy.inbox : copy.outbox}><FlatList contentContainerStyle={{ padding: 20 }} data={compose ? [] : rows} keyExtractor={(row, index) => row.id || String(index)}
    ListHeaderComponent={<>{send && <StaffButton title={compose ? copy.messages : copy.send} onPress={() => setCompose(value => !value)} />}{compose ? <Compose /> : <>{loading && <ActivityIndicator />}{error && <Text style={{ color: theme.danger }}>{copy.error}</Text>}<StaffButton title={copy.retry} onPress={() => setRetry(n => n + 1)} /></>}</>}
    ListEmptyComponent={!compose && !loading && !error ? <Text style={{ color: theme.text }}>{copy.empty}</Text> : null}
    renderItem={({ item }) => <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold }}>{i18n.language.startsWith('ar') ? item.subjectAr || item.subject : item.subject}</Text>
      <Text style={{ color: theme.textSoft }}>{item.fromNom}</Text><Text selectable style={{ color: theme.text }}>{i18n.language.startsWith('ar') ? item.bodyAr || item.body : item.body}</Text>
      {inbox && item.id && !item.readBy?.includes(profile?.uid || '') && <StaffButton title={i18n.language.startsWith('ar') ? 'تمت القراءة' : i18n.language.startsWith('en') ? 'Mark as read' : 'Marquer comme lu'} onPress={() => { void markAsRead(item.id!, profile!.uid).catch(() => setError(true)) }} />}
    </View>} /></ScreenLayout>
}
