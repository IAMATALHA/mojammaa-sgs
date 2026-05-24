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
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { useNavigation } from '@react-navigation/native'
import {
  Megaphone, BookOpen, CalendarDays, Users, X, MapPin, Clock,
  CalendarCheck, MessageCircle, SunMedium, GraduationCap,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents'
import { useParentMessages } from '../../hooks/useParentMessages'
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
  const { messages: liveMessages, loading: messagesLoading } = useParentMessages()
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

  const announcementsForDashboard = useMemo(
    () => (liveMessages.length > 0 ? liveMessages : PARENT_ANNOUNCEMENTS).slice(0, 3),
    [liveMessages],
  )

  const familyAttendance = useMemo(() => {
    if (parent.children.length === 0) return 0
    const total = parent.children.reduce((sum, child) => sum + child.attendance, 0)
    return Math.round(total / parent.children.length)
  }, [parent.children])

  const pendingHomeworkCount = useMemo(
    () => parent.children.reduce((sum, child) => sum + child.pendingHomework, 0),
    [parent.children],
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
      <View style={[styles.bgBlob, styles.bgBlobTop, { backgroundColor: theme.brandYellowSoft }]} />
      <View style={[styles.bgBlob, styles.bgBlobMiddle, { backgroundColor: theme.schoolSkySoft }]} />
      <View style={[styles.bgBlob, styles.bgBlobBottom, { backgroundColor: theme.brandCoralSoft }]} />
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
          notifications={liveMessages.length || 2}
          onPressBell={() => goTo('StudentMessages')}
          onPressAvatar={handleAvatarPress}
        />

        <TodayStoryCard
          childrenCount={parent.children.length}
          attendance={familyAttendance}
          homeworkCount={pendingHomeworkCount}
          messageCount={announcementsForDashboard.length}
          onPressAbsences={() => goTo('StudentAbsences')}
          onPressMessages={() => goTo('StudentMessages')}
          theme={theme}
        />

        <View style={styles.section}>
          <SectionHeader
            title="Mes enfants"
            subtitle={`${parent.children.length} profil${parent.children.length > 1 ? 's' : ''} actif${parent.children.length > 1 ? 's' : ''}`}
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

        <View style={styles.section}>
          <SectionHeader
            title="Présence"
            subtitle={selectedChild ? `${selectedChild.firstName} · ${selectedChild.classe}` : undefined}
            actionLabel="Détail"
            onAction={() => goTo('StudentAbsences')}
          />
          <Pressable
            onPress={() => goTo('StudentAbsences')}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [pressed && { opacity: 0.96 }]}
          >
            <Card padding={18} style={styles.attendanceCard}>
              <View style={styles.attendanceRow}>
                <AttendanceRing
                  value={selectedChild?.attendance ?? 0}
                  caption="présence"
                  progressColor={theme.brandOrange}
                />
                <View style={styles.attendanceMeta}>
                  <Stat
                    label="Moyenne"
                    value={selectedChild ? `${selectedChild.averageGrade.toFixed(1)}/20` : '—'}
                    color={theme.brandYellow}
                    theme={theme}
                  />
                  <Stat
                    label="Devoirs à faire"
                    value={String(selectedChild?.pendingHomework ?? 0)}
                    color={theme.brandOrange}
                    theme={theme}
                  />
                  <Stat
                    label="Classe"
                    value={selectedChild?.classe ?? '—'}
                    color={theme.brandNavy}
                    theme={theme}
                  />
                </View>
              </View>
            </Card>
          </Pressable>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Devoirs récents"
            subtitle={selectedChild ? `Pour ${selectedChild.firstName}` : undefined}
            actionLabel="Tout voir"
            onAction={() => goTo('StudentDevoirs')}
          />
          <Card padding={10}>
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

        <View style={styles.section}>
          <SectionHeader
            title="Annonces"
            subtitle={liveMessages.length > 0 ? 'Messages récents de l’école' : 'Dernières informations'}
            actionLabel="Voir plus"
            onAction={() => goTo('StudentMessages')}
          />
          {messagesLoading ? (
            <Card padding={12}>
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : announcementsForDashboard.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title="Pas d'annonce pour l'instant"
              />
            </Card>
          ) : (
            <View>
              {announcementsForDashboard.map(a => (
                <AnnouncementCard
                  key={a.id}
                  item={a}
                  onPress={() => setAnnDetail(a)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Agenda"
            subtitle="À noter cette semaine"
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

        <View style={styles.section}>
          <SectionHeader
            title="Accès rapide"
            subtitle="Les raccourcis du quotidien"
          />
          <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
        </View>

        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            letterSpacing: 0,
          }}>
            Mojammaa Al Maarifa · مجمع المعرفة
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

function TodayStoryCard({
  childrenCount, attendance, homeworkCount, messageCount,
  onPressAbsences, onPressMessages, theme,
}: {
  childrenCount: number
  attendance: number
  homeworkCount: number
  messageCount: number
  onPressAbsences: () => void
  onPressMessages: () => void
  theme: any
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 460, delay: 80 }}
      style={styles.todayWrap}
    >
      <LinearGradient
        colors={[theme.paper, theme.brandCream, '#FFF8EA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.todayCard,
          {
            borderColor: 'rgba(29, 53, 87, 0.12)',
            shadowColor: theme.brandNavy,
          },
          theme.shadows.sm,
        ]}
      >
        <View style={[styles.todayGlow, { backgroundColor: theme.brandYellowSoft }]} />
        <View style={[styles.todayGlowSmall, { backgroundColor: theme.brandCoralSoft }]} />
        <View style={[styles.todayGlowSky, { backgroundColor: theme.schoolSkySoft }]} />

        <View style={styles.todayTextBlock}>
          <View style={[styles.todayKicker, { backgroundColor: theme.brandNavySoft }]}>
            <SunMedium size={13} color={theme.brandOrange} strokeWidth={2} />
            <Text style={{
              color: theme.brandNavy,
              fontFamily: theme.fonts.semibold,
              fontSize: 11,
            }}>
              Aujourd'hui
            </Text>
          </View>
          <Text style={{
            color: theme.brandNavy,
            fontFamily: theme.fonts.black,
            fontSize: 21,
            lineHeight: 27,
          }}>
            Suivi familial, clair et élégant.
          </Text>
        </View>

        <View style={styles.snapshotGrid}>
          <SnapshotPill
            icon={<GraduationCap size={15} color={theme.brandNavy} strokeWidth={2} />}
            label="Enfants"
            value={String(childrenCount)}
            theme={theme}
          />
          <SnapshotPill
            icon={<CalendarCheck size={15} color={theme.brandNavy} strokeWidth={2} />}
            label="Présence"
            value={`${attendance}%`}
            onPress={onPressAbsences}
            theme={theme}
          />
          <SnapshotPill
            icon={<BookOpen size={15} color={theme.brandNavy} strokeWidth={2} />}
            label="Devoirs"
            value={String(homeworkCount)}
            theme={theme}
          />
          <SnapshotPill
            icon={<MessageCircle size={15} color={theme.brandNavy} strokeWidth={2} />}
            label="Messages"
            value={String(messageCount)}
            onPress={onPressMessages}
            theme={theme}
          />
        </View>
      </LinearGradient>
    </MotiView>
  )
}

function SnapshotPill({
  icon, label, value, onPress, theme,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onPress?: () => void
  theme: any
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.snapshotPressable}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed ? 0.97 : 1, opacity: pressed ? 0.9 : 1 }}
          transition={{ type: 'timing', duration: 160 }}
          style={[styles.snapshotPill, { backgroundColor: theme.white }]}
        >
          <View style={[styles.snapshotIcon, { backgroundColor: theme.brandYellowSoft }]}>
            {icon}
          </View>
          <View style={styles.snapshotCopy}>
            <Text style={{
              color: theme.brandNavy,
              fontFamily: theme.fonts.black,
              fontSize: 15,
              fontVariant: ['tabular-nums'],
            }}>
              {value}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.medium,
                fontSize: 10.5,
              }}
            >
              {label}
            </Text>
          </View>
        </MotiView>
      )}
    </Pressable>
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
          letterSpacing: 0,
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
          letterSpacing: 0,
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
  bgBlobTop: {
    width: 180,
    height: 180,
    top: -42,
    right: -46,
  },
  bgBlobMiddle: {
    width: 104,
    height: 104,
    top: 330,
    left: -34,
  },
  bgBlobBottom: {
    width: 170,
    height: 170,
    bottom: 80,
    right: -58,
  },
  scroll: { paddingBottom: 132 },
  todayWrap: {
    paddingHorizontal: 18,
    marginTop: 16,
  },
  todayCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 16,
    minHeight: 196,
  },
  todayGlow: {
    position: 'absolute',
    width: 216,
    height: 112,
    borderRadius: 999,
    top: -42,
    right: -54,
    transform: [{ rotate: '-17deg' }],
  },
  todayGlowSmall: {
    position: 'absolute',
    width: 168,
    height: 92,
    borderRadius: 999,
    bottom: 62,
    left: -42,
    transform: [{ rotate: '18deg' }],
  },
  todayGlowSky: {
    position: 'absolute',
    width: 142,
    height: 78,
    borderRadius: 999,
    right: 30,
    bottom: -22,
    transform: [{ rotate: '-14deg' }],
  },
  todayTextBlock: {
    maxWidth: 235,
  },
  todayKicker: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 18,
  },
  snapshotPressable: {
    width: '47%',
    flexGrow: 1,
  },
  snapshotPill: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  snapshotIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotCopy: {
    flex: 1,
  },
  section: { paddingHorizontal: 20, marginTop: 24 },
  attendanceCard: {
    backgroundColor: '#FFFDF8',
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    flexWrap:      'wrap',
    gap:           16,
  },
  attendanceMeta: { flex: 1, minWidth: 148, gap: 11 },
  stat: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    backgroundColor: 'rgba(29, 53, 87, 0.04)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statDot: { width: 9, height: 9, borderRadius: 5 },
  footer: {
    alignItems:    'center',
    justifyContent:'center',
    marginTop:     28,
    paddingBottom: 10,
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
    letterSpacing: 0,
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
