import React, { useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator, Modal, Pressable, ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { X, Clock, Send } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherMessages } from '../../hooks/useTeacherMessages'
import { markAsRead } from '../../services/messagesService'

export default function TeacherMessagesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile, logout } = useAuth()
  const { messages, loading, unread } = useTeacherMessages()
  const [detail, setDetail] = useState<any>(null)

  const openMessage = async (msg: any) => {
    setDetail(msg)
    if (profile?.uid && msg.id) {
      try { await markAsRead(msg.id, profile.uid) } catch {}
    }
  }

  return (
    <ScreenLayout title={`${t('tabs.messages')}${unread > 0 ? ` (${unread})` : ''}`}>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noMessages')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const isUrgent = item.priority === 'urgent'
            return (
              <TouchableOpacity
                onPress={() => openMessage(item)}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: isUrgent ? theme.danger : theme.border }]}
              >
                <View style={styles.row}>
                  <Text style={[styles.fromText, { color: theme.text }]} numberOfLines={1}>
                    {item.author}
                  </Text>
                  <Text style={[styles.dateText, { color: theme.textSoft }]}>
                    {new Date(item.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={[styles.subject, { color: theme.text }]} numberOfLines={1}>
                  {isUrgent ? '🚨 ' : ''}{item.title}
                </Text>
                <Text style={[styles.previewText, { color: theme.textSoft }]} numberOfLines={2}>
                  {item.body}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.logoutBtn, { borderColor: theme.danger }]}
        onPress={() => Alert.alert(t('common.logoutTitle'), t('common.logoutConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.logout'), style: 'destructive', onPress: () => logout() },
        ])}
      >
        <Text style={{ color: theme.danger, fontWeight: '700' }}>{t('common.logout')}</Text>
      </TouchableOpacity>

      {/* Detail modal */}
      {detail && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textSoft, fontWeight: '600', fontSize: 12 }}>{detail.author}</Text>
                </View>
                <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                  <X size={20} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18, marginTop: 8 }}>{detail.title}</Text>
                <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>
                  {new Date(detail.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 14 }}>{detail.body}</Text>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  listContainer: { paddingBottom: 32 },
  card: { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fromText: { fontSize: 14, fontWeight: '700', flex: 1, marginEnd: 8 },
  dateText: { fontSize: 11 },
  subject: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  previewText: { fontSize: 12, lineHeight: 18 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  logoutBtn: { padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
