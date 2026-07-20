import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Check, Paperclip } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentDevoirs, type ParentDevoir } from '../../hooks/useParentDevoirs'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import type { StudentDevoirsStackParamList } from '../../navigation/types'
import {
  isHomeworkAwaitingReview,
  isHomeworkClosed,
  type HomeworkSubmissionStatus,
} from '../../services/homeworkSubmissionsService'

export default function ParentDevoirsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const parent = useParentData()
  const { loading, error, devoirs } = useParentDevoirs(parent.eleves)
  const navigation = useNavigation<NativeStackNavigationProp<StudentDevoirsStackParamList, 'StudentDevoirsList'>>()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')

  // Page ENTIÈRE de détail (remplace l'ancienne popup sans pièces jointes).
  const openDetail = (d: ParentDevoir) => {
    navigation.navigate('StudentDevoirView', {
      devoir: {
        id: d.id, titre: d.title, description: d.description, type: d.type,
        classeId: d.classeId, teacherId: d.teacherId, teacherNom: d.teacherNom, dateLimite: d.dateLimite,
        eleveId: d.childId, eleveNom: d.childName, parentUid: d.parentUid,
        attachments: d.attachments,
      },
    })
  }

  const filtered = useMemo(() => {
    if (selectedChildId === 'all') return devoirs
    return devoirs.filter(d => d.childId === selectedChildId)
  }, [devoirs, selectedChildId])

  const pending = filtered.filter(d => !isHomeworkAwaitingReview(d.status) && !isHomeworkClosed(d.status))
  const awaiting = filtered.filter(d => isHomeworkAwaitingReview(d.status))
  const history = filtered.filter(d => isHomeworkClosed(d.status))

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.header}>
        <Text style={{ color: theme.text, fontFamily: theme.fonts.black, fontSize: theme.fontSize.h2, letterSpacing: -0.5 }}>
          {t('tabs.homework')}
        </Text>
        <Text style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.small, marginTop: 2 }}>
          {t('parent.homeworkCount', { count: filtered.length, pending: pending.length })}
        </Text>
      </View>

      {/* flexShrink: 0 — sinon Yoga écrase cette rangée (hors du scroll
          vertical) proportionnellement à la hauteur de la liste en dessous. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.chips}>
        <FilterChip label={t('parent.allFilter')} active={selectedChildId === 'all'} onPress={() => setSelectedChildId('all')} theme={theme} />
        {parent.children.map(c => (
          <FilterChip key={c.id} label={c.firstName} active={selectedChildId === c.id} color={c.avatarColor} onPress={() => setSelectedChildId(c.id)} theme={theme} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(error || parent.error) && devoirs.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <>
            <View style={styles.section}>
              <SectionHeader title={t('parent.toSubmit')} subtitle={t('parent.inProgress', { count: pending.length })} />
              <Card padding={12}>
                {pending.length === 0 ? (
                  <EmptyState icon={Check} title={t('parent.noHomework')} message={t('parent.allDone')} />
                ) : (
                  pending.map((d, idx) => (
                    <DevoirRow key={`${d.id}_${d.childId}`} item={d} isLast={idx === pending.length - 1} onPress={() => openDetail(d)} theme={theme} />
                  ))
                )}
              </Card>
            </View>

            {awaiting.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={t('homeworkTracking.awaitingReview')} subtitle={t('homeworkTracking.itemsCount', { count: awaiting.length })} />
                <Card padding={12}>
                  {awaiting.map((d, idx) => (
                    <DevoirRow key={`${d.id}_${d.childId}`} item={d} isLast={idx === awaiting.length - 1} onPress={() => openDetail(d)} theme={theme} />
                  ))}
                </Card>
              </View>
            )}

            {history.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={t('homeworkTracking.history')} subtitle={t('homeworkTracking.itemsCount', { count: history.length })} />
                <Card padding={12}>
                  {history.map((d, idx) => (
                    <DevoirRow key={`${d.id}_${d.childId}`} item={d} isLast={idx === history.length - 1} onPress={() => openDetail(d)} theme={theme} />
                  ))}
                </Card>
              </View>
            )}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  )
}

function FilterChip({ label, active, onPress, color, theme }: { label: string; active: boolean; onPress: () => void; color?: string; theme: Theme }) {
  return (
    <Pressable onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: active ? (color ?? theme.primary) : theme.surface, borderColor: active ? (color ?? theme.primary) : theme.border }]}>
      <Text style={{ color: active ? '#fff' : theme.text, fontFamily: theme.fonts.semibold, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  )
}

function statusColor(status: HomeworkSubmissionStatus, theme: Theme): string {
  if (status === 'graded' || status === 'excused') return theme.success
  if (status === 'not_done' || status === 'not_submitted') return theme.danger
  if (status === 'submitted' || status === 'submitted_late') return theme.info
  return theme.warning
}

function DevoirRow({ item, isLast, onPress, theme }: { item: ParentDevoir; isLast: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} style={[styles.devoirRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <View style={[styles.devoirDot, { backgroundColor: statusColor(item.status, theme) }]} />
      <View style={{ flex: 1, marginStart: 10 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 14 }}>{item.title}</Text>
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
          {item.classeId}{item.childName ? ` · ${item.childName}` : ''} · {item.dateLimite.split('-').reverse().join('/')}
        </Text>
      </View>
      {item.attachments.length > 0 && <Paperclip size={13} color={theme.textSoft} strokeWidth={2} style={{ marginEnd: 6 }} />}
      <Text style={{ color: theme.textSoft, fontFamily: theme.fonts.medium, fontSize: 11 }}>{item.type}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  chips: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginEnd: 6 },
  scroll: { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 6, marginBottom: 4 },
  devoirRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  devoirDot: { width: 8, height: 8, borderRadius: 4 },
})
