/**
 * ParentDashboardScreen — premium SaaS dashboard for the parent role.
 *
 * Sections:
 *   1. Header (welcome + avatar + bell)
 *   2. "My children" cards
 *   3. Attendance overview ring (selected child / aggregate)
 *   4. Recent homework
 *   5. Recent announcements
 *   6. Upcoming events
 *   7. Quick actions
 *
 * All interactions are wired to navigation or modals — no dead UI.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text,
  Alert, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import {
  Megaphone, BookOpen, CalendarDays, Users, X, MapPin, Clock,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents'
import {
  DashboardHeader, SectionHeader, Card,
  ChildCard, AttendanceRing, HomeworkRow, AnnouncementCard,
  EventCard, QuickActions, EmptyState, SkeletonRow,
} from '../../components/dashboard'
import {
  PARENT_RECENT_HOMEWORK, PARENT_ANNOUNCEMENTS,
  PARENT_QUICK_ACTIONS,
  type Announcement, type HomeworkItem, type UpcomingEvent, type QuickAction,
} from '../../utils/mockData'

function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

// Map quick-action ids → parent tab routes
const QUICK_ACTION_ROUTES: Record<string, string> = {
  pqa1: 'StudentNotes',     // Voir bulletin
  pqa2: 'StudentAbsences',  // Absences
  pqa3: 'StudentDevoirs',   // Devoirs
  pqa4: 'StudentMessages',  // Contacter prof
}

export default function ParentDashboardScreen() {
  const theme = useTheme()
  const { profile, logout } = useAuth()
  const parent = useParentData()
  const { events: upcomingEvents } = useUpcomingEvents(6)
  const nav = useNavigation<any>()
  const [refreshing, setRefreshing] = useState(false)
  const loading = parent.loading
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  // Detail modal state
  const [hwDetail,    setHwDetail]    = useState<HomeworkItem | null>(null)
  const [annDetail,   setAnnDetail]   = useState<Announcement | null>(null)
  const [eventDetail, setEventDetail] = useState<UpcomingEvent | null>(null)

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Parent'

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }, [])

  // Auto-select the first child once data loads
  useEffect(() => {
    if (parent.children.length > 0 && !selectedChildId) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedChild = useMemo(
    () => parent.children.find(c => c.id === selectedChildId) ?? parent.children[0],
    [parent.children, selectedChildId],
  )

  const homeworkForSelected = useMemo(
    () => PARENT_RECENT_HOMEWORK.filter(h => h.childId === selectedChild?.id).slice(0, 4),
    [selectedChild],
  )

  // ── Navigation handlers ────────────────────────────────────────────
  const goTo = (route: string) => nav.navigate(route)

  const handleQuickAction = (action: QuickAction) => {
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  const handleAvatarPress = () => {
    Alert.alert(
      fullName,
      profile?.email ?? 'Compte parent',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: () => logout().catch(() => {}),
        },
      ],
    )
  }

  const childName = (id: string): string => {
    const c = parent.children.find(x => x.id === id)
    return c ? c.firstName : ''
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}> 
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        <DashboardHeader
          greeting={`${greetingFor()},`}
          fullName={fullName}
          roleLabel="Parent"
          notifications={2}
          onPressBell={() => goTo('StudentMessages')}
          onPressAvatar={handleAvatarPress}
        />

        {/* ── My Children ───────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Mes enfants"
            subtitle={`${parent.children.length} enfant${parent.children.length > 1 ? 's' : ''}`}
            actionLabel="Voir tout"
            onAction={() => goTo('StudentNotes')}
          />
          {parent.children.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="Aucun enfant associé"
                message="Contactez l'établissement pour lier votre compte à votre enfant."
              />
            </Card>
          ) : (
            parent.children.map(c => (
              <ChildCard
                key={c.id}
                child={c}
                onPress={() => {
                  setSelectedChildId(c.id)
                  goTo('StudentNotes')
                }}
              />
            ))
          )}
        </View>

        {/* ── Attendance overview ──────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Aperçu de la présence"
            subtitle={selectedChild ? `${selectedChild.firstName} · ${selectedChild.classe}` : undefined}
            actionLabel="Détail"
            onAction={() => goTo('StudentAbsences')}
          />
          <Pressable
            onPress={() => goTo('StudentAbsences')}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [pressed && { opacity: 0.96 }]}
          >
            <Card>
              <View style={styles.attendanceRow}>
                <AttendanceRing
                  value={selectedChild?.attendance ?? 0}
                  caption="présence"
                  progressColor={theme.accent}
                />
                <View style={styles.attendanceMeta}>
                  <Stat
                    label="Moyenne"
                    value={selectedChild ? `${selectedChild.averageGrade.toFixed(1)}/20` : '—'}
                    color={theme.success}
                    theme={theme}
                  />
                  <Stat
                    label="Devoirs à faire"
                    value={String(selectedChild?.pendingHomework ?? 0)}
                    color={theme.warning}
                    theme={theme}
                  />
                  <Stat
                    label="Classe"
                    value={selectedChild?.classe ?? '—'}
                    color={theme.primary}
                    theme={theme}
                  />
                </View>
              </View>
            </Card>
          </Pressable>
        </View>

        {/* ── Recent homework ───────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Devoirs récents"
            subtitle={selectedChild ? `Pour ${selectedChild.firstName}` : undefined}
            actionLabel="Tout voir"
            onAction={() => goTo('StudentDevoirs')}
          />
          <Card padding={12}>
            {loading ? (
              <><SkeletonRow /><SkeletonRow /></>
            ) : homeworkForSelected.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="Aucun devoir en attente"
                message="Les nouveaux devoirs s'afficheront ici."
              />
            ) : (
              homeworkForSelected.map(h => (
                <HomeworkRow
                  key={h.id}
                  item={h}
                  childName={selectedChild?.firstName}
                  onPress={() => setHwDetail(h)}
                />
              ))
            )}
          </Card>
        </View>

        {/* ── Announcements ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Annonces"
            actionLabel="Voir plus"
            onAction={() => goTo('StudentMessages')}
          />
          {PARENT_ANNOUNCEMENTS.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title="Pas d'annonce pour l'instant"
              />
            </Card>
          ) : (
            <View>
              {PARENT_ANNOUNCEMENTS.map(a => (
                <AnnouncementCard
                  key={a.id}
                  item={a}
                  onPress={() => setAnnDetail(a)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Upcoming events ───────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Prochains événements"
            actionLabel="Calendrier"
            onAction={() => goTo('StudentMessages')}
          />
          <Card padding={12}>
            {upcomingEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Aucun événement à venir"
              />
            ) : (
              upcomingEvents.map(e => (
                <EventCard
                  key={e.id}
                  event={e}
                  onPress={() => setEventDetail(e)}
                />
              ))
            )}
          </Card>
        </View>

        {/* ── Quick actions ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Accès rapide"
            subtitle="Petites cartes pour accéder aux essentiels"
          />
          <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
        </View>

        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            letterSpacing: 0.3,
          }}>
            Mojammaa SGS — un espace parent chaleureux et illustré
          </Text>
        </View>
      </ScrollView>

      {/* Detail modals */}
      <HomeworkDetailModal
        item={hwDetail}
        childName={hwDetail ? childName(hwDetail.childId) : ''}
        onClose={() => setHwDetail(null)}
        onOpenList={() => { setHwDetail(null); goTo('StudentDevoirs') }}
        theme={theme}
      />
      <AnnouncementDetailModal
        item={annDetail}
        onClose={() => setAnnDetail(null)}
        theme={theme}
      />
      <EventDetailModal
        item={eventDetail}
        onClose={() => setEventDetail(null)}
        theme={theme}
      />
    </SafeAreaView>
  )
}

