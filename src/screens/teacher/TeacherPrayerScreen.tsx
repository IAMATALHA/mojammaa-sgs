import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  CheckCircle2,
  ChevronRight,
  Footprints,
  MoonStar,
  ShieldCheck,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentTeacherScheduleSlot } from '../../hooks/useCurrentTeacherScheduleSlot'
import type { TeacherRoute, TeacherStackParamList } from '../../navigation/types'
import {
  advancePrayerClassSession,
  startPrayerClassSession,
  subscribePrayerClassSession,
} from '../../services/prayer-class-service'
import { localServiceDate } from '../../services/pickup-service'
import type { PrayerClassSession, PrayerClassStatus } from '../../types/prayer'
import { hexWithAlpha } from '../../utils/format'

type VisibleStatus = PrayerClassStatus | 'idle'

const STATUS_ORDER: PrayerClassStatus[] = ['going', 'praying', 'returned']

export default function TeacherPrayerScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { currentSlot, loading: scheduleLoading } = useCurrentTeacherScheduleSlot()
  const isAr = i18n.language === 'ar'
  const route = useRoute<TeacherRoute<'TeacherPrayer'>>()
  const navigation = useNavigation<NativeStackNavigationProp<TeacherStackParamList>>()
  const { classe } = route.params
  const serviceDate = localServiceDate()
  const [session, setSession] = useState<PrayerClassSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    return subscribePrayerClassSession(
      serviceDate,
      classe,
      value => {
        setSession(value)
        setLoading(false)
        setError(null)
      },
      () => {
        setLoading(false)
        setError(t('prayer.loadError'))
      },
    )
  }, [classe, reloadKey, serviceDate, t])

  const visibleStatus: VisibleStatus = session?.status ?? 'idle'
  const statusTone = visibleStatus === 'going'
    ? theme.warning
    : visibleStatus === 'praying'
      ? theme.info
      : visibleStatus === 'returned'
        ? theme.success
        : theme.textMuted

  const ownsActiveSession = !!session
    && session.status !== 'returned'
    && session.startedByUid === user?.uid
  const isCurrentCourse = currentSlot?.classe === classe
  const nextStatus: PrayerClassStatus | null = !session
    ? (!scheduleLoading && isCurrentCourse ? 'going' : null)
    : ownsActiveSession && session.status === 'going'
      ? 'praying'
      : ownsActiveSession && session.status === 'praying'
        ? 'returned'
        : null
  const restrictionMessage = !loading && !session && !scheduleLoading && !isCurrentCourse
    ? t('prayer.currentCourseOnly')
    : !loading && session?.status !== 'returned' && !ownsActiveSession
      ? t('prayer.managedByStartingTeacher')
      : null

  const commitTransition = async () => {
    if (!nextStatus || saving) return
    setSaving(true)
    setError(null)
    try {
      if (nextStatus === 'going') {
        await startPrayerClassSession({ classe })
      } else if (session) {
        await advancePrayerClassSession(session.id, nextStatus)
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
    } catch (cause) {
      const code = typeof cause === 'object' && cause && 'code' in cause
        ? String(cause.code)
        : ''
      setError(code.includes('failed-precondition')
        ? t('prayer.currentCourseRequired')
        : code.includes('permission-denied')
          ? t('prayer.actionNotAllowed')
          : t('prayer.actionError'))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined)
    } finally {
      setSaving(false)
    }
  }

  const askForConfirmation = () => {
    if (!nextStatus) return
    const messageKey = nextStatus === 'going'
      ? 'prayer.confirmStart'
      : nextStatus === 'praying'
        ? 'prayer.confirmPraying'
        : 'prayer.confirmReturned'
    Alert.alert(
      t('prayer.confirmTitle', { classe }),
      t(messageKey),
      [
        { text: t('prayer.cancel'), style: 'cancel' },
        { text: t('prayer.confirm'), onPress: () => void commitTransition() },
      ],
    )
  }

  return (
    <ScreenLayout title={t('prayer.teacherTitle', { classe })} showBack>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.card, borderColor: hexWithAlpha(theme.info, 0.28) },
            theme.shadows.clay,
          ]}
        >
          <View style={[styles.heroWash, { backgroundColor: hexWithAlpha(theme.info, 0.1) }]} />
          <View style={[styles.badge, { backgroundColor: theme.infoSurface }, isAr && styles.rowReverse]}>
            <MoonStar size={14} color={theme.info} strokeWidth={2.2} />
            <Text style={[styles.badgeText, {
              color: theme.info,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            }]}>
              {t('prayer.manualBadge')}
            </Text>
          </View>

          <View style={[styles.classRow, isAr && styles.rowReverse]}>
            <View style={[styles.classCopy, isAr && styles.rtlBlock]}>
              <Text style={[styles.eyebrow, {
                color: theme.textMuted,
                fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold,
              }]}>
                {t('prayer.classLabel')}
              </Text>
              <Text style={[styles.className, {
                color: theme.text,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black,
              }]}>
                {classe}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: hexWithAlpha(statusTone, 0.12) }]}>
              <Text style={[styles.statusPillText, {
                color: statusTone,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              }]}>
                {t(`prayer.status.${visibleStatus}`)}
              </Text>
            </View>
          </View>

          <Text style={[styles.intro, {
            color: theme.textSoft,
            fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
            textAlign: isAr ? 'right' : 'left',
            writingDirection: isAr ? 'rtl' : 'ltr',
          }]}>
            {t('prayer.teacherIntro')}
          </Text>
        </View>

        <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <Text style={[styles.sectionLabel, {
            color: theme.text,
            fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            textAlign: isAr ? 'right' : 'left',
          }]}>
            {t('prayer.statusTitle')}
          </Text>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.info} />
              <Text style={[styles.stateText, {
                color: theme.textSoft,
                fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              }]}>{t('prayer.loading')}</Text>
            </View>
          ) : (
            <PrayerProgress status={session?.status ?? null} theme={theme} isAr={isAr} />
          )}
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface, borderColor: hexWithAlpha(theme.danger, 0.24) }]}>
            <Text style={[styles.errorText, {
              color: theme.danger,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              textAlign: isAr ? 'right' : 'left',
            }]}>{error}</Text>
            {loading ? null : (
              <Pressable
                onPress={() => setReloadKey(value => value + 1)}
                accessibilityRole="button"
                accessibilityLabel={t('prayer.retry')}
              >
                <Text style={[styles.retryText, {
                  color: theme.danger,
                  fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                }]}>{t('prayer.retry')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {restrictionMessage ? (
          <View style={[
            styles.restrictionBox,
            { backgroundColor: theme.infoSurface, borderColor: hexWithAlpha(theme.info, 0.22) },
            isAr && styles.rowReverse,
          ]}>
            <ShieldCheck size={18} color={theme.info} strokeWidth={2.2} />
            <Text style={[styles.restrictionText, {
              color: theme.textSoft,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              textAlign: isAr ? 'right' : 'left',
              writingDirection: isAr ? 'rtl' : 'ltr',
            }]}>{restrictionMessage}</Text>
          </View>
        ) : null}

        {!loading && nextStatus ? (
          <Pressable
            onPress={askForConfirmation}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t(`prayer.action.${nextStatus === 'going' ? 'start' : nextStatus}`)}
            style={({ pressed }) => [
              styles.primaryAction,
              { backgroundColor: nextStatus === 'returned' ? theme.success : theme.info },
              pressed && styles.pressed,
              saving && styles.disabled,
              isAr && styles.rowReverse,
            ]}
          >
            {saving
              ? <ActivityIndicator color={theme.white} />
              : nextStatus === 'returned'
                ? <CheckCircle2 size={21} color={theme.white} strokeWidth={2.3} />
                : <Footprints size={21} color={theme.white} strokeWidth={2.3} />}
            <Text style={[styles.primaryActionText, {
              color: theme.white,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            }]}>
              {t(`prayer.action.${nextStatus === 'going' ? 'start' : nextStatus}`)}
            </Text>
            <ChevronRight
              size={18}
              color={theme.white}
              strokeWidth={2.4}
              style={isAr ? styles.chevronRtl : undefined}
            />
          </Pressable>
        ) : null}

        {!loading && session?.status === 'returned' ? (
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [
              styles.doneAction,
              { backgroundColor: theme.successSurface, borderColor: hexWithAlpha(theme.success, 0.24) },
              pressed && styles.pressed,
              isAr && styles.rowReverse,
            ]}
          >
            <CheckCircle2 size={20} color={theme.success} strokeWidth={2.3} />
            <Text style={[styles.doneText, {
              color: theme.success,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            }]}>{t('prayer.status.returned')}</Text>
          </Pressable>
        ) : null}

        <View style={[styles.privacy, isAr && styles.rowReverse]}>
          <ShieldCheck size={17} color={theme.textMuted} strokeWidth={2.1} />
          <Text style={[styles.privacyText, {
            color: theme.textMuted,
            fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
            textAlign: isAr ? 'right' : 'left',
            writingDirection: isAr ? 'rtl' : 'ltr',
          }]}>{t('prayer.privacyNote')}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  )
}

