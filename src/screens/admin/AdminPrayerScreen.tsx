import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  CheckCircle2,
  Footprints,
  MoonStar,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { subscribePrayerClassSessionsForDay } from '../../services/prayer-class-service'
import { localServiceDate } from '../../services/pickup-service'
import type { PrayerClassSession, PrayerClassStatus } from '../../types/prayer'
import { hexWithAlpha } from '../../utils/format'

export default function AdminPrayerScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const serviceDate = localServiceDate()
  const [sessions, setSessions] = useState<PrayerClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(false)
    return subscribePrayerClassSessionsForDay(
      serviceDate,
      value => {
        setSessions(value)
        setLoading(false)
        setError(false)
      },
      () => {
        setLoading(false)
        setError(true)
      },
    )
  }, [reloadKey, serviceDate])

  const active = sessions.filter(session => session.status !== 'returned')
  const completed = sessions.filter(session => session.status === 'returned')

  return (
    <ScreenLayout title={t('prayer.adminTitle')} showBack>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[
          styles.hero,
          { backgroundColor: theme.card, borderColor: hexWithAlpha(theme.info, 0.26) },
          theme.shadows.clay,
        ]}>
          <View style={[styles.heroTop, isAr && styles.rowReverse]}>
            <View style={[styles.heroIcon, { backgroundColor: theme.infoSurface }]}>
              <MoonStar size={22} color={theme.info} strokeWidth={2.2} />
            </View>
            <View style={[styles.heroCopy, isAr && styles.rtlBlock]}>
              <Text style={[styles.heroTitle, {
                color: theme.text,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              }]}>{t('prayer.todayTitle')}</Text>
              <Text style={[styles.heroHint, {
                color: theme.textSoft,
                fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
                textAlign: isAr ? 'right' : 'left',
              }]}>{t('prayer.adminHint')}</Text>
            </View>
          </View>
          <View style={[styles.summaryRow, isAr && styles.rowReverse]}>
            <SummaryPill
              value={t('prayer.activeSummary', { count: active.length })}
              color={active.length > 0 ? theme.info : theme.textMuted}
              bg={active.length > 0 ? theme.infoSurface : theme.surfaceAlt}
              theme={theme}
              isAr={isAr}
            />
            <SummaryPill
              value={t('prayer.completedSummary', { count: completed.length })}
              color={completed.length > 0 ? theme.success : theme.textMuted}
              bg={completed.length > 0 ? theme.successSurface : theme.surfaceAlt}
              theme={theme}
              isAr={isAr}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.info} />
            <Text style={[styles.stateText, {
              color: theme.textSoft,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
            }]}>{t('prayer.loading')}</Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: theme.dangerSurface, borderColor: hexWithAlpha(theme.danger, 0.24) }]}>
            <Text style={[styles.errorText, {
              color: theme.danger,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              textAlign: isAr ? 'right' : 'left',
            }]}>{t('prayer.loadError')}</Text>
            <Pressable
              onPress={() => setReloadKey(value => value + 1)}
              accessibilityRole="button"
              accessibilityLabel={t('prayer.retry')}
              style={[styles.retryButton, isAr && styles.rowReverse]}
            >
              <RefreshCw size={15} color={theme.danger} strokeWidth={2.2} />
              <Text style={[styles.retryText, {
                color: theme.danger,
                fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
              }]}>{t('prayer.retry')}</Text>
            </Pressable>
          </View>
        ) : sessions.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceAlt }]}>
              <MoonStar size={22} color={theme.textMuted} strokeWidth={2} />
            </View>
            <Text style={[styles.emptyTitle, {
              color: theme.text,
              fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
            }]}>{t('prayer.noActive')}</Text>
            <Text style={[styles.emptyText, {
              color: theme.textSoft,
              fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
              textAlign: 'center',
            }]}>{t('prayer.noSessions')}</Text>
          </View>
        ) : (
          <>
            {active.length > 0 ? (
              <SessionPanel sessions={active} theme={theme} isAr={isAr} language={i18n.language} />
            ) : null}
            {completed.length > 0 ? (
              <View style={styles.completedBlock}>
                <Text style={[styles.sectionLabel, {
                  color: theme.textMuted,
                  fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                  textAlign: isAr ? 'right' : 'left',
                }]}>{t('prayer.completedToday')}</Text>
                <SessionPanel sessions={completed} theme={theme} isAr={isAr} language={i18n.language} />
              </View>
            ) : null}
          </>
        )}

        <View style={[styles.privacy, isAr && styles.rowReverse]}>
          <ShieldCheck size={17} color={theme.textMuted} strokeWidth={2.1} />
          <Text style={[styles.privacyText, {
            color: theme.textMuted,
            fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.medium,
            textAlign: isAr ? 'right' : 'left',
          }]}>{t('prayer.privacyNote')}</Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  )
}

