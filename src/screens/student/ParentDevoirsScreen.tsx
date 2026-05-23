/**
 * ParentDevoirsScreen — liste complète des devoirs.
 *
 * Filtre par enfant via chips horizontaux. Tap sur une ligne ouvre
 * une modale de détail (titre, matière, échéance, statut, note).
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Modal, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { BookOpen, X, Check, Clock, AlertCircle } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import {
  Card, HomeworkRow, EmptyState, SectionHeader,
} from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import {
  PARENT_RECENT_HOMEWORK,
  type HomeworkItem,
} from '../../utils/mockData'

const STATUS_LABEL = {
  pending:   'En attente',
  submitted: 'Rendu',
  graded:    'Noté',
} as const

export default function ParentDevoirsScreen() {
  const theme = useTheme()
  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState<string>('all')
  const [detail, setDetail] = useState<HomeworkItem | null>(null)

  const filtered = useMemo(() => {
    if (selectedChildId === 'all') return PARENT_RECENT_HOMEWORK
    return PARENT_RECENT_HOMEWORK.filter(h => h.childId === selectedChildId)
  }, [selectedChildId])

  const pending   = filtered.filter(h => h.status === 'pending')
  const submitted = filtered.filter(h => h.status !== 'pending')

  const childName = (id: string): string => {
    const c = parent.children.find(x => x.id === id)
    return c ? c.firstName : ''
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          Devoirs
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {filtered.length} devoir{filtered.length > 1 ? 's' : ''} · {pending.length} en attente
        </Text>
      </View>

      {/* Child filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.chips}
      >
        <FilterChip
          label="Tous"
          active={selectedChildId === 'all'}
          onPress={() => setSelectedChildId('all')}
          theme={theme}
        />
        {parent.children.map(c => (
          <FilterChip
            key={c.id}
            label={c.firstName}
            active={selectedChildId === c.id}
            color={c.avatarColor}
            onPress={() => setSelectedChildId(c.id)}
            theme={theme}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Pending */}
        <View style={styles.section}>
          <SectionHeader title="À rendre" subtitle={`${pending.length} en cours`} />
          <Card padding={12}>
            {pending.length === 0 ? (
              <EmptyState
                icon={Check}
                title="Aucun devoir en attente"
                message="Tous les devoirs ont été rendus. Bravo !"
              />
            ) : (
              pending.map(h => (
                <HomeworkRow
                  key={h.id}
                  item={h}
                  childName={childName(h.childId)}
                  onPress={() => setDetail(h)}
                />
              ))
            )}
          </Card>
        </View>

        {/* Submitted */}
        {submitted.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Rendus" subtitle={`${submitted.length} archivé${submitted.length > 1 ? 's' : ''}`} />
            <Card padding={12}>
              {submitted.map(h => (
                <HomeworkRow
                  key={h.id}
                  item={h}
                  childName={childName(h.childId)}
                  onPress={() => setDetail(h)}
                />
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {/* Detail modal */}
      <DetailModal
        item={detail}
        onClose={() => setDetail(null)}
        childName={detail ? childName(detail.childId) : ''}
        theme={theme}
      />
    </SafeAreaView>
  )
}

function FilterChip({
  label, active, onPress, color, theme,
}: { label: string; active: boolean; onPress: () => void; color?: string; theme: any }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? (color ?? theme.primary) : theme.surface,
          borderColor:     active ? (color ?? theme.primary) : theme.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{
        color:     active ? '#fff' : theme.text,
        fontFamily: theme.fonts.semibold,
        fontSize:  12.5,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

function DetailModal({
  item, onClose, childName, theme,
}: { item: HomeworkItem | null; onClose: () => void; childName: string; theme: any }) {
  if (!item) return null
  const due = new Date(item.dueDate)
  const dueStr = due.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const isPending   = item.status === 'pending'
  const StatusIcon  = isPending ? Clock : Check

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHeader}>
            <View style={[styles.subjPill, { backgroundColor: theme.primarySurface }]}>
              <BookOpen size={12} color={theme.primary} strokeWidth={2.4} />
              <Text style={{
                color: theme.primary,
                fontFamily: theme.fonts.bold,
                fontSize: 11,
                letterSpacing: 0.4,
                marginStart: 5,
              }}>
                {item.subject.toUpperCase()}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>

          <Text style={{
            color: theme.text,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize.h3,
            marginTop: 12,
            letterSpacing: -0.3,
          }}>
            {item.title}
          </Text>

          <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
            <Clock size={14} color={theme.textSoft} strokeWidth={2} />
            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.medium,
              fontSize: 13,
              marginStart: 8,
            }}>
              {dueStr}
            </Text>
          </View>

          <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
            <View style={[styles.dot, { backgroundColor: isPending ? theme.warning : theme.success }]} />
            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.medium,
              fontSize: 13,
              marginStart: 8,
            }}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>

          {childName ? (
            <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
              <View style={[styles.dot, { backgroundColor: theme.info }]} />
              <Text style={{
                color: theme.text,
                fontFamily: theme.fonts.medium,
                fontSize: 13,
                marginStart: 8,
              }}>
                {childName}
              </Text>
            </View>
          ) : null}

          {isPending ? (
            <View style={[styles.cta, { backgroundColor: theme.primarySurface }]}>
              <AlertCircle size={14} color={theme.primary} strokeWidth={2.2} />
              <Text style={{
                color: theme.primary,
                fontFamily: theme.fonts.semibold,
                fontSize: 12.5,
                marginStart: 8,
                flex: 1,
              }}>
                Pensez à rappeler à votre enfant de rendre ce devoir avant l'échéance.
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  chips:  { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
    marginEnd: 6,
  },
  scroll:  { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 6, marginBottom: 4 },

  // Modal
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    padding: 20,
    borderRadius: 22,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  subjPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cta: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, marginTop: 14,
  },
})
