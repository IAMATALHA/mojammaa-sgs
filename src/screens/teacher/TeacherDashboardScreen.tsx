/**
 * TeacherDashboardScreen — premium SaaS dashboard for the teacher role.
 *
 * Every card / action / quick-action is wired to navigation or a modal.
 * KPIs read real Firestore data via useTeacherData().
 */

import React, { useCallback, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Text, Pressable,
  Alert, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import {
  Users, GraduationCap, CheckCircle2, ListTodo,
  CalendarClock, Megaphone, BarChart3, Sparkles, X, Clock, MapPin,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import {
  DashboardHeader, SectionHeader, StatCard, Card,
  ScheduleItem, AnnouncementCard, QuickActions,
  PerformanceBars, SkeletonCard, SkeletonRow, EmptyState,
} from '../../components/dashboard'
import {
  TEACHER_ANNOUNCEMENTS,
  TEACHER_QUICK_ACTIONS, CLASS_PERFORMANCE,
  type ScheduleEntry, type Announcement, type QuickAction,
} from '../../utils/mockData'

function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

// Mapping action.id → tab route (qa1 = "Faire l'appel" is handled separately)
const QUICK_ACTION_ROUTES: Record<string, string> = {
  qa2: 'TeacherClasses',   // Saisir une note
  qa3: 'TeacherDevoirs',   // Nouveau devoir
  qa4: 'TeacherCompose',   // Envoyer message → direct au form de compose
}

// Convertit l'heure de début d'un créneau → identifiant séance MASSAR
function timeToSeance(startTime: string): string {
  const seances: Record<string, string> = {
    '08:30': 'S1', '09:30': 'S2', '10:30': 'S3', '11:30': 'S4',
    '13:00': 'S5', '14:00': 'S6',
  }
  return seances[startTime] || 'S1'
}

export default function TeacherDashboardScreen() {
  const theme = useTheme()
  const { profile, logout } = useAuth()
  const teacher = useTeacherData()
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
          seance: timeToSeance(target.startTime),
        })
      } else {
        Alert.alert(
          'Pas de cours aujourd\'hui',
          'Va sur l\'onglet Classes pour choisir une classe et faire l\'appel.',
        )
      }
      return
    }
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  const handleAvatarPress = () => {
    Alert.alert(
      fullName,
      profile?.email ?? 'Compte enseignant',
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
          roleLabel="Enseignant"
          notifications={3}
          onPressBell={() => goTo('TeacherMessages')}
          onPressAvatar={handleAvatarPress}
        />

        {/* ── KPI row ────────────────────────────────────────── */}
        <View style={styles.kpiRow}>
          {loading ? (
            <>
              <SkeletonCard /><SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                icon={<GraduationCap size={18} color={theme.primary} strokeWidth={2.2} />}
                value={teacher.kpis.classes}
                label="Classes"
                tint="primary"
                onPress={() => goTo('TeacherClasses')}
              />
              <StatCard
                icon={<Users size={18} color={theme.info} strokeWidth={2.2} />}
                value={teacher.kpis.students}
                label="Élèves"
                tint="info"
                onPress={() => goTo('TeacherClasses')}
              />
            </>
          )}
        </View>
        <View style={[styles.kpiRow, { marginTop: 10 }]}>
          <StatCard
            icon={<CheckCircle2 size={18} color={theme.success} strokeWidth={2.2} />}
            value={`${teacher.kpis.attendance}%`}
            label="Présence"
            tint="success"
            onPress={() => goTo('TeacherClasses')}
          />
          <StatCard
            icon={<ListTodo size={18} color={theme.warning} strokeWidth={2.2} />}
            value={teacher.kpis.pending}
            label="À traiter"
            tint="warning"
            onPress={() => goTo('TeacherDevoirs')}
          />
        </View>

        {/* ── Today's schedule ──────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Emploi du temps"
            subtitle="Aujourd'hui"
            actionLabel="Tout voir"
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
                title="Aucun cours aujourd'hui"
                message="Profitez d'une journée calme — ou consultez la semaine."
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

        {/* ── Announcements ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Annonces récentes"
            actionLabel="Voir plus"
            onAction={() => goTo('TeacherMessages')}
          />
          {loading ? (
            <Card padding={12}><SkeletonRow /><SkeletonRow /></Card>
          ) : TEACHER_ANNOUNCEMENTS.length === 0 ? (
            <Card>
              <EmptyState
                icon={Megaphone}
                title="Pas d'annonce pour l'instant"
                message="Les communications de la direction apparaîtront ici."
              />
            </Card>
          ) : (
            <View>
              {TEACHER_ANNOUNCEMENTS.map(a => (
                <AnnouncementCard
                  key={a.id}
                  item={a}
                  onPress={() => setAnnDetail(a)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Class performance ─────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Performance des classes"
            subtitle="Moyenne · top note"
            actionLabel="Voir"
            onAction={() => goTo('TeacherClasses')}
          />
          <Pressable
            onPress={() => goTo('TeacherClasses')}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [pressed && { opacity: 0.96 }]}
          >
            <Card>
              <View style={styles.perfHeader}>
                <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.legendText, { color: theme.textSoft }]}>Moyenne</Text>
                <View style={[styles.legendDot, { backgroundColor: theme.accent, marginStart: 14 }]} />
                <Text style={[styles.legendText, { color: theme.textSoft }]}>Top note</Text>
                <View style={{ flex: 1 }} />
                <BarChart3 size={16} color={theme.textMuted} strokeWidth={2} />
              </View>
              <PerformanceBars data={CLASS_PERFORMANCE} />
            </Card>
          </Pressable>
        </View>

        {/* ── Quick actions ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Actions rapides"
            subtitle="Raccourcis fréquents"
          />
          <QuickActions actions={TEACHER_QUICK_ACTIONS} onPress={handleQuickAction} />
        </View>

        {/* ── Footer accent ─────────────────────────────────── */}
        <View style={styles.footer}>
          <Sparkles size={12} color={theme.accent} strokeWidth={2.2} />
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            marginStart: 6,
            letterSpacing: 0.3,
          }}>
            Mojammaa SGS — version mobile
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
}: { item: ScheduleEntry | null; onClose: () => void; onOpenEdt: () => void; theme: any }) {
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
              Voir l'emploi du temps complet
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
    weekday: 'long', day: 'numeric', month: 'long',
  })
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
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
  },
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