function SummaryPill({ value, color, bg, theme, isAr }: {
  value: string
  color: string
  bg: string
  theme: Theme
  isAr: boolean
}) {
  return (
    <View style={[styles.summaryPill, { backgroundColor: bg }]}>
      <Text style={[styles.summaryText, {
        color,
        fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
      }]}>{value}</Text>
    </View>
  )
}

function SessionPanel({ sessions, theme, isAr, language }: {
  sessions: PrayerClassSession[]
  theme: Theme
  isAr: boolean
  language: string
}) {
  return (
    <View style={[styles.sessionPanel, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
      {sessions.map((session, index) => (
        <SessionRow
          key={session.id}
          session={session}
          divider={index < sessions.length - 1}
          theme={theme}
          isAr={isAr}
          language={language}
        />
      ))}
    </View>
  )
}

function SessionRow({ session, divider, theme, isAr, language }: {
  session: PrayerClassSession
  divider: boolean
  theme: Theme
  isAr: boolean
  language: string
}) {
  const { t } = useTranslation()
  const tone = session.status === 'going'
    ? theme.warning
    : session.status === 'praying'
      ? theme.info
      : theme.success
  const timestamp = session.status === 'returned'
    ? session.returnedAt
    : session.status === 'praying'
      ? session.prayingAt
      : session.startedAt
  const time = timestamp?.toDate
    ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(timestamp.toDate())
    : ''
  return (
    <View style={[styles.sessionRow, isAr && styles.rowReverse]}>
      <View style={[styles.sessionIcon, { backgroundColor: hexWithAlpha(tone, 0.12) }]}>
        {session.status === 'going'
          ? <Footprints size={18} color={tone} strokeWidth={2.2} />
          : session.status === 'praying'
            ? <MoonStar size={18} color={tone} strokeWidth={2.2} />
            : <CheckCircle2 size={18} color={tone} strokeWidth={2.2} />}
      </View>
      <View style={[styles.sessionCopy, isAr && styles.rtlBlock]}>
        <Text style={[styles.sessionClass, {
          color: theme.text,
          fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
        }]}>{session.classe}</Text>
        <Text style={[styles.sessionStatus, {
          color: tone,
          fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold,
        }]}>{t(`prayer.status.${session.status}`)}</Text>
      </View>
      {time ? (
        <Text style={[styles.sessionTime, {
          color: theme.textMuted,
          fontFamily: theme.fonts.semibold,
        }]}>{time}</Text>
      ) : null}
      {divider ? (
        <View style={[
          styles.divider,
          isAr ? styles.dividerRtl : styles.dividerLtr,
          { backgroundColor: theme.border },
        ]} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  rowReverse: { flexDirection: 'row-reverse' },
  rtlBlock: { alignItems: 'flex-end' },
  hero: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 18 },
  heroHint: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 15 },
  summaryPill: { flex: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' },
  summaryText: { fontSize: 11.5 },
  centerState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { fontSize: 12 },
  errorCard: { marginTop: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 15 },
  errorText: { fontSize: 12.5, lineHeight: 18 },
  retryButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, marginTop: 10 },
  retryText: { fontSize: 12 },
  emptyCard: { marginTop: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 22, alignItems: 'center' },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, marginTop: 13 },
  emptyText: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  completedBlock: { marginTop: 18 },
  sectionLabel: { fontSize: 11, textTransform: 'uppercase', marginBottom: 7, paddingHorizontal: 3 },
  sessionPanel: { marginTop: 14, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sessionRow: { position: 'relative', minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10 },
  sessionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sessionCopy: { flex: 1, minWidth: 0 },
  sessionClass: { fontSize: 14.5 },
  sessionStatus: { fontSize: 11.5, marginTop: 2 },
  sessionTime: { fontSize: 11, fontVariant: ['tabular-nums'] },
  divider: { position: 'absolute', bottom: 0, height: StyleSheet.hairlineWidth },
  dividerLtr: { left: 63, right: 14 },
  dividerRtl: { right: 63, left: 14 },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 18, paddingHorizontal: 4 },
  privacyText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
})
