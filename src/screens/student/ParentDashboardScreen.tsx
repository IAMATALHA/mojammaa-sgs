import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, RefreshControl, StyleSheet, Pressable, Text, Image,
  Alert, Modal, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView } from 'moti'
import { useNavigation } from '@react-navigation/native'
import {
  Megaphone, BookOpen, Users, X, Clock,
  ChevronRight,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import {
  SectionHeader, Card,
  HomeworkRow, AnnouncementCard,
  QuickActions, EmptyState, SkeletonRow,
} from '../../components/dashboard'
import {
  PARENT_QUICK_ACTIONS,
  type Announcement, type HomeworkItem, type QuickAction,
  type Child,
} from '../../utils/dashboardTypes'
import { useParentDevoirs } from '../../hooks/useParentDevoirs'
import { useParentMessages } from '../../hooks/useParentMessages'
import { greetingKey, hexWithAlpha, formatLongDate } from '../../utils/format'

const { width: SCREEN_W } = Dimensions.get('window')
const CAROUSEL_CARD_W = SCREEN_W - 42

const QUICK_ACTION_ROUTES: Record<string, string> = {
  pqa1: 'StudentNotes',
  pqa2: 'StudentAbsences',
  pqa3: 'StudentDevoirs',
  pqa4: 'StudentMessages',
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
          <View style={[styles.childAccent, { backgroundColor: child.avatarColor }]} />
          <View style={styles.carouselRow}>
            <View style={{ flex: 1 }}>
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

          <View style={styles.carouselStatsRow}>
            <MiniStat label={t('parent.attendance')} value={`${child.attendance}%`} theme={theme} />
            <View style={[styles.statSep, { backgroundColor: theme.border }]} />
            <MiniStat
              label={t('parent.average')}
              value={child.averageGrade > 0 ? child.averageGrade.toFixed(1) : '—'}
              theme={theme}
            />
            <View style={[styles.statSep, { backgroundColor: theme.border }]} />
            <MiniStat
              label={t('tabs.homework')}
              value={String(child.pendingHomework)}
              theme={theme}
            />
          </View>
        </MotiView>
      )}
    </Pressable>
  )
}

function MiniStat({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <View style={styles.miniStatItem}>
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.bold,
        fontSize: 18,
      }}>
        {value}
      </Text>
      <Text style={{
        color: theme.textSoft,
        fontFamily: theme.fonts.medium,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: 3,
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
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { profile, logout } = useAuth()
  const parent = useParentData()
  const { devoirs: allDevoirs } = useParentDevoirs()
  const { messages: liveMessages, unread: unreadMessages } = useParentMessages()
  const nav = useNavigation<any>()
  const [refreshing, setRefreshing] = useState(false)
  const loading = parent.loading
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  // Detail modal state
  const [hwDetail,    setHwDetail]    = useState<HomeworkItem | null>(null)
  const [annDetail,   setAnnDetail]   = useState<Announcement | null>(null)

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

  const homeworkForSelected = useMemo(() => {
    const childClasse = selectedChild?.classe
    if (!childClasse) return []
    return allDevoirs
      .filter(d => d.classeId === childClasse && !d.isPast)
      .slice(0, 4)
      .map(d => ({ id: d.id, subject: d.type, title: d.title, dueDate: d.dateLimite, childId: d.childId || '', status: 'pending' as const }))
  }, [allDevoirs, selectedChild])

  const goTo = (route: string) => nav.navigate(route)

  const handleQuickAction = (action: QuickAction) => {
    const route = QUICK_ACTION_ROUTES[action.id]
    if (route) goTo(route)
  }

  const handleAccountPress = () => {
    Alert.alert(
      fullName,
      profile?.email ?? t('parent.accountParent'),
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

  const childName = (id: string): string => {
    const c = parent.children.find(x => x.id === id)
    return c ? c.firstName : ''
  }

  const tint = selectedChild?.avatarColor || theme.accent

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
        {/* ── Header strip ──────────────────────────────── */}
        <View style={styles.headerStrip}>
          <Pressable onPress={handleAccountPress} hitSlop={8}>
            <View style={[styles.avatarCircle, { borderColor: theme.accent }]}>
              <Image
                source={require('../../../assets/favicon.png')}
                style={styles.avatarImg}
                resizeMode="contain"
              />
            </View>
          </Pressable>
          <View style={{ flex: 1, marginStart: 12 }}>
            <Text numberOfLines={1} style={{
              color: theme.text,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              fontSize: isAr ? 16 : 15,
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
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
              writingDirection: isAr ? 'rtl' : 'ltr',
              textAlign: isAr ? 'right' : 'left',
            }}>
              {t('roles.parent')}
            </Text>
          </View>
          <Pressable onPress={() => goTo('StudentMessages')} hitSlop={8} style={[styles.avatarCircle, { borderColor: theme.accent }]}>
            <Megaphone size={18} color={theme.accent} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* ── Mes enfants ──────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title={t('parent.myChildren')}
            subtitle={t('parent.childCount', { count: parent.children.length })}
            actionLabel={t('common.seeAll')}
            onAction={() => goTo('StudentNotes')}
          />
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
                    onPress={() => setSelectedChildId(c.id)}
                    theme={theme}
                  />
                </AnimatedSection>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Devoirs récents ──────────────────────────────── */}
        <AnimatedSection delay={100}>
          <View style={styles.section}>
            <SectionHeader
              title={t('parent.recentHomework')}
              subtitle={selectedChild ? t('parent.forChild', { name: selectedChild.firstName }) : undefined}
              actionLabel={t('common.seeAll')}
              onAction={() => goTo('StudentDevoirs')}
            />
            <Card padding={12}>
              {loading ? (
                <><SkeletonRow /><SkeletonRow /></>
              ) : homeworkForSelected.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title={t('parent.noHomework')}
                  message={t('parent.noHomeworkMsg')}
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
              title={t('parent.announcementsTitle')}
              actionLabel={t('common.seeMore')}
              onAction={() => goTo('StudentMessages')}
            />
            {liveMessages.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Megaphone}
                  title={t('parent.noAnnouncements')}
                />
              </Card>
            ) : (
              <View>
                {liveMessages.slice(0, 3).map(a => (
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

        {/* ── Accès rapide ─────────────────────────────────── */}
        <AnimatedSection delay={180}>
          <View style={styles.section}>
            <SectionHeader
              title={t('parent.quickAccess')}
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
    </SafeAreaView>
  )
}

function HomeworkDetailModal({
  item, childName, onClose, onOpenList, theme, tint,
}: {
  item: HomeworkItem | null
  childName: string
  onClose: () => void
  onOpenList: () => void
  theme: Theme
  tint: string
}) {
  const { t } = useTranslation()
  if (!item) return null
  const due = formatLongDate(item.dueDate)
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
              {t('parent.seeAllHomework')}
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
}: { item: Announcement | null; onClose: () => void; theme: Theme }) {
  if (!item) return null
  const date = formatLongDate(item.date, undefined, true)
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

function SheetHeader({
  theme, onClose, icon, label,
}: { theme: Theme; onClose: () => void; icon: React.ReactNode; label: string }) {
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
}: { theme: Theme; icon: React.ReactNode; text: string }) {
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
  scroll: { paddingBottom: 32 },

  blob: { position: 'absolute' as const, borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },

  headerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  avatarImg: {
    width: 28, height: 28,
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
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
  },
  childAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  carouselRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
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
