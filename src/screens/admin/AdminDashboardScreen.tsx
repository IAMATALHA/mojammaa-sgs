/**
 * AdminDashboardScreen — Direction Claude v2
 *
 * Même pattern que parent / teacher : Hero brandé + watermark + grid
 * de KPI cliquables vers les sous-écrans admin.
 */
import React, { useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  Pressable, Image, Alert, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import AnimatedCard from '../../components/AnimatedCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useDashboardStats } from '../../hooks/useDashboardStats'
import { Users, BookOpen, GraduationCap, Percent, Megaphone } from 'lucide-react-native'

const { width: SCREEN_W } = Dimensions.get('window')

function greetingKey(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'greeting.morning'
  if (h < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function AdminDashboardScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { profile, logout } = useAuth()
  const { stats, loading, error, refresh } = useDashboardStats()
  const nav = useNavigation<any>()
  const goTo = (route: string) => nav.navigate(route)

  const fullName = profile
    ? `${profile.prenom} ${profile.nom}`.trim()
    : 'Direction'

  const handleAvatarPress = useCallback(() => {
    Alert.alert(
      fullName,
      profile?.email ?? t('admin.accountAdmin'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.logout'),
          style: 'destructive',
          onPress: () => logout().catch(() => {}),
        },
      ],
    )
  }, [fullName, profile, logout, t])

  const tint = theme.accent   // signature couleur admin = corail

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Watermark icon.png discret */}
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
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.accent} />
        }
      >
        {/* ── Hero ──────────────────────────────────────────── */}
        <MotiView
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 480 }}
        >
          <LinearGradient
            colors={[hexWithAlpha(tint, 0.14), theme.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTopRow}>
              <Pressable onPress={handleAvatarPress} hitSlop={8}>
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
                    <Text numberOfLines={1} style={{
                      color: theme.text,
                      fontFamily: theme.fonts.bold,
                      fontSize: 13,
                      letterSpacing: -0.2,
                    }}>
                      Mojammaa Al Maarifa
                    </Text>
                    <Text numberOfLines={1} style={{
                      color: theme.textSoft,
                      fontFamily: theme.fonts.arabicSemi,
                      fontSize: 11,
                      marginTop: 1,
                    }}>
                      مجمع المعرفة الخصوصية
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable onPress={() => goTo('AdminBroadcast')} hitSlop={8}>
                {({ pressed }) => (
                  <MotiView
                    animate={{ scale: pressed ? 0.94 : 1 }}
                    transition={{ type: 'timing', duration: 150 }}
                    style={[styles.heroBell, { backgroundColor: theme.white }]}
                  >
                    <Megaphone size={18} color={theme.text} strokeWidth={1.75} />
                  </MotiView>
                )}
              </Pressable>
            </View>

            <View style={styles.heroGreetBlock}>
              <Text style={{
                color: theme.textSoft,
                fontFamily: theme.fonts.medium,
                fontSize: 12,
                letterSpacing: 0.4,
              }}>
                {t(greetingKey()).toUpperCase()} · {t('roles.admin')}
              </Text>
              <Text numberOfLines={1} style={{
                color: '#1D3557',
                fontFamily: theme.fonts.script,
                fontSize: 34,
                lineHeight: 42,
                marginTop: 2,
              }}>
                {fullName.split(' ')[0] || 'Admin'}
              </Text>
            </View>
          </LinearGradient>
        </MotiView>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface, marginHorizontal: 20 }]}>
            <Text style={{ color: theme.danger, fontFamily: theme.fonts.semibold, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {loading && !stats ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <View style={styles.kpiSection}>
            <View style={styles.kpiRow}>
              <AnimatedCard style={styles.statBox} delay={100} onPress={() => goTo('AdminUsers')}>
                <Users color={theme.accent} size={26} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text, fontFamily: theme.fonts.bold }]}>{stats?.totalEleves ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{t('admin.eleves')}</Text>
              </AnimatedCard>

              <AnimatedCard style={styles.statBox} delay={200} onPress={() => goTo('AdminUsers')}>
                <BookOpen color={theme.accent} size={26} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text, fontFamily: theme.fonts.bold }]}>{stats?.totalProfs ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{t('admin.profs')}</Text>
              </AnimatedCard>
            </View>

            <View style={styles.kpiRow}>
              <AnimatedCard style={styles.statBox} delay={300} onPress={() => goTo('AdminClasses')}>
                <GraduationCap color={theme.accent} size={26} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text, fontFamily: theme.fonts.bold }]}>{stats?.totalClasses ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{t('tabs.classes')}</Text>
              </AnimatedCard>

              <AnimatedCard style={styles.statBox} delay={400} onPress={() => goTo('AdminStats')}>
                <Percent color={theme.accent} size={26} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text, fontFamily: theme.fonts.bold }]}>{stats?.attendanceRate ?? 0}%</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>{t('admin.attendanceRate')}</Text>
              </AnimatedCard>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 11,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}>
            Mojammaa Al Maarifa · {t('roles.admin')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { paddingBottom: 180 },

  // Watermark
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
  heroGreetBlock: {
    marginTop: 16,
  },

  // KPIs
  kpiSection: {
    paddingHorizontal: 14,
    marginTop: 18,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    marginHorizontal: 6,
    alignItems: 'flex-start',
  },
  icon: {
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    marginBottom: 2,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 14,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  footer: {
    alignItems: 'center', justifyContent: 'center',
    marginTop: 32,
  },
})
