/**
 * TeacherComportementScreen — journal de comportement d'une classe.
 * Liste chronologique des mérites/avertissements ; le prof peut supprimer
 * SES propres entrées (erreur de saisie) — le message parent déjà parti
 * reste (cf. règle Firestore `comportements`).
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Alert, ActivityIndicator,
} from 'react-native'
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'
import { useRoute } from '@react-navigation/native'
import type { TeacherRoute } from '../../navigation/types'
import { Star, AlertTriangle, Trash2, SmilePlus } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import PressableScale from '../../components/PressableScale'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeComportementsForClasse, deleteComportement, type ComportementDoc,
} from '../../services/comportementsService'
import { localeFor } from '../../utils/format'

export default function TeacherComportementScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<TeacherRoute<'TeacherComportement'>>()
  const { classe } = route.params ?? { classe: '' }
  const { profile } = useAuth()

  const [entries, setEntries] = useState<ComportementDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!classe) return
    return subscribeComportementsForClasse(
      classe,
      list => { setEntries(list); setLoading(false); setError(null) },
      err  => { setError(err.message); setLoading(false) },
    )
  }, [classe])

  const sorted = useMemo(
    () => [...entries].sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ),
    [entries],
  )

  const confirmDelete = (item: ComportementDoc) => {
    Alert.alert(t('behavior.deleteEntry'), t('behavior.deleteEntryMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => { if (item.id) deleteComportement(item.id).catch(() => {}) },
      },
    ])
  }

  const renderEntry = ({ item, index }: { item: ComportementDoc; index: number }) => {
    const merite = item.kind === 'merite'
    const tint = merite ? theme.success : theme.danger
    const Icon = merite ? Star : AlertTriangle
    const mine = item.teacherId === profile?.uid
    const date = new Date(item.date).toLocaleDateString(localeFor(), { day: '2-digit', month: 'short' })
    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index, 12) * 30).springify().damping(18)}
        layout={Layout.springify()}
      >
        <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
          <View style={[styles.statusStripe, { backgroundColor: tint }]} />
          <View style={[styles.iconWrap, { backgroundColor: tint + '18' }]}>
            <Icon size={18} color={tint} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, marginStart: 12 }}>
            <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 14.5 }}>
              {item.elevePrenom} {item.eleveNom}
            </Text>
            <Text style={{ color: tint, fontFamily: theme.fonts.semibold, fontSize: 12, marginTop: 2 }}>
              {t(`behavior.${item.kind}`)} · {t(`behavior.reasons.${item.reason}`)}
            </Text>
            <Text numberOfLines={2} style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 11.5, marginTop: 2 }}>
              {date}{item.seance ? ` · ${item.seance}` : ''} · {item.teacherNom}
              {item.comment ? ` — ${item.comment}` : ''}
            </Text>
          </View>
          {mine ? (
            <PressableScale onPress={() => confirmDelete(item)} scaleDown={0.85} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={styles.deleteBtn}>
              <Trash2 size={17} color={theme.textMuted} strokeWidth={2} />
            </PressableScale>
          ) : null}
        </View>
      </Animated.View>
    )
  }

  return (
    <ScreenLayout title={`${t('behavior.classLog')} · ${classe}`}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.summary, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
          {t('behavior.entriesCount', { count: sorted.length })}
          {' · '}
          <Text style={{ color: theme.success }}>{sorted.filter(e => e.kind === 'merite').length} {t('behavior.merites').toLowerCase()}</Text>
          {' · '}
          <Text style={{ color: theme.danger }}>{sorted.filter(e => e.kind === 'avertissement').length} {t('behavior.avertissements').toLowerCase()}</Text>
        </Text>
      </View>

      {loading && sorted.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <SmilePlus size={34} color={theme.textMuted} strokeWidth={1.6} />
          <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15, marginTop: 12 }}>
            {t('behavior.logEmpty')}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 }}>
            {t('behavior.logEmptyMsg')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id || `${item.eleveId}_${item.date}_${item.reason}`}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  summary:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  card:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  statusStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  iconWrap:     { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtn:    { padding: 8, marginStart: 4 },
  loading:      { paddingVertical: 40, alignItems: 'center' },
  empty:        { paddingVertical: 60, alignItems: 'center' },
  errorBox:     { padding: 12, borderRadius: 10, marginBottom: 12 },
})