function Stat({
  label, value, color, theme,
}: { label: string; value: string; color: string; theme: any }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.medium,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.bold,
            fontSize: 15,
            marginTop: 2,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

function HomeworkDetailModal({
  item, childName, onClose, onOpenList, theme,
}: {
  item: HomeworkItem | null
  childName: string
  onClose: () => void
  onOpenList: () => void
  theme: any
}) {
  if (!item) return null
  const due = new Date(item.dueDate).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <SheetHeader theme={theme} onClose={onClose} icon={<BookOpen size={20} color={theme.primary} strokeWidth={2.2} />} label={item.subject} />
          <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>
            {item.title}
          </Text>
          <SheetMeta theme={theme} icon={<Clock size={14} color={theme.textSoft} strokeWidth={2} />} text={due} />
          {childName ? (
            <SheetMeta theme={theme} icon={<Users size={14} color={theme.textSoft} strokeWidth={2} />} text={childName} />
          ) : null}
          <Pressable
            onPress={onOpenList}
            android_ripple={{ color: theme.border }}
            style={[styles.cta, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 13 }}>
              Voir tous les devoirs
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function AnnouncementDetailModal({
  item, onClose, theme,
}: { item: Announcement | null; onClose: () => void; theme: any }) {
  if (!item) return null
  const date = new Date(item.date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <SheetHeader theme={theme} onClose={onClose} icon={<Megaphone size={20} color={theme.primary} strokeWidth={2.2} />} label={item.author} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>
              {item.title}
            </Text>
            <Text style={{
              color: theme.textSoft, fontFamily: theme.fonts.medium,
              fontSize: 12, marginTop: 4,
            }}>
              {date}
            </Text>
            <Text style={{
              color: theme.text, fontFamily: theme.fonts.regular,
              fontSize: 14, lineHeight: 21, marginTop: 14,
            }}>
              {item.body}
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function EventDetailModal({
  item, onClose, theme,
}: { item: UpcomingEvent | null; onClose: () => void; theme: any }) {
  if (!item) return null
  const date = new Date(item.date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <SheetHeader theme={theme} onClose={onClose} icon={<CalendarDays size={20} color={theme.primary} strokeWidth={2.2} />} label="Événement" />
          <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>
            {item.title}
          </Text>
          <SheetMeta theme={theme} icon={<CalendarDays size={14} color={theme.textSoft} strokeWidth={2} />} text={date} />
          {item.time ? (
            <SheetMeta theme={theme} icon={<Clock size={14} color={theme.textSoft} strokeWidth={2} />} text={item.time} />
          ) : null}
          {item.location ? (
            <SheetMeta theme={theme} icon={<MapPin size={14} color={theme.textSoft} strokeWidth={2} />} text={item.location} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function SheetHeader({
  theme, onClose, icon, label,
}: { theme: any; onClose: () => void; icon: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={[
        styles.sheetIcon,
        { backgroundColor: theme.primarySurface },
      ]}>
        {icon}
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: theme.textSoft,
          fontFamily: theme.fonts.semibold,
          fontSize: 12,
          marginStart: 10,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
        <X size={18} color={theme.text} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

function SheetMeta({
  theme, icon, text,
}: { theme: any; icon: React.ReactNode; text: string }) {
  return (
    <View style={[styles.sheetMetaRow, { backgroundColor: theme.surface }]}>
      {icon}
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.medium,
        fontSize: 13,
        marginStart: 8,
      }}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  bgBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  bgBlob1: {
    width: 280, height: 280,
    top: -100, right: -80,
    opacity: 0.8,
  },
  bgBlob2: {
    width: 180, height: 180,
    top: 220, left: -60,
    opacity: 0.7,
  },
  bgBlob3: {
    width: 220, height: 220,
    top: 450, right: -100,
    opacity: 0.6,
  },
  bgBlob4: {
    width: 140, height: 140,
    bottom: 200, left: -30,
    opacity: 0.8,
  },
  bgBlob5: {
    width: 300, height: 300,
    bottom: -120, right: -120,
    opacity: 0.7,
  },
  scroll: { paddingBottom: 132 },
  section: { paddingHorizontal: 20, marginTop: 28 },
  attendanceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  attendanceMeta: { flex: 1, gap: 12, marginStart: 8 },
  stat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  footer: {
    alignItems:    'center',
    justifyContent:'center',
    marginTop:     28,
  },
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
  sheetIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    marginTop: 12,
    letterSpacing: -0.3,
  },
  sheetMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 8,
  },
  cta: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14,
    marginTop: 16,
  },
})
