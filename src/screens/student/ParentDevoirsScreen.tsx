import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Modal, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { BookOpen, X, Check, Clock, AlertCircle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentDevoirs, type ParentDevoir } from '../../hooks/useParentDevoirs'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

export default function ParentDevoirsScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const parent = useParentData()
  const { loading, error, devoirs } = useParentDevoirs()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')
  const [detail, setDetail] = useState<ParentDevoir | null>(null)

  const filtered = useMemo(() => {
    if (selectedChildId === 'all') return devoirs
    return devoirs.filter(d => d.childId === selectedChildId)
  }, [devoirs, selectedChildId])

  const pending = filtered.filter(d => !d.isPast)
  const past = filtered.filter(d => d.isPast)

  const childName = (childId: string): string => {
    const c = parent.children.find(x => x.id === childId)
    return c ? c.firstName : ''
  }

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
                    <DevoirRow key={d.id} item={d} childName={childName(d.childId)} isLast={idx === pending.length - 1} onPress={() => setDetail(d)} theme={theme} />
                  ))
                )}
              </Card>
            </View>

            {past.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={t('parent.submitted')} subtitle={t('parent.archived', { count: past.length })} />
                <Card padding={12}>
                  {past.map((d, idx) => (
                    <DevoirRow key={d.id} item={d} childName={childName(d.childId)} isLast={idx === past.length - 1} onPress={() => setDetail(d)} theme={theme} />
                  ))}
                </Card>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {detail && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
              <View style={styles.sheetHeader}>
                <View style={[styles.subjPill, { backgroundColor: theme.primarySurface }]}>
                  <BookOpen size={12} color={theme.primary} strokeWidth={2.4} />
                  <Text style={{ color: theme.primary, fontFamily: theme.fonts.bold, fontSize: 11, letterSpacing: 0.4, marginStart: 5 }}>
                    {detail.type.toUpperCase()}
                  </Text>
                </View>
                <Pressable onPress={() => setDetail(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
                  <X size={18} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
              <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: theme.fontSize.h3, marginTop: 12, letterSpacing: -0.3 }}>
                {detail.title}
              </Text>
              {detail.description ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{detail.description}</Text>
              ) : null}
              <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
                <Clock size={14} color={theme.textSoft} strokeWidth={2} />
                <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
                  {detail.dateLimite.split('-').reverse().join('/')}
                </Text>
              </View>
              <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
                <View style={[styles.dot, { backgroundColor: detail.isPast ? theme.success : theme.warning }]} />
                <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
                  {detail.isPast ? t('parent.statusSubmitted') : t('parent.statusPending')}
                </Text>
              </View>
              {detail.classeId ? (
                <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
                  <View style={[styles.dot, { backgroundColor: theme.info }]} />
                  <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
                    {detail.classeId}{detail.teacherNom ? ` · ${detail.teacherNom}` : ''}
                  </Text>
                </View>
              ) : null}
              {!detail.isPast && (
                <View style={[styles.cta, { backgroundColor: theme.primarySurface }]}>
                  <AlertCircle size={14} color={theme.primary} strokeWidth={2.2} />
                  <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold, fontSize: 12.5, marginStart: 8, flex: 1 }}>
                    {t('parent.remindChild')}
                  </Text>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
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

function DevoirRow({ item, childName, isLast, onPress, theme }: { item: ParentDevoir; childName: string; isLast: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable onPress={onPress} style={[styles.devoirRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <View style={[styles.devoirDot, { backgroundColor: item.isPast ? theme.success : theme.warning }]} />
      <View style={{ flex: 1, marginStart: 10 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 14 }}>{item.title}</Text>
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
          {item.classeId}{childName ? ` · ${childName}` : ''} · {item.dateLimite.split('-').reverse().join('/')}
        </Text>
      </View>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { padding: 20, borderRadius: 22, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cta: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 14 },
})
