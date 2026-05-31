/**
 * TeacherDashboardScreen — premium SaaS dashboard for the teacher role.
 *
 * Every card / action / quick-action is wired to navigation or a modal.
 * KPIs read real Firestore data via useTeacherData().
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Text, Pressable, Image,
  Alert, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import {
  Users,
  CalendarClock, Megaphone, BarChart3, Sparkles, X, Clock, MapPin,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import { useTeacherMessages } from '../../hooks/useTeacherMessages'
import {
  SectionHeader, Card,
  ScheduleItem, AnnouncementCard, QuickActions,
  PerformanceBars, SkeletonRow, EmptyState,
} from '../../components/dashboard'
import {
  type ScheduleEntry, type Announcement, type QuickAction,
} from '../../utils/mockData'
import { greetingKey, formatLongDate } from '../../utils/format'

const TEACHER_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa1', label: 'Faire l\'appel',  labelKey: 'actions.takeAttendance', icon: 'check-circle', tint: 'primary' },
  { id: 'qa3', label: 'Nouveau devoir',  labelKey: 'actions.newHomework',    icon: 'book-open',    tint: 'info'    },
  { id: 'qa4', label: 'Envoyer message', labelKey: 'actions.sendMessage',    icon: 'send',         tint: 'success' },
  { id: 'qa5', label: 'À traiter',       labelKey: 'actions.toPending',      icon: 'pencil-line',  tint: 'accent'  },
]

const QUICK_ACTION_ROUTES: Record<string, string> = {
  qa3: 'TeacherDevoirs',   // Nouveau devoir
  qa4: 'TeacherMessages',  // Envoyer message
  qa5: 'TeacherDevoirs',   // À traiter → devoirs
}

function seanceForSlot(entry: ScheduleEntry): string {
  if ((entry as any).seance) return (entry as any).seance
  const seances: Record<string, string> = {
    '08:30': 'S1', '09:30': 'S2', '10:30': 'S3', '11:30': 'S4',
    '13:00': 'S5', '14:00': 'S6',
  }
  return seances[entry.startTime] || 'S1'
}

export default function TeacherDashboardScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, logout } = useAuth()
  const teacher = useTeacherData()
  const { messages: teacherInbox } = useTeacherMessages()
  const nav = useNavigation<any>()
  const [refreshing, setRefreshing] = useState(false)
  const loading = teacher.loading

  const [schDetail, setSchDetail] = useState<ScheduleEntry | null>(null)
  const [annDetail, setAnnDetail] = useState<Announcement | null>(null)

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Enseignant(e)'

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }, [])

  const goTo = (route: string) => nav.navigate(route)

  const handleQuickAction = (action: QuickAction) => {
    // Cas spécial : "Faire l'appel" cible directement le cours en cours
    // (ou le prochain, ou le 1er du jour, sinon affiche un message)
    if (action.id === 'qa1') {
      const slots = teacher.todaySlots
      const target = slots.find(s => s.status === 'now')
                  ?? slots.find(s => s.status === 'upcoming')
                  ?? slots[0]
      if (target) {
        nav.navigate('TeacherAttendance', {
          classe: target.classe,
          seance: seanceForSlot(target),
        })
      } else {
        Alert.alert(
          t('teacher.noCourseAlert'),
          t('teacher.noCourseAlertMsg'),
        )
      }
      return
    }
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  const handleAccountPress = () => {
    Alert.alert(
      fullName,
      profile?.email ?? t('teacher.accountTeacher'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.logout'),
          style: 'destructive',
          onPress: () => logout().catch(() => {}),
        },
      ],
    )
  }

  const enrichedActions = useMemo(() =>
    TEACHER_QUICK_ACTIONS.map(a =>
      a.id === 'qa5' ? { ...a, badge: teacher.kpis.pending } : a,
    ),
  [teacher.kpis.pending])

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Watercolor blobs background (same as ScreenLayout) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
        <Image source={require('../../../assets/logo.png')} resizeMode="contain" style={{ width: 240, height: 240, opacity: 0.08 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
          />
        }
      >
        {/* ── Header strip ──────────────────────────────── */}
        <View style={[styles.headerStrip, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <Pressable onPress={handleAccountPress} hitSlop={8} style={styles.accountBlock}>
            <Text numberOfLines={1} style={{
              color: theme.text,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              fontSize: isAr ? 16 : 15,
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t(greetingKey())}, {fullName.split(' ')[0] || 'Professeur'}
            </Text>
            <Text style={{
              color: theme.textSoft,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              fontSize: 11,
              letterSpacing: isAr ? 0 : 0.5,
              marginTop: 2,
              textTransform: 'uppercase',
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t('roles.teacher')}
            </Text>
          </Pressable>
          <Pressable onPress={() => goTo('TeacherMessages')} hitSlop={8} style={[styles.headerIconButton, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
            <Megaphone size={18} color={theme.accent} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* ── Today's schedule ──────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacher.todaySchedule')}
            subtitle={t('teacher.today')}
            actionLabel={t('common.seeAll')}
            onAction={() => goTo('TeacherEdt')}
          />
          <Card padding={12}>
            {loading ? (
              <>
                <SkeletonRow /><SkeletonRow /><SkeletonRow />
              </>
            ) : teacher.todaySlots.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={t('teacher.noCourseToday')}
                message={t('teacher.noCourseMsg')}
              />
            ) : (
              teacher.todaySlots.map(s => (
                <ScheduleItem
                  key={s.id}
                  item={s}
                  onPress={() => setSchDetail(s)}
                />
              ))
            )}
          </Card>
        </View>

        {/* ── Quick actions (4 solid tiles) ─────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacher.quickActions')}
          />
          <QuickActions actions={enrichedActions} onPress={handleQuickAction} />
        </View>

        {/* ── Class performance ─────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacher.classPerformance')}
            subtitle={t('teacher.perfSubtitle')}
            actionLabel={t('teacher.see')}
            onAction={() => goTo('TeacherStats')}
          />
          <Pressable
            onPress={() => goTo('TeacherStats')}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [pressed && { opacity: 0.96 }]}
          >
            <Card>
              <View style={styles.perfHeader}>
                <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.legendText, { color: theme.textSoft }]}>{t('teacher.avgLabel')}</Text>
                <View style={[styles.legendDot, { backgroundColor: theme.accent, marginStart: 14 }]} />
                <Text style={[styles.legendText, { color: theme.textSoft }]}>{t('teacher.topNote')}</Text>
                <View style={{ flex: 1 }} />
                <BarChart3 size={16} color={theme.textMuted} strokeWidth={2} />
              </View>
              <PerformanceBars data={teacher.classPerformance} />
            </Card>
          </Pressable>
        </View>

        {/* ── Announcements ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('teacher.recentAnnouncements')}
            actionLabel={t('common.seeMore')}
            onAction={() => goTo('TeacherMessages')}
          />
          {loading ? (
            <Card padding={12}><SkeletonRow /><SkeletonRow /></Card>
          ) : teacherInbox.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title={t('parent.noAnnouncements')}
                message={t('teacher.noAnnouncementMsg')}
              />
            </Card>
          ) : (
            <View>
              {teacherInbox.map(a => (
                <AnnouncementCard
                  key={a.id}
                  item={a}
                  onPress={() => setAnnDetail(a)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Footer accent ─────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            marginStart: 6,
            letterSpacing: 0.3,
          }}>
            Mojammaa Al Maarifa — version mobile
          </Text>
        </View>
      </ScrollView>

      {/* Detail modals */}
      <ScheduleDetailModal
        item={schDetail}
        onClose={() => setSchDetail(null)}
        onOpenEdt={() => { setSchDetail(null); goTo('TeacherEdt') }}
        theme={theme}
      />
      <AnnouncementDetailModal
        item={annDetail}
        onClose={() => setAnnDetail(null)}
        theme={theme}
      />
    </SafeAreaView>
  )
}

function ScheduleDetailModal({
  item, onClose, onOpenEdt, theme,
}: { item: ScheduleEntry | null; onClose: () => void; onOpenEdt: () => void; theme: Theme }) {
  const { t } = useTranslation()
  if (!item) return null
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHeaderRow}>
            <View style={[styles.iconBig, { backgroundColor: theme.primarySurface }]}>
              <CalendarClock size={20} color={theme.primary} strokeWidth={2.2} />
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>
          <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>
            {item.subject}
          </Text>
          <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
            <Clock size={14} color={theme.textSoft} strokeWidth={2} />
            <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
              {item.startTime} → {item.endTime}
            </Text>
          </View>
          <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
            <Users size={14} color={theme.textSoft} strokeWidth={2} />
            <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
              {item.classe}
            </Text>
          </View>
          <View style={[styles.metaRow, { backgroundColor: theme.surface }]}>
            <MapPin size={14} color={theme.textSoft} strokeWidth={2} />
            <Text style={{ color: theme.text, fontFamily: theme.fonts.medium, fontSize: 13, marginStart: 8 }}>
              {item.room}
            </Text>
          </View>
          <Pressable
            onPress={onOpenEdt}
            android_ripple={{ color: theme.border }}
            style={[styles.cta, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 13 }}>
              {t('teacher.seeFullSchedule')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function AnnouncementDetailModal({
  item, onClose, theme,
}: { item: Announcement | null; onClose: () => void; theme: Theme }) {
  if (!item) return null
  const date = formatLongDate(item.date)
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.sheetHeaderRow}>
            <View style={[styles.iconBig, { backgroundColor: theme.primarySurface }]}>
              <Megaphone size={20} color={theme.primary} strokeWidth={2.2} />
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>
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
              {item.author} · {date}
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

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  headerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountBlock: {
    flex: 1,
    paddingVertical: 2,
  },
  headerIconButton: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },
  section: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  perfHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  10,
  },
  legendDot:  { width: 8, height: 8, borderRadius: 4, marginEnd: 5 },
  legendText: { fontSize: 11, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
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
  sheetHeaderRow: {
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
  sheetTitle: {
    fontSize: 20, marginTop: 12, letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, marginTop: 8,
  },
  cta: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, marginTop: 16,
  },
})
