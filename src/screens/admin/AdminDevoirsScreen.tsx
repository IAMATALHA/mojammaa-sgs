import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity,
} from 'react-native'
import { collection, getDocs, Timestamp } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { BookOpen, Clock, Users, Paperclip } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import { toDoc } from '../../services/firestore'
import type { Attachment } from '../../services/StorageService'
import type { AdminStackParamList } from '../../navigation/types'

interface DevoirRow {
  id: string
  titre: string
  description: string
  classeId: string
  teacherNom: string
  dateLimite: string
  type: string
  attachments: Attachment[]
  createdAt?: Timestamp
}

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-')
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    return `${parseInt(d)} ${months[parseInt(m) - 1]}`
  } catch { return iso }
}

export default function AdminDevoirsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const [devoirs, setDevoirs] = useState<DevoirRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'devoirs'))
      const list: DevoirRow[] = snap.docs.map(d => {
        const data = toDoc<{
          titre?: string; description?: string; classeId?: string; teacherNom?: string
          dateLimite?: string; type?: string; attachments?: Attachment[]; createdAt?: Timestamp
        }>(d)
        return {
          id: d.id,
          titre: data.titre || '',
          description: data.description || '',
          classeId: data.classeId || '',
          teacherNom: data.teacherNom || '',
          dateLimite: data.dateLimite || '',
          type: data.type || '',
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
          createdAt: data.createdAt,
        }
      })
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setDevoirs(list)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const active = devoirs.filter(d => d.dateLimite >= today)
  const past = devoirs.filter(d => d.dateLimite < today)

  // Tap → page entière (description complète + pièces jointes consultables).
  const openView = (d: DevoirRow) => {
    navigation.navigate('AdminDevoirView', {
      devoir: {
        id: d.id, titre: d.titre, description: d.description, type: d.type,
        classeId: d.classeId, teacherNom: d.teacherNom, dateLimite: d.dateLimite,
        attachments: d.attachments,
      },
    })
  }

  const renderItem = ({ item }: { item: DevoirRow }) => {
    const isActive = item.dateLimite >= today
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={() => openView(item)}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardTop}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14, flex: 1 }} numberOfLines={1}>{item.titre}</Text>
          {item.attachments.length > 0 && <Paperclip size={12} color={theme.textSoft} strokeWidth={2} style={{ marginEnd: 6 }} />}
          <View style={[styles.typeBadge, { backgroundColor: isActive ? theme.primarySurface : theme.surfaceAlt }]}>
            <Text style={{ color: isActive ? theme.primary : theme.textSoft, fontSize: 10, fontWeight: '800' }}>{item.type.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Users size={12} color={theme.textSoft} strokeWidth={2} />
          <Text style={{ color: theme.textSoft, fontSize: 12, marginStart: 4 }}>{item.classeId}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginStart: 8 }}>·</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginStart: 8 }}>{item.teacherNom}</Text>
        </View>
        <View style={styles.metaRow}>
          <Clock size={12} color={isActive ? theme.accent : theme.textMuted} strokeWidth={2} />
          <Text style={{ color: isActive ? theme.accent : theme.textMuted, fontSize: 12, fontWeight: '600', marginStart: 4 }}>
            {formatDate(item.dateLimite)}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <ScreenLayout title={t('tabs.homework')}>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : devoirs.length === 0 ? (
        <View style={styles.empty}>
          <BookOpen size={24} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
        </View>
      ) : (
        <FlatList
          data={[...active, ...past]}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
          ListHeaderComponent={
            <View style={[styles.summary, { backgroundColor: theme.primarySurface }]}>
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
                {active.length} {t('admin.homeworkActive', { count: active.length }).toLowerCase()}
              </Text>
            </View>
          }
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center' },
  empty: { paddingVertical: 60, alignItems: 'center' },
  summary: { padding: 12, borderRadius: 12, marginBottom: 12 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
})
