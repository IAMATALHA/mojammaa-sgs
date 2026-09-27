import React, { useEffect, useMemo, useState } from 'react'
import {
  View, ScrollView, StyleSheet, Pressable, Text, Image, ActivityIndicator,
  AppState,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotiView, AnimatePresence } from 'moti'
import { useNavigation } from '@react-navigation/native'
import type { StudentDashboardNav } from '../../navigation/types'
import {
  Users, Check,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useParentData } from '../../hooks/useParentData'
import {
  Card,
  QuickActions, EmptyState,
} from '../../components/dashboard'
import {
  PARENT_QUICK_ACTIONS,
  type QuickAction,
} from '../../utils/dashboardTypes'
import { useParentNotes } from '../../hooks/useParentNotes'
import ParentHomeOverview from '../../components/dashboard/parent-home-overview'
import { useParentHomeActivity } from '../../hooks/use-parent-home-activity'
import { parentHomeCopy } from '../../utils/parent-home-copy'
import { currentAcademicPeriod, localISODate } from '../../utils/academicPeriod'
import { greetingKey } from '../../utils/format'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

type StudentQuickRoute =
  | 'StudentPerformance' | 'StudentRessources' | 'StudentEdt' | 'StudentComportement'
  | 'StudentAbsences' | 'StudentDevoirs' | 'StudentMessages' | 'StudentNotes'

const QUICK_ACTION_ROUTES: Record<string, StudentQuickRoute> = {
  pqa1: 'StudentPerformance',
  pqa2: 'StudentAbsences',
  pqa3: 'StudentDevoirs',
  pqa4: 'StudentMessages',
  pqa5: 'StudentRessources',
  pqa6: 'StudentEdt',
}

export default function ParentDashboardScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language.startsWith('ar')
  const copy = parentHomeCopy(i18n.language)
  const { profile } = useAuth()
  const parent = useParentData(false)
  const nav = useNavigation<StudentDashboardNav>()
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Parent'
  const firstName = fullName.split(' ')[0] || 'Parent'

  const [showGreeting, setShowGreeting] = useState(true)
  const [today, setToday] = useState(localISODate())
  useEffect(() => {
    const refreshDate = () => setToday(localISODate())
    const timer = setInterval(refreshDate, 60_000)
    const subscription = AppState.addEventListener('change', refreshDate)
    return () => { clearInterval(timer); subscription.remove() }
  }, [])

  // Le toast de salutation s'affiche une seule fois au montage puis s'efface.
  useEffect(() => {
    const id = setTimeout(() => setShowGreeting(false), 2600)
    return () => clearTimeout(id)
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
  const selectedEleve = parent.eleves.find(e => e.codeMassar === selectedChild?.id)
  const academic = useParentNotes(selectedChild?.id, selectedEleve?.classe, 'semester', selectedEleve?.niveau)
  const period = currentAcademicPeriod()
  const activity = useParentHomeActivity(profile?.uid || '', selectedChild?.id || '', selectedEleve?.classe || '', today)
  const goTo = (route: StudentQuickRoute) => {
    if (route === 'StudentPerformance') nav.navigate(route, { childId: selectedChild?.id })
    else if (route === 'StudentAbsences') nav.navigate(route, { childId: selectedChild?.id })
    else if (route === 'StudentDevoirs') nav.navigate(route, { screen: 'StudentDevoirsList', params: { childId: selectedChild?.id } })
    else nav.navigate(route)
  }

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
      >
        {parent.error && parent.children.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        <View style={styles.section}>
          {parent.loading ? (
            <ActivityIndicator accessibilityLabel={t('common.loading')} color={theme.primary} />
          ) : parent.error ? null : !selectedChild ? (
            <Card><EmptyState icon={Users} title={t('parent.noChildren')} message={t('parent.noChildrenMsg')} /></Card>
          ) : <>
            {parent.children.length > 1 && <View style={{ gap: 8, marginBottom: 14 }}>
              <Text style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold, textAlign: isAr ? 'right' : 'left', fontSize: 12 }}>{copy.children}</Text>
              <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
                {parent.children.map(child => {
                  const active = child.id === selectedChild.id
                  return <Pressable key={child.id} onPress={() => setSelectedChildId(child.id)}
                    accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${child.firstName} ${child.lastName}, ${child.classe}`}
                    style={({ pressed }) => ({ minHeight: 44, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                      flexDirection: isAr ? 'row-reverse' : 'row', gap: 6, alignItems: 'center', borderWidth: 1,
                      borderColor: active ? theme.primaryBorder : theme.border, backgroundColor: active ? theme.primarySurface : theme.card, opacity: pressed ? 0.7 : 1 })}>
                    {active && <Check size={15} color={theme.primary} />}
                    <Text style={{ flexShrink: 1, color: active ? theme.primary : theme.textSoft, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 13 }}>{child.firstName} {child.lastName}</Text>
                  </Pressable>
                })}
              </View>
            </View>}
            <ParentHomeOverview parentId={profile?.uid || ''} child={selectedChild} language={i18n.language} theme={theme}
              academic={academic} activity={activity} period={`${period.academicYear} · ${period.semestre}`}
              onResults={() => goTo('StudentPerformance')} onHomework={() => goTo('StudentDevoirs')} onAbsences={() => goTo('StudentAbsences')} />
          </>}
        </View>
        <View style={styles.section}>
          <Text style={{ color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold, fontSize: 16, textAlign: isAr ? 'right' : 'left' }}>{copy.quick}</Text>
          <Text style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabic : theme.fonts.medium, fontSize: 12, marginTop: 3, marginBottom: 12, textAlign: isAr ? 'right' : 'left' }}>{copy.allFamily}</Text>
          <QuickActions actions={PARENT_QUICK_ACTIONS} onPress={handleQuickAction} />
        </View>

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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  section: { paddingHorizontal: 20, marginTop: 18 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobA: { width: 148, height: 148, top: -30, right: -24 },
  blobB: { width: 88, height: 88, top: 120, left: -24 },
  blobC: { width: 128, height: 128, bottom: 36, right: -40 },
  greetingWrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  greetingToast: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, minWidth: 200 },
  footer: { alignItems: 'center', marginTop: 28 },
})
