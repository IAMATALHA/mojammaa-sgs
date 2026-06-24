/**
 * TeacherDashboardScreen — premium SaaS dashboard for the teacher role.
 *
 * Every card / quick-action is wired to navigation.
 * KPIs read real Firestore data via useTeacherData().
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Text, Pressable, Image,
  Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import type { TeacherDashboardNav } from '../../navigation/types'
import { CalendarClock } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTeacherData } from '../../hooks/useTeacherData'
import {
  Card, ScheduleItem, QuickActions, SkeletonRow, EmptyState,
} from '../../components/dashboard'
import {
  type ScheduleEntry, type QuickAction,
} from '../../utils/dashboardTypes'
import { greetingKey } from '../../utils/format'

const TEACHER_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa1', label: 'Faire l\'appel',  labelKey: 'actions.takeAttendance', icon: 'check-circle', tint: 'primary' },
  { id: 'qa3', label: 'Nouveau devoir',  labelKey: 'actions.newHomework',    icon: 'book-open',    tint: 'info'    },
  { id: 'qa4', label: 'Envoyer message', labelKey: 'actions.sendMessage',    icon: 'send',         tint: 'success' },
  { id: 'qa5', label: 'Performance',     labelKey: 'actions.performance',    icon: 'bar-chart-3',  tint: 'accent'  },
]

type TeacherQuickRoute = 'TeacherEdt' | 'TeacherDevoirs' | 'TeacherMessages' | 'TeacherStats'

const QUICK_ACTION_ROUTES: Record<string, TeacherQuickRoute> = {
  qa3: 'TeacherDevoirs',   // Nouveau devoir
  qa4: 'TeacherMessages',  // Envoyer message
  qa5: 'TeacherStats',     // Performance
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
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile } = useAuth()
  const teacher = useTeacherData()
  const nav = useNavigation<TeacherDashboardNav>()
  const [refreshing, setRefreshing] = useState(false)
  const [showGreeting, setShowGreeting] = useState(true)
  const loading = teacher.loading

  // Le toast de salutation s'affiche une seule fois au montage puis s'efface.
  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(false), 2600)
    return () => clearTimeout(id)
  }, [])

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Enseignant(e)'

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }, [])

  const goTo = (route: TeacherQuickRoute) => nav.navigate(route)

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

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Watercolor blobs background (same as ScreenLayout) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={[styles.blob, styles.blobA, { backgroundColor: theme.watercolorA }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: theme.roseSurface }]} />
        <View style={[styles.blob, styles.blobC, { backgroundColor: theme.violetSurface }]} />
        <Image source={require('../../../assets/logo.png')} resizeMode="contain" accessible={false} importantForAccessibility="no" style={{ width: 240, height: 240, opacity: 0.08 }} />
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
        {/* ── Today's schedule (tap → full EDT) ─────────────── */}
        <View style={[styles.section, styles.firstSection]}>
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
                  onPress={() => goTo('TeacherEdt')}
                />
              ))
            )}
          </Card>
        </View>

        {/* ── Quick actions (4 solid tiles) ─────────────────── */}
        <View style={styles.section}>
          <QuickActions actions={TEACHER_QUICK_ACTIONS} onPress={handleQuickAction} />
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

      {/* ── Floating greeting toast (overlay, hors du flux) ── */}
      <AnimatePresence>
        {showGreeting && (
          <MotiView
            key="greeting"
            from={{ opacity: 0, translateY: -16 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -16 }}
            transition={{ type: 'timing', duration: 320 }}
            pointerEvents="box-none"
            style={[styles.greetingWrap, { top: insets.top + 8 }]}
          >
            <Pressable
              onPress={() => setShowGreeting(false)}
              style={[styles.greetingToast, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.md]}
            >
              <Text numberOfLines={1} style={{
                color: theme.text,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                fontSize: isAr ? 16 : 15,
                writingDirection: isAr ? 'rtl' : 'ltr',
                textAlign: 'center',
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
                textAlign: 'center',
                writingDirection: isAr ? 'rtl' : 'ltr',
              }}>
                {t('roles.teacher')}
              </Text>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  greetingWrap: {
    position: 'absolute',
    left: 20, right: 20,
    alignItems: 'center',
  },
  greetingToast: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 200,
  },
  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },
  section: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  firstSection: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    marginTop:     28,
  },
})
