/**
 * ParentDashboardScreen — "Matinée à l'école"
 *
 * Direction Claude (iteration 1) :
 *   - Hero card de bienvenue avec gradient tinté par child.avatarColor
 *   - Salutation en Great Vibes (calligraphie navy)
 *   - Carousel horizontal des enfants (au lieu de vertical empilé)
 *   - Ornements SVG décoratifs entre les sections (étoile, feuille, soleil)
 *   - Animations Moti stagger fade-in à l'arrivée + scale au press
 *   - Le dashboard "s'imprègne" de la couleur de l'enfant sélectionné
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text,
  Alert, Modal, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import Svg, { Path, Circle, G } from 'react-native-svg'
import { useNavigation } from '@react-navigation/native'
import {
  Megaphone, BookOpen, CalendarDays, Users, X, MapPin, Clock,
  ChevronRight,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents'
import {
  SectionHeader, Card,
  AttendanceRing, HomeworkRow, AnnouncementCard,
  EventCard, QuickActions, EmptyState, SkeletonRow,
} from '../../components/dashboard'
import {
  PARENT_RECENT_HOMEWORK, PARENT_ANNOUNCEMENTS,
  PARENT_QUICK_ACTIONS,
  type Announcement, type HomeworkItem, type UpcomingEvent, type QuickAction,
  type Child,
} from '../../utils/mockData'

const { width: SCREEN_W } = Dimensions.get('window')
const CAROUSEL_CARD_W = SCREEN_W - 80   // 1 enfant visible + petit teaser des voisins

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

// ────────────────────────────────────────────────────────────────────────
// Ornements SVG décoratifs — inspirés du poster école
// ────────────────────────────────────────────────────────────────────────

function StarOrnament({ size = 18, color = '#FFD23F' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2 L14.6 8.2 L21.2 8.8 L16.2 13.2 L17.6 19.8 L12 16.4 L6.4 19.8 L7.8 13.2 L2.8 8.8 L9.4 8.2 Z"
        fill={color}
        opacity={0.9}
      />
      <Circle cx={12} cy={12} r={2} fill="#FFFFFF" opacity={0.6} />
    </Svg>
  )
}

function LeafOrnament({ size = 22, color = '#52B788' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 14c0-7 8-12 16-12 0 8-5 16-12 16-2 0-4-1-4-4z"
        fill={color}
        opacity={0.85}
      />
      <Path
        d="M6 14c5-4 10-9 14-10"
        stroke="#FFFFFF"
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
    </Svg>
  )
}

function SunOrnament({ size = 20, color = '#FF8C42' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G>
        <Circle cx={12} cy={12} r={5} fill={color} opacity={0.9} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
          const rad = (angle * Math.PI) / 180
          const x1 = 12 + 7 * Math.cos(rad)
          const y1 = 12 + 7 * Math.sin(rad)
          const x2 = 12 + 10 * Math.cos(rad)
          const y2 = 12 + 10 * Math.sin(rad)
          return (
            <Path
              key={angle}
              d={`M${x1} ${y1} L${x2} ${y2}`}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.7}
            />
          )
        })}
      </G>
    </Svg>
  )
}

function DividerOrnament({ icon }: { icon: 'star' | 'leaf' | 'sun' }) {
  const theme = useTheme()
  const Component = icon === 'star' ? StarOrnament : icon === 'leaf' ? LeafOrnament : SunOrnament
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
      <View style={styles.dividerIconWrap}>
        <Component size={20} />
      </View>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
    </View>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Hero card — gradient tinté par la couleur d'avatar de l'enfant sélectionné
// ────────────────────────────────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha: number): string {
  // Suppose hex en format #RRGGBB
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function HeroCard({
  greeting, fullName, selectedChild, notifications, onPressBell, onPressAvatar, theme,
}: {
  greeting: string
  fullName: string
  selectedChild?: Child
  notifications: number
  onPressBell: () => void
  onPressAvatar: () => void
  theme: any
}) {
  const tint = selectedChild?.avatarColor || theme.accent
  const gradientFrom = hexWithAlpha(tint, 0.18)
  const gradientTo = hexWithAlpha(tint, 0.04)

  return (
    <MotiView
      from={{ opacity: 0, translateY: -12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
    >
      <LinearGradient
        colors={[gradientFrom, gradientTo, theme.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroTopRow}>
          {/* Avatar parent */}
          <Pressable onPress={onPressAvatar} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.95 : 1 }}
                transition={{ type: 'timing', duration: 150 }}
                style={[styles.heroAvatar, { backgroundColor: theme.white, borderColor: hexWithAlpha(tint, 0.35) }]}
              >
                <Text style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16,
                }}>
                  {fullName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                </Text>
              </MotiView>
            )}
          </Pressable>

          <View style={{ flex: 1, marginStart: 14 }}>
            <Text style={{
              color: theme.textSoft,
              fontFamily: theme.fonts.medium,
              fontSize: 12,
              letterSpacing: 0.3,
            }}>
              {greeting}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: '#1D3557',
                fontFamily: theme.fonts.script,
                fontSize: 32,
                lineHeight: 40,
                marginTop: 2,
              }}
            >
              {fullName.split(' ')[0] || 'Parent'}
            </Text>
          </View>

          <Pressable onPress={onPressBell} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.95 : 1 }}
                transition={{ type: 'timing', duration: 150 }}
                style={[styles.heroBell, { backgroundColor: theme.white }]}
              >
                <Megaphone size={20} color={theme.text} strokeWidth={1.8} />
                {notifications > 0 ? (
                  <View style={[styles.bellDot, { backgroundColor: theme.accent }]}>
                    <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 9 }}>
                      {notifications > 9 ? '9+' : String(notifications)}
                    </Text>
                  </View>
                ) : null}
              </MotiView>
            )}
          </Pressable>
        </View>

        {/* Brand strip discret */}
        <View style={styles.heroBrandStrip}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 10,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}>
            Mojammaa Al Maarifa
          </Text>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.arabicSemi,
            fontSize: 11,
            marginStart: 8,
          }}>
            مجمع المعرفة الخصوصية
          </Text>
        </View>
      </LinearGradient>
    </MotiView>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Carousel horizontal des enfants
