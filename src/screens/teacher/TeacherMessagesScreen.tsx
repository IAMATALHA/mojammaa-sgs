import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator,
} from 'react-native';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';

interface MsgRow {
  id:        string
  fromNom?:  string
  subject?:  string
  body?:     string
  toId?:     string
  read?:     boolean
  createdAt?: Timestamp
}

function shortTime(ts?: Timestamp): string {
  if (!ts) return ''
  const d = ts.toDate()
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function TeacherMessagesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [items,   setItems]   = useState<MsgRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const col = collection(db, 'messages')
    const merged = new Map<string, MsgRow>()
    const onErr = (label: string) => (err: any) => {
      // eslint-disable-next-line no-console
      console.warn('[teacher inbox]', label, err?.code || err?.message)
    }
    const apply = () => {
      const arr = [...merged.values()].sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      )
      setItems(arr)
      setLoading(false)
    }
    const u1 = onSnapshot(query(col, where('toId', '==', user.uid)),
      s => { s.docs.forEach(d => merged.set(d.id, { id: d.id, ...(d.data() as any) })); apply() },
      onErr('toId==uid'))
    const u2 = onSnapshot(query(col, where('toId', '==', 'all')),
      s => { s.docs.forEach(d => merged.set(d.id, { id: d.id, ...(d.data() as any) })); apply() },
      onErr('toId==all'))
    const u3 = onSnapshot(query(col, where('toId', '==', 'teachers')),
      s => { s.docs.forEach(d => merged.set(d.id, { id: d.id, ...(d.data() as any) })); apply() },
      onErr('toId==teachers'))
    return () => { u1(); u2(); u3() }
  }, [user])

  const renderItem = ({ item }: { item: MsgRow }) => {
    const unread = !item.read
    return (
      <View style={[
        styles.card,
        { backgroundColor: unread ? theme.white : theme.surface, borderColor: unread ? theme.primary : theme.border },
      ]}>
        <View style={styles.row}>
          <Text style={[styles.fromText, { color: theme.text, fontWeight: unread ? '800' : '600' }]} numberOfLines={1}>
            {item.fromNom || 'Inconnu'}
          </Text>
          <Text style={[styles.dateText, { color: theme.textSoft }]}>{shortTime(item.createdAt)}</Text>
        </View>
        {item.subject ? (
          <Text style={[styles.subject, { color: theme.text, fontWeight: unread ? '700' : '500' }]} numberOfLines={1}>
            {item.subject}
          </Text>
        ) : null}
        <Text style={[styles.previewText, { color: theme.textSoft }]} numberOfLines={2}>
          {item.body || ''}
        </Text>
      </View>
    )
  };

  return (
    <ScreenLayout title={t('tabs.messages')}>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noMessages')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  listContainer: { paddingBottom: 32 },
  card:          { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1.5 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fromText:      { fontSize: 14, flex: 1, marginEnd: 8 },
  dateText:      { fontSize: 11 },
  subject:       { fontSize: 13, marginBottom: 4 },
  previewText:   { fontSize: 12, lineHeight: 18 },
  loading:       { paddingVertical: 40, alignItems: 'center' },
  empty:         { paddingVertical: 60, alignItems: 'center' },
  logoutBtn:     { padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', marginTop: 10 },
});
