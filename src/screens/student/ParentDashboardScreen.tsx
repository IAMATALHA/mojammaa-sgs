import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text, Image,
  Dimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import {
  Users, Clock,
  ChevronRight, Star, AlertTriangle, Smile,
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
import { useClassLiveCourse } from '../../hooks/useClassLiveCourse'
import { greetingKey, hexWithAlpha, localeFor } from '../../utils/format'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

const { width: SCREEN_W } = Dimensions.get('window')
const CAROUSEL_CARD_W = SCREEN_W - 42

const QUICK_ACTION_ROUTES: Record<string, string> = {
  pqa1: 'StudentPerformance',
  pqa2: 'StudentAbsences',
  pqa3: 'StudentDevoirs',
  pqa4: 'StudentMessages',
  pqa5: 'StudentRessources',
  pqa6: 'StudentEdt',
}

// ────────────────────────────────────────────────────────────────────────
// Children carousel — restrained, institutional
// ────────────────────────────────────────────────────────────────────────

function ChildSlide({
  child, isActive, onPress, theme,
}: { child: Child; isActive: boolean; onPress: () => void; theme: Theme }) {
  const { t } = useTranslation()
  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.border }} style={styles.carouselSlot}>
      {({ pressed }) => (
        <MotiView
          animate={{
            scale: pressed ? 0.94 : isActive ? 1 : 0.96,
            opacity: isActive ? 1 : 0.72,
          }}
          transition={{ type: 'spring', damping: 15, stiffness: 240, mass: 0.7 }}
          style={[
            styles.carouselCard,
            { backgroundColor: theme.card },
            isActive && { backgroundColor: hexWithAlpha(child.avatarColor, 0.08) },
            theme.shadows.clay,
          ]}
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

          <LiveCourseStrip classe={child.classe} theme={theme} />
        </MotiView>
      )}
    </Pressable>
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
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile } = useAuth()
  const parent = useParentData()
  const { entries: comportements } = useParentComportements()
  const nav = useNavigation<any>()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Parent'

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
    if (parent.children.length > 0 && !selectedChildId) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedChild = useMemo(
    () => parent.children.find(c => c.id === selectedChildId) ?? parent.children[0],
    [parent.children, selectedChildId],
  )

  const goTo = (route: string) => nav.navigate(route)

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
        {parent.error && parent.children.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        {/* ── Mes enfants ──────────────────────────────────── */}
        <View style={styles.section}>
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
              snapToInterval={CAROUSEL_CARD_W + 12}
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
                    onPress={() => {
                      if (c.id === selectedChild?.id) goTo('StudentNotes')
                      else setSelectedChildId(c.id)
                    }}
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
            <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
          </View>
        </AnimatedSection>

        {/* ── Comportement (mérites / avertissements) ─────── */}
        <AnimatedSection delay={160}>
          <View style={styles.section}>
            <Card padding={12}>
              {comportements.length === 0 ? (
                <EmptyState
                  icon={Smile}
                  title={t('behavior.noEntries')}
                  message={t('behavior.noEntriesMsg')}
                />
              ) : (
                comportements.slice(0, 3).map((e, idx) => {
                  const merite = e.kind === 'merite'
                  const tint = merite ? theme.success : theme.danger
                  const Icon = merite ? Star : AlertTriangle
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => goTo('StudentComportement')}
                      android_ripple={{ color: theme.border }}
                      style={[
                        styles.behaviorRow,
                        idx < Math.min(comportements.length, 3) - 1 &&
                          { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={[styles.behaviorIcon, { backgroundColor: hexWithAlpha(tint, 0.12) }]}>
                        <Icon size={15} color={tint} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, marginStart: 10 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 13 }}>
                          {t(`behavior.reasons.${e.reason}`)}
                        </Text>
                        <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 11, marginTop: 2 }}>
                          {e.elevePrenom} · {new Date(e.date).toLocaleDateString(localeFor(), { day: '2-digit', month: 'short' })}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={theme.textMuted} strokeWidth={1.75} />
                    </Pressable>
                  )
                })
              )}
            </Card>
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
                {t(greetingKey())}, {fullName.split(' ')[0] || 'Parent'}
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },
  carouselSlot: {
    width: CAROUSEL_CARD_W,
  },
  carouselCard: {
    borderRadius: 28,
    padding: 20,
  },
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

  // Comportement
  behaviorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  behaviorIcon: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer
  footer: {
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
  },
})
