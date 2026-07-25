import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text, Image,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import type { StudentDashboardNav } from '../../navigation/types'
import {
  Users, Clock,
  ChevronRight, Star, AlertTriangle, Smile, TrendingUp, CheckCircle2, BookOpen,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import {
  Card,
  QuickActions, EmptyState,
} from '../../components/dashboard'
import {
  PARENT_QUICK_ACTIONS,
  type QuickAction,
  type Child,
} from '../../utils/dashboardTypes'
import { useParentComportements } from '../../hooks/useParentComportements'
import type { ComportementDoc } from '../../services/comportementsService'
import { useClassLiveCourse } from '../../hooks/useClassLiveCourse'
import { greetingKey, hexWithAlpha } from '../../utils/format'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

type StudentQuickRoute =
  | 'StudentPerformance' | 'StudentRessources' | 'StudentEdt' | 'StudentComportement'
  | 'StudentAbsences' | 'StudentDevoirs' | 'StudentMessages' | 'StudentNotes'
  | 'StudentPickup'

const QUICK_ACTION_ROUTES: Record<string, StudentQuickRoute> = {
  pqa1: 'StudentPerformance',
  pqa2: 'StudentAbsences',
  pqa3: 'StudentDevoirs',
  pqa4: 'StudentMessages',
  pqa5: 'StudentRessources',
  pqa6: 'StudentEdt',
  pqa7: 'StudentPickup',
}

const PICKUP_QUICK_ACTION: QuickAction = {
  id: 'pqa7',
  label: 'Smart Pickup',
  labelKey: 'pickup.moduleTitle',
  icon: 'car-front',
  tint: 'primary',
}

const PARENT_DASHBOARD_ACTIONS: QuickAction[] = [
  ...PARENT_QUICK_ACTIONS,
  PICKUP_QUICK_ACTION,
]

// ────────────────────────────────────────────────────────────────────────
// Children carousel — restrained, institutional
// ────────────────────────────────────────────────────────────────────────

function ChildSlide({
  child, isActive, onPress, onOpenBehavior, behaviorEntries, theme, cardWidth,
}: {
  child: Child
  isActive: boolean
  onPress: () => void
  onOpenBehavior: () => void
  behaviorEntries: ComportementDoc[]
  theme: Theme
  cardWidth: number
}) {
  const { t } = useTranslation()
  const isPreschool = /(^|[^a-z])(ps|gs)([^a-z]|$)/i.test(child.classe)
  const attendanceTone = child.attendance >= 90 ? theme.success : child.attendance >= 75 ? theme.warning : theme.danger
  return (
    <View style={[styles.carouselSlot, { width: cardWidth }]}>
      <MotiView
        animate={{
          scale: isActive ? 1 : 0.98,
          opacity: isActive ? 1 : 0.82,
        }}
        transition={{ type: 'spring', damping: 15, stiffness: 240, mass: 0.7 }}
        style={[
          styles.carouselCard,
          { backgroundColor: theme.card, borderColor: isActive ? hexWithAlpha(child.avatarColor, 0.42) : theme.border },
          theme.shadows.clay,
        ]}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${child.firstName} ${child.lastName}, ${child.classe}`}
          style={({ pressed }) => [pressed && styles.childPrimaryPressed]}
        >
          <View style={styles.carouselRow}>
            <View style={[styles.childAvatar, { backgroundColor: child.avatarColor }]}>
              <Text style={styles.childAvatarText}>
                {(child.firstName || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 18,
                  letterSpacing: -0.3,
                }}
              >
                {child.firstName} {child.lastName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 13,
                  marginTop: 3,
                }}
              >
                {child.classe} · {child.level}
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textMuted} strokeWidth={1.75} />
          </View>

          <View style={styles.childMetrics}>
            <ChildMetric
              icon={<CheckCircle2 size={14} color={attendanceTone} strokeWidth={2.4} />}
              label={t('parent.attendance')}
              value={`${Math.round(child.attendance)}%`}
              color={attendanceTone}
              bg={hexWithAlpha(attendanceTone, 0.12)}
            />
            <ChildMetric
              icon={<TrendingUp size={14} color={theme.primary} strokeWidth={2.4} />}
              label={t('parent.average')}
              value={isPreschool ? 'Compétences' : `${child.averageGrade.toFixed(1)}/${child.bareme}`}
              color={theme.primary}
              bg={theme.primarySurface}
            />
            <ChildMetric
              icon={<BookOpen size={14} color={theme.warning} strokeWidth={2.4} />}
              label={t('actions.homework')}
              value={String(child.pendingHomework)}
              color={theme.warning}
              bg={theme.warningSurface}
            />
          </View>

          <LiveCourseStrip classe={child.classe} theme={theme} />
        </Pressable>

        <BehaviorHeroStrip
          entries={behaviorEntries}
          onPress={onOpenBehavior}
          theme={theme}
        />
      </MotiView>
    </View>
  )
}

function ChildMetric({
  icon, label, value, color, bg,
}: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <View style={[styles.metricPill, { backgroundColor: bg }]}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.metricValue, { color }]}>{value}</Text>
        <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  )
}

/**
 * LiveCourseStrip — bande « cours en cours / à venir » d'une classe, mise à
 * jour chaque minute. Remplace les anciennes mini-stats (présence/moyenne/
 * devoirs) pour donner au parent le contexte temps réel de son enfant.
 */
function LiveCourseStrip({ classe, theme }: { classe: string; theme: Theme }) {
  const { t } = useTranslation()
  const { loading, hasSchedule, course } = useClassLiveCourse(classe)

  const isNow = course?.status === 'now'
  const tint = isNow ? theme.success : theme.accent

  let title: string
  let subtitle: string | null = null
  if (course) {
    const s = course.slot
    title = s.matiere || t('parent.liveCourse')
    const bits: string[] = []
    if (course.status === 'soon' && s.startTime) bits.push(s.startTime)
    if (s.salle) bits.push(s.salle)
    if (s.professeurNom) bits.push(s.professeurNom)
    subtitle = bits.join(' · ') || null
  } else if (loading) {
    title = '—'
  } else if (hasSchedule) {
    title = t('parent.liveNone')
  } else {
    title = t('parent.liveNoSchedule')
  }

  return (
    <View style={[styles.liveStrip, { borderTopColor: theme.border }]}>
      <View style={[styles.liveBadge, { backgroundColor: hexWithAlpha(tint, 0.12) }]}>
        {isNow ? (
          <MotiView
            from={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 800, loop: true, repeatReverse: true }}
            style={[styles.liveDot, { backgroundColor: tint }]}
          />
        ) : (
          <Clock size={13} color={tint} strokeWidth={2.4} />
        )}
        <Text style={{
          color: tint,
          fontFamily: theme.fonts.bold,
          fontSize: 9.5,
          letterSpacing: 0.5,
          marginStart: 5,
        }}>
          {course
            ? (isNow ? t('parent.liveNow') : t('parent.liveNext')).toUpperCase()
            : t('parent.liveLabel').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, marginStart: 10 }}>
        <Text numberOfLines={1} style={{
          color: course ? theme.text : theme.textMuted,
          fontFamily: theme.fonts.semibold,
          fontSize: 14,
        }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 11.5,
            marginTop: 2,
          }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function BehaviorHeroStrip({
  entries, onPress, theme,
}: {
  entries: ComportementDoc[]
  onPress: () => void
  theme: Theme
}) {
  const { t } = useTranslation()
  const merits = entries.filter(entry => entry.kind === 'merite').length
  const warnings = entries.filter(entry => entry.kind === 'avertissement').length
  const latest = entries[0]
  const detail = latest
    ? t(`behavior.reasons.${latest.reason}`)
    : t('behavior.noEntries')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('behavior.parentTitle')}. ${merits} ${t('behavior.merites')}, ${warnings} ${t('behavior.avertissements')}`}
      accessibilityHint={t('behavior.parentSubtitle')}
      style={({ pressed }) => [
        styles.behaviorHeroStrip,
        { borderTopColor: theme.border },
        pressed && styles.behaviorHeroPressed,
      ]}
    >
      <View style={[styles.behaviorHeroIcon, { backgroundColor: theme.primarySurface }]}>
        <Smile size={17} color={theme.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.behaviorHeroText}>
        <Text numberOfLines={1} style={[styles.behaviorHeroTitle, { color: theme.text }]}>
          {t('behavior.parentTitle')}
        </Text>
        <Text numberOfLines={1} style={[styles.behaviorHeroDetail, { color: theme.textSoft }]}>
          {detail}
        </Text>
      </View>
      <View style={styles.behaviorHeroCounters}>
        <View style={[styles.behaviorHeroCounter, { backgroundColor: theme.successSurface }]}>
          <Star size={13} color={theme.success} strokeWidth={2.2} />
          <Text style={[styles.behaviorHeroCounterValue, { color: theme.success }]}>{merits}</Text>
        </View>
        <View style={[styles.behaviorHeroCounter, { backgroundColor: theme.dangerSurface }]}>
          <AlertTriangle size={13} color={theme.danger} strokeWidth={2.2} />
          <Text style={[styles.behaviorHeroCounterValue, { color: theme.danger }]}>{warnings}</Text>
        </View>
      </View>
      <ChevronRight size={16} color={theme.textMuted} strokeWidth={1.8} />
    </Pressable>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Animated section wrapper
// ────────────────────────────────────────────────────────────────────────

function AnimatedSection({
  delay = 0, children,
}: { delay?: number; children: React.ReactNode }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420, delay }}
    >
      {children}
    </MotiView>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Main screen
// ────────────────────────────────────────────────────────────────────────

export default function ParentDashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile } = useAuth()
  const parent = useParentData()
  const { entries: comportements } = useParentComportements()
  const nav = useNavigation<StudentDashboardNav>()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Parent'
  const firstName = fullName.split(' ')[0] || 'Parent'
  const carouselCardWidth = Math.max(302, width - 42)

  const [showGreeting, setShowGreeting] = useState(true)

  // Le toast de salutation s'affiche une seule fois au montage puis s'efface.
  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(false), 2600)
    return () => clearTimeout(id)
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }, [])

  useEffect(() => {
    // Sélection invalide (enfant délié/retiré en cours de session) → rabat sur
    // le premier enfant, sinon la requête notes devient interdite (rules) et
    // l'écran affiche à tort « erreur de connexion / pas de notes ».
    if (parent.children.length > 0 && (!selectedChildId || !parent.children.some(c => c.id === selectedChildId))) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedChild = useMemo(
    () => parent.children.find(c => c.id === selectedChildId) ?? parent.children[0],
    [parent.children, selectedChildId],
  )
  const behaviorByChild = useMemo(() => {
    const grouped = new Map<string, ComportementDoc[]>()
    comportements.forEach(entry => {
      const current = grouped.get(entry.eleveId) ?? []
      current.push(entry)
      grouped.set(entry.eleveId, current)
    })
    return grouped
  }, [comportements])

  const goTo = (route: StudentQuickRoute) => nav.navigate(route)

  const handleQuickAction = (action: QuickAction) => {
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

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
        {parent.error && parent.children.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        {/* La carte enfant est le Hero principal : aucun titre de section. */}
        <View style={[styles.section, styles.heroSection]}>
          {parent.children.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title={t('parent.noChildren')}
                message={t('parent.noChildrenMsg')}
              />
            </Card>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={carouselCardWidth + 12}
              decelerationRate="fast"
              style={{ flexGrow: 0 }}
              contentContainerStyle={[
                styles.carouselScroll,
                parent.children.length === 1 && { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
              ]}
            >
              {parent.children.map((c, idx) => (
                <AnimatedSection key={c.id} delay={60 + idx * 40}>
                  <ChildSlide
                    child={c}
                    isActive={c.id === selectedChild?.id}
                    // 1er tap : sélectionne (filtre les devoirs en dessous) ;
                    // tap sur la carte active (toujours le cas avec un seul
                    // enfant) : ouvre le détail — le chevron le promet.
                    cardWidth={carouselCardWidth}
                    onPress={() => {
                      if (c.id === selectedChild?.id) goTo('StudentNotes')
                      else setSelectedChildId(c.id)
                    }}
                    onOpenBehavior={() => goTo('StudentComportement')}
                    behaviorEntries={behaviorByChild.get(c.id) ?? []}
                    theme={theme}
                  />
                </AnimatedSection>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Accès rapide ─────────────────────────────────── */}
        {/* Juste sous les enfants : c'est la section la plus utilisée. */}
        <AnimatedSection delay={100}>
          <View style={styles.section}>
            <DashboardSectionHeader
              title={t('parent.quickAccess')}
              subtitle={selectedChild ? t('parent.forChild', { name: selectedChild.firstName }) : t('parent.accountParent')}
              theme={theme}
            />
          <QuickActions actions={PARENT_DASHBOARD_ACTIONS} onPress={handleQuickAction} />
          </View>
        </AnimatedSection>

        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}>
            Mojammaa Al Maarifa
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
                {t(greetingKey())}, {firstName}
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
                {t('roles.parent')}
              </Text>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </SafeAreaView>
  )
}

function DashboardSectionHeader({ title, subtitle, theme }: { title: string; subtitle?: string; theme: Theme }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {subtitle ? (
        <Text numberOfLines={1} style={[styles.sectionSubtitle, { color: theme.textSoft }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },

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

  // Carousel enfants
  carouselScroll: {
    paddingTop: 2,
    paddingBottom: 8,
    gap: 12,
  },
  carouselSlot: {},
  carouselCard: {
    borderRadius: 28,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 196,
  },
  childPrimaryPressed: { opacity: 0.72 },
  childAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  childAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childMetrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metricPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'space-between',
    gap: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: 'rgba(18, 14, 9, 0.64)',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  liveStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
  },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 22 },
  heroSection: { marginTop: 10 },
  sectionHeader: {
    marginBottom: 10,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Comportement intégré au Hero enfant
  behaviorHeroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  behaviorHeroPressed: { opacity: 0.68 },
  behaviorHeroIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  behaviorHeroText: { flex: 1, minWidth: 0 },
  behaviorHeroTitle: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  behaviorHeroDetail: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  behaviorHeroCounters: {
    flexDirection: 'row',
    gap: 5,
  },
  behaviorHeroCounter: {
    minWidth: 38,
    height: 28,
    borderRadius: 10,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  behaviorHeroCounterValue: {
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  // Footer
  footer: {
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
  },
})