// ────────────────────────────────────────────────────────────────────────

function ChildCarouselCard({
  child, isActive, onPress, theme,
}: {
  child: Child
  isActive: boolean
  onPress: () => void
  theme: any
}) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.border }} style={styles.carouselSlot}>
      {({ pressed }) => (
        <MotiView
          animate={{
            scale: pressed ? 0.97 : isActive ? 1 : 0.96,
            opacity: isActive ? 1 : 0.78,
          }}
          transition={{ type: 'timing', duration: 220 }}
          style={[
            styles.carouselCard,
            {
              backgroundColor: theme.card,
              borderColor: isActive ? hexWithAlpha(child.avatarColor, 0.45) : theme.border,
              borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
            },
            theme.shadows.sm,
          ]}
        >
          <LinearGradient
            colors={[hexWithAlpha(child.avatarColor, 0.16), hexWithAlpha(child.avatarColor, 0.02)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.carouselTopBand}
          >
            <View style={[styles.carouselAvatar, { backgroundColor: child.avatarColor }]}>
              <Text style={{
                color: '#fff',
                fontFamily: theme.fonts.bold,
                fontSize: 22,
              }}>
                {(child.firstName[0] || '').toUpperCase()}{(child.lastName[0] || '').toUpperCase()}
              </Text>
            </View>
          </LinearGradient>

          <View style={styles.carouselBody}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.text,
                fontFamily: theme.fonts.bold,
                fontSize: 17,
                letterSpacing: -0.2,
              }}
            >
              {child.firstName} {child.lastName}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.medium,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {child.classe} · {child.level}
            </Text>

            <View style={styles.carouselStats}>
              <View style={[styles.miniStat, { backgroundColor: theme.surface }]}>
                <Text style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16,
                }}>
                  {child.attendance}%
                </Text>
                <Text style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}>
                  Présence
                </Text>
              </View>
              <View style={[styles.miniStat, { backgroundColor: theme.surface }]}>
                <Text style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16,
                }}>
                  {child.averageGrade > 0 ? `${child.averageGrade.toFixed(1)}` : '—'}
                </Text>
                <Text style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}>
                  Moyenne
                </Text>
              </View>
            </View>
          </View>
        </MotiView>
      )}
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
      from={{ opacity: 0, translateY: 14 }}
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
  const { profile, logout } = useAuth()
  const parent = useParentData()
  const { events: upcomingEvents } = useUpcomingEvents(6)
  const nav = useNavigation<any>()
  const [refreshing, setRefreshing] = useState(false)
  const loading = parent.loading
  const [selectedChildId, setSelectedChildId] = useState<string>('')
  const carouselRef = useRef<ScrollView | null>(null)

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

  const tint = selectedChild?.avatarColor || theme.accent

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
            tintColor={theme.accent}
          />
        }
      >
        {/* ── Hero card ─────────────────────────────────────── */}
        <HeroCard
          greeting={`${greetingFor()},`}
          fullName={fullName}
          selectedChild={selectedChild}
          notifications={2}
          onPressBell={() => goTo('StudentMessages')}
          onPressAvatar={handleAvatarPress}
          theme={theme}
        />

        {/* ── My Children (carousel horizontal) ─────────────── */}
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
            <ScrollView
              ref={carouselRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CAROUSEL_CARD_W + 12}
              decelerationRate="fast"
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.carouselScroll}
            >
              {parent.children.map((c, idx) => (
                <AnimatedSection key={c.id} delay={80 + idx * 50}>
                  <ChildCarouselCard
                    child={c}
                    isActive={c.id === selectedChild?.id}
                    onPress={() => setSelectedChildId(c.id)}
                    theme={theme}
                  />
                </AnimatedSection>
              ))}
            </ScrollView>
          )}
        </View>

        <DividerOrnament icon="star" />

        {/* ── Attendance overview (tinted hero) ─────────────── */}
        <AnimatedSection delay={120}>
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
              <View style={[styles.attendanceCard, {
                backgroundColor: theme.card,
                borderColor: hexWithAlpha(tint, 0.22),
                shadowColor: tint,
                shadowOpacity: 0.10,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 2,
              }]}>
                <LinearGradient
                  colors={[hexWithAlpha(tint, 0.10), hexWithAlpha(tint, 0)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.attendanceGradient}
                />
                <View style={styles.attendanceRow}>
                  <AttendanceRing
                    value={selectedChild?.attendance ?? 0}
                    caption="présence"
                    progressColor={tint}
                  />
                  <View style={styles.attendanceMeta}>
                    <Stat
                      label="Moyenne"
                      value={selectedChild && selectedChild.averageGrade > 0
                        ? `${selectedChild.averageGrade.toFixed(1)}/20`
                        : '—'}
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
                      color={tint}
                      theme={theme}
                    />
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
        </AnimatedSection>

        <DividerOrnament icon="leaf" />

        {/* ── Recent homework ───────────────────────────────── */}
        <AnimatedSection delay={160}>
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
        </AnimatedSection>

        {/* ── Announcements ─────────────────────────────────── */}
        <AnimatedSection delay={200}>
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
        </AnimatedSection>

        <DividerOrnament icon="sun" />

        {/* ── Upcoming events ───────────────────────────────── */}
        <AnimatedSection delay={240}>
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
        </AnimatedSection>

        {/* ── Quick actions ─────────────────────────────────── */}
        <AnimatedSection delay={280}>
          <View style={styles.section}>
            <SectionHeader
              title="Accès rapide"
              subtitle="Petites cartes pour accéder aux essentiels"
            />
            <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
          </View>
        </AnimatedSection>

        <View style={styles.footer}>
          <StarOrnament size={14} />
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            letterSpacing: 0.3,
            marginStart: 8,
          }}>
            Mojammaa Al Maarifa — un matin chaleureux
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
        tint={tint}
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
  item, childName, onClose, onOpenList, theme, tint,
}: {
  item: HomeworkItem | null
  childName: string
  onClose: () => void
  onOpenList: () => void
  theme: any
  tint: string
}) {
  if (!item) return null
  const due = new Date(item.dueDate).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]}>
          <SheetHeader theme={theme} onClose={onClose} icon={<BookOpen size={20} color={tint} strokeWidth={2.2} />} label={item.subject} />
          <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>
            {item.title}
          </Text>
          <SheetMeta theme={theme} icon={<Clock size={14} color={theme.textSoft} strokeWidth={2} />} text={due} />
          {childName ? (
            <SheetMeta theme={theme} icon={<Users size={14} color={theme.textSoft} strokeWidth={2} />} text={childName} />
          ) : null}
          <Pressable
            onPress={onOpenList}
            android_ripple={{ color: '#ffffff30' }}
            style={[styles.cta, { backgroundColor: tint }]}
          >
            <Text style={{ color: '#fff', fontFamily: theme.fonts.bold, fontSize: 13 }}>
              Voir tous les devoirs
            </Text>
            <ChevronRight size={16} color="#fff" strokeWidth={2.4} style={{ marginStart: 4 }} />
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
          <SheetHeader theme={theme} onClose={onClose} icon={<Megaphone size={20} color={theme.accent} strokeWidth={2.2} />} label={item.author} />
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
          <SheetHeader theme={theme} onClose={onClose} icon={<CalendarDays size={20} color={theme.green} strokeWidth={2.2} />} label="Événement" />
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
        { backgroundColor: theme.surface },
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

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 132 },

  // Hero
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius:  26,
    borderBottomRightRadius: 26,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  heroBell: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  heroBrandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },

  // Carousel
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
    borderRadius: 22,
    overflow: 'hidden',
  },
  carouselTopBand: {
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselAvatar: {
    width: 62, height: 62, borderRadius: 31,
    alignItems: 'center', justifyContent: 'center',
  },
  carouselBody: {
    padding: 16,
  },
  carouselStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  miniStat: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'flex-start',
  },

  // Divider with ornament
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 4,
    paddingHorizontal: 32,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerIconWrap: {
    marginHorizontal: 14,
  },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 22 },

  // Attendance card
  attendanceCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  attendanceGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 90,
  },
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

  // Footer
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
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 14,
    marginTop: 16,
  },
})