function PrayerProgress({ status, theme, isAr }: {
  status: PrayerClassStatus | null
  theme: Theme
  isAr: boolean
}) {
  const { t } = useTranslation()
  const current = status ? STATUS_ORDER.indexOf(status) : -1
  return (
    <View style={[styles.progressRow, isAr && styles.rowReverse]}>
      {STATUS_ORDER.map((step, index) => {
        const reached = current >= index
        const active = current === index
        const tone = step === 'going' ? theme.warning : step === 'praying' ? theme.info : theme.success
        return (
          <React.Fragment key={step}>
            <View style={styles.step}>
              <View style={[
                styles.stepDot,
                {
                  backgroundColor: reached ? hexWithAlpha(tone, 0.14) : theme.surfaceAlt,
                  borderColor: reached ? tone : theme.border,
                },
                active && { transform: [{ scale: 1.08 }] },
              ]}>
                {step === 'returned'
                  ? <CheckCircle2 size={18} color={reached ? tone : theme.textMuted} strokeWidth={2.3} />
                  : step === 'praying'
                    ? <MoonStar size={18} color={reached ? tone : theme.textMuted} strokeWidth={2.3} />
                    : <Footprints size={18} color={reached ? tone : theme.textMuted} strokeWidth={2.3} />}
              </View>
              <Text numberOfLines={2} style={[styles.stepLabel, {
                color: reached ? tone : theme.textMuted,
                fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold,
                textAlign: 'center',
              }]}>{t(`prayer.status.${step}`)}</Text>
            </View>
            {index < STATUS_ORDER.length - 1 ? (
              <View style={[styles.stepLine, { backgroundColor: current > index ? theme.info : theme.border }]} />
            ) : null}
          </React.Fragment>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  chevronRtl: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.62 },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  heroWash: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    top: -58,
    right: -32,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: { fontSize: 11 },
  classRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  classCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10.5, textTransform: 'uppercase' },
  className: { fontSize: 28, lineHeight: 34, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, maxWidth: '58%' },
  statusPillText: { fontSize: 11.5, textAlign: 'center' },
  intro: { fontSize: 13, lineHeight: 20, marginTop: 15 },
  statusCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 17,
  },
  sectionLabel: { fontSize: 14.5 },
  centerState: { minHeight: 116, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  step: { width: 78, alignItems: 'center' },
  stepDot: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 10.5, lineHeight: 14, marginTop: 7 },
  stepLine: { flex: 1, height: 2, borderRadius: 2, marginTop: 21, marginHorizontal: -8 },
  errorBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  errorText: { fontSize: 12.5, lineHeight: 18 },
  retryText: { fontSize: 12, marginTop: 8 },
  restrictionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
  },
  restrictionText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  primaryAction: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  primaryActionText: { flex: 1, fontSize: 14.5, textAlign: 'center' },
  doneAction: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  doneText: { fontSize: 14 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 18, paddingHorizontal: 4 },
  privacyText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
})
