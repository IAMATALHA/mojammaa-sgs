/**
 * ParentDashboardScreen — Direction Claude v2 : "Marocain premium / institutionnel"
 *
 * Refonte selon brief :
 *   - Plus de décorations enfantines (suppression étoile / feuille / soleil)
 *   - Lavis watercolor subtils uniquement (cream / navy / corail / orange / jaune)
 *   - Logo école fortement en valeur dans le hero
 *   - icon.png comme watermark de fond, très discret
 *   - Réduction des cards imbriquées (consolidation)
 *   - Toutes les interactions préservées (onPress, modals, navigation)
 *   - Le dashboard adopte la teinte de l'enfant sélectionné (gradient subtil)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text, Image,
  Alert, Modal, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
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
const CAROUSEL_CARD_W = SCREEN_W - 76

function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

const QUICK_ACTION_ROUTES: Record<string, string> = {
  pqa1: 'StudentNotes',
  pqa2: 'StudentAbsences',
  pqa3: 'StudentDevoirs',
  pqa4: 'StudentMessages',
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ────────────────────────────────────────────────────────────────────────
// Hero — logo prominent + greeting calligraphié, gradient subtil tinté
// ────────────────────────────────────────────────────────────────────────

function Hero({
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

  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 480 }}
    >
      <LinearGradient
        colors={[hexWithAlpha(tint, 0.12), theme.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.hero}
      >
        {/* Row 1 : avatar parent + brand identity + bell */}
        <View style={styles.heroTopRow}>
          <Pressable onPress={onPressAvatar} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.94 : 1 }}
                transition={{ type: 'timing', duration: 150 }}
                style={[styles.heroAvatar, {
                  backgroundColor: theme.white,
                  borderColor: hexWithAlpha(tint, 0.35),
                }]}
              >
                <Text style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 15,
                }}>
                  {fullName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                </Text>
              </MotiView>
            )}
          </Pressable>

          <View style={styles.heroBrandBlock}>
            <View style={styles.heroBrandRow}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.heroBrandLogo}
                resizeMode="contain"
              />
              <View style={{ marginStart: 8 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.text,
                    fontFamily: theme.fonts.bold,
                    fontSize: 13,
                    letterSpacing: -0.2,
                  }}
                >
                  Mojammaa Al Maarifa
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.textSoft,
                    fontFamily: theme.fonts.arabicSemi,
                    fontSize: 11,
                    marginTop: 1,
                  }}
                >
                  مجمع المعرفة الخصوصية
                </Text>
              </View>
            </View>
          </View>

          <Pressable onPress={onPressBell} hitSlop={8}>
            {({ pressed }) => (
              <MotiView
                animate={{ scale: pressed ? 0.94 : 1 }}
                transition={{ type: 'timing', duration: 150 }}
                style={[styles.heroBell, { backgroundColor: theme.white }]}
              >
                <Megaphone size={18} color={theme.text} strokeWidth={1.75} />
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

        {/* Row 2 : greeting + name (calligraphie) */}
        <View style={styles.heroGreetBlock}>
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.medium,
            fontSize: 12,
            letterSpacing: 0.4,
          }}>
            {greeting.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: '#1D3557',
              fontFamily: theme.fonts.script,
              fontSize: 34,
              lineHeight: 42,
              marginTop: 2,
            }}
          >
            {fullName.split(' ')[0] || 'Parent'}
          </Text>
        </View>
      </LinearGradient>
    </MotiView>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Children carousel — restrained, institutional
// ────────────────────────────────────────────────────────────────────────

