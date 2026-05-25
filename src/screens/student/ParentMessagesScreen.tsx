/**
 * ParentMessagesScreen — feed des annonces / communications école → parents.
 *
 * - Onglets : Tout / Urgent / École / Événements
 * - Liste avec recherche basique
 * - Tap → modale plein détail
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import {
  X, Search, Megaphone, Calendar, School, ShieldCheck, AlertCircle,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import {
  Card, AnnouncementCard, EmptyState, SectionHeader,
} from '../../components/dashboard'
import { useParentMessages } from '../../hooks/useParentMessages'
import { type Announcement } from '../../utils/mockData'

const CATEGORY_ICON = {
  school: School,
  staff:  ShieldCheck,
  event:  Calendar,
  admin:  Megaphone,
} as const

export default function ParentMessagesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()

  const TAB_DEFS: { id: string; label: string; filter: (a: Announcement) => boolean }[] = [
    { id: 'all',    label: t('parent.all'),    filter: ()  => true },
    { id: 'urgent', label: t('parent.urgent'), filter: a   => a.priority === 'urgent' },
    { id: 'school', label: t('parent.school'), filter: a   => a.category === 'school' || a.category === 'admin' },
    { id: 'event',  label: t('parent.events'), filter: a   => a.category === 'event' },
  ]
  const { messages: liveMessages } = useParentMessages()
  const [activeTab, setActiveTab] = useState('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Announcement | null>(null)

  // Already sorted desc by createdAt in the hook subscription
  const allMessages = liveMessages

  const filtered = useMemo(() => {
    const tab = TAB_DEFS.find(t => t.id === activeTab) ?? TAB_DEFS[0]
    const byTab = allMessages.filter(tab.filter)
    const q = query.trim().toLowerCase()
    if (!q) return byTab
    return byTab.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q)  ||
      m.author.toLowerCase().includes(q),
    )
  }, [allMessages, activeTab, query])

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          {t('tabs.messages')}
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {t('parent.messagesReceived', { count: allMessages.length })}
        </Text>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Search size={16} color={theme.textSoft} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('parent.searchMessages')}
          placeholderTextColor={theme.textMuted}
          style={{
            flex: 1,
            color: theme.text,
            fontFamily: theme.fonts.regular,
            fontSize: 13,
            marginStart: 8,
            paddingVertical: 0,
          }}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={theme.textSoft} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.tabs}
      >
        {TAB_DEFS.map(t => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: activeTab === t.id ? theme.primary : theme.surface,
                borderColor:     activeTab === t.id ? theme.primary : theme.border,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={{
              color: activeTab === t.id ? '#fff' : theme.text,
              fontFamily: theme.fonts.semibold,
              fontSize: 12.5,
            }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionHeader
            title={t('parent.inbox')}
            subtitle={t('parent.results', { count: filtered.length })}
          />
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title={t('parent.noMessage')}
                message={query ? t('parent.tryKeyword') : t('parent.emptyCategory')}
              />
            </Card>
          ) : (
            filtered.map(m => (
              <AnnouncementCard key={m.id} item={m} onPress={() => setDetail(m)} />
            ))
          )}
        </View>
      </ScrollView>

      <AnnouncementDetailModal
        item={detail}
        onClose={() => setDetail(null)}
        theme={theme}
      />
    </SafeAreaView>
  )
}

function AnnouncementDetailModal({
  item, onClose, theme,
}: { item: Announcement | null; onClose: () => void; theme: any }) {
  const { t } = useTranslation()
  if (!item) return null
  const Icon = CATEGORY_ICON[item.category] ?? Megaphone
  const isUrgent = item.priority === 'urgent'
  const date = new Date(item.date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHeader}>
            <View style={[
              styles.iconBig,
              { backgroundColor: isUrgent ? theme.primary : theme.primarySurface },
            ]}>
              <Icon size={20} color={isUrgent ? '#fff' : theme.primary} strokeWidth={2.2} />
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {isUrgent ? (
              <View style={[styles.urgentBadge, { backgroundColor: theme.primary }]}>
                <AlertCircle size={11} color="#fff" strokeWidth={2.5} />
                <Text style={{
                  color: '#fff',
                  fontFamily: theme.fonts.bold,
                  fontSize: 10,
                  letterSpacing: 0.6,
                  marginStart: 4,
                }}>
                  URGENT
                </Text>
              </View>
            ) : null}

            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize.h3,
              marginTop: 12,
              letterSpacing: -0.3,
            }}>
              {item.title}
            </Text>

            <View style={styles.metaRow}>
              <Text style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.semibold,
                fontSize: 12,
              }}>
                {item.author}
              </Text>
              <View style={[styles.dot, { backgroundColor: theme.textMuted }]} />
              <Text style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.regular,
                fontSize: 12,
              }}>
                {date}
              </Text>
            </View>

            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.regular,
              fontSize: 14,
              lineHeight: 21,
              marginTop: 14,
            }}>
              {item.body}
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    marginHorizontal: 20,
    marginTop:    8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius: 14,
    borderWidth:  1,
  },
  tabs: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 8 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1,
    marginEnd: 6,
  },
  scroll:  { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 16 },

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
  iconBig: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, marginTop: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     8, gap: 8,
  },
  dot: { width: 3, height: 3, borderRadius: 2 },
})