function ChildSlide({
  child, isActive, onPress, theme,
}: { child: Child; isActive: boolean; onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.border }} style={styles.carouselSlot}>
      {({ pressed }) => (
        <MotiView
          animate={{
            scale: pressed ? 0.97 : isActive ? 1 : 0.96,
            opacity: isActive ? 1 : 0.72,
          }}
          transition={{ type: 'timing', duration: 200 }}
          style={[
            styles.carouselCard,
            {
              backgroundColor: theme.card,
              borderColor: isActive ? hexWithAlpha(child.avatarColor, 0.45) : theme.border,
              borderWidth: isActive ? 1.5 : StyleSheet.hairlineWidth,
            },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.carouselRow}>
            <View style={[styles.carouselAvatar, { backgroundColor: child.avatarColor }]}>
              <Text style={{
                color: '#fff',
                fontFamily: theme.fonts.bold,
                fontSize: 18,
              }}>
                {(child.firstName[0] || '').toUpperCase()}{(child.lastName[0] || '').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginStart: 14 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16,
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
                  marginTop: 2,
                }}
              >
                {child.classe} · {child.level}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} strokeWidth={1.75} />
          </View>

          <View style={styles.carouselStatsRow}>
            <MiniStat label="Présence" value={`${child.attendance}%`} theme={theme} />
            <View style={[styles.statSep, { backgroundColor: theme.border }]} />
            <MiniStat
              label="Moyenne"
              value={child.averageGrade > 0 ? child.averageGrade.toFixed(1) : '—'}
              theme={theme}
            />
            <View style={[styles.statSep, { backgroundColor: theme.border }]} />
            <MiniStat
              label="Devoirs"
              value={String(child.pendingHomework)}
              theme={theme}
            />
          </View>
        </MotiView>
      )}
    </Pressable>
  )
}

function MiniStat({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.miniStatItem}>
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.bold,
        fontSize: 15,
      }}>
        {value}
      </Text>
      <Text style={{
        color: theme.textSoft,
        fontFamily: theme.fonts.medium,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: 2,
      }}>
        {label}
      </Text>
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

      {/* ── Subtle watermark icon.png ───────────────────────── */}
      <View pointerEvents="none" style={styles.watermarkWrap}>
        <Image
          source={require('../../../assets/icon.png')}
          style={styles.watermark}
          resizeMode="contain"
        />
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
        {/* ── Hero ──────────────────────────────────────────── */}
        <Hero
          greeting={greetingFor()}
          fullName={fullName}
          selectedChild={selectedChild}
          notifications={2}
          onPressBell={() => goTo('StudentMessages')}
          onPressAvatar={handleAvatarPress}
          theme={theme}
        />

        {/* ── Mes enfants ──────────────────────────────────── */}
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
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CAROUSEL_CARD_W + 12}
              decelerationRate="fast"
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.carouselScroll}
            >
              {parent.children.map((c, idx) => (
                <AnimatedSection key={c.id} delay={60 + idx * 40}>
                  <ChildSlide
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

        {/* ── Présence ──────────────────────────────────────── */}
        <AnimatedSection delay={100}>
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
              }, theme.shadows.sm]}>
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

        {/* ── Devoirs récents ──────────────────────────────── */}
        <AnimatedSection delay={140}>
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

        {/* ── Annonces ─────────────────────────────────────── */}
        <AnimatedSection delay={180}>
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

        {/* ── Événements ───────────────────────────────────── */}
        <AnimatedSection delay={220}>
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

        {/* ── Accès rapide ─────────────────────────────────── */}
        <AnimatedSection delay={260}>
          <View style={styles.section}>
            <SectionHeader
              title="Accès rapide"
            />
            <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
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
  scroll: { paddingBottom: 180 },

  // Watermark icon.png — très discret, derrière tout
  watermarkWrap: {
    position: 'absolute',
    top: SCREEN_W * 0.35,
    left: 0, right: 0,
    alignItems: 'center',
  },
  watermark: {
    width: SCREEN_W * 0.95,
    height: SCREEN_W * 0.95,
    opacity: 0.045,
  },

  // Hero
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    borderBottomLeftRadius:  28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  heroBrandBlock: {
    flex: 1,
    marginHorizontal: 12,
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroBrandLogo: {
    width: 32, height: 32,
  },
  heroBell: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  heroGreetBlock: {
    marginTop: 16,
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
    borderRadius: 20,
    padding: 16,
  },
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  carouselStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(29, 53, 87, 0.08)',
  },
  miniStatItem: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statSep: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 22 },

  // Attendance card
  attendanceCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
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
    alignItems: 'center', justifyContent: 'center',
    marginTop: 28,
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
