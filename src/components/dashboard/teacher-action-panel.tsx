import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { CalendarDays, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Inbox, ListChecks, RefreshCw, TriangleAlert } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import type { DashboardAction } from './action-center'

type Props = {
  rows: DashboardAction[]
  loading: boolean
  failed: boolean
  complete: boolean
  checkedAt?: number
  nextAppointment?: { date: string; time: string } | null
  onRefresh: () => void
  onAction: (action: DashboardAction) => void
}

export default function TeacherActionPanel({ rows, loading, failed, complete, checkedAt, nextAppointment, onRefresh, onAction }: Props) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const rowDirection = rtl ? 'row-reverse' as const : 'row' as const
  const textAlign = rtl ? 'right' as const : 'left' as const
  const regular = rtl ? theme.fonts.arabic : theme.fonts.regular
  const bold = rtl ? theme.fonts.arabicBold : theme.fonts.bold
  const Arrow = rtl ? ChevronLeft : ChevronRight
  const actions = rows.filter(row => row.kind !== 'appointments')
  const date = nextAppointment ? new Date(`${nextAppointment.date}T12:00:00Z`) : null
  const validDate = date && Number.isFinite(date.getTime()) ? date : null
  const locale = rtl ? 'ar-MA' : i18n.language.startsWith('fr') ? 'fr-MA' : 'en-GB'
  const dateLabel = validDate?.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'Africa/Casablanca' })
  const dayLabel = validDate?.toLocaleDateString(locale, { weekday: 'long', timeZone: 'Africa/Casablanca' })

  return (
    <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 18, gap: 12 }}>
      <View style={{ backgroundColor: theme.card, borderRadius: 22, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.primarySurface, alignItems: 'center', justifyContent: 'center' }}>
            <ListChecks size={21} color={theme.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontFamily: bold, fontSize: 19, textAlign }}>{t('actionCenter.title')}</Text>
            <Text style={{ color: theme.textSoft, fontFamily: regular, fontSize: 12, textAlign }}>{t('actionCenter.teacherSubtitle')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('actionCenter.refresh')} accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={onRefresh}
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 14, backgroundColor: pressed ? theme.primarySurface : theme.surface, alignItems: 'center', justifyContent: 'center' })}>
            {loading ? <ActivityIndicator color={theme.primary} size="small" /> : <RefreshCw size={18} color={theme.textSoft} />}
          </Pressable>
        </View>

        {failed && <View accessibilityLiveRegion="polite" style={{ flexDirection: rowDirection, gap: 9, padding: 12, borderRadius: 12, backgroundColor: theme.dangerSurface }}>
          <TriangleAlert size={18} color={theme.danger} />
          <Text style={{ flex: 1, color: theme.danger, fontFamily: regular, fontSize: 12, lineHeight: 19, textAlign }}>{t('actionCenter.failed')}</Text>
        </View>}
        {loading && !checkedAt && <Text style={{ color: theme.textSoft, fontFamily: regular, textAlign }}>{t('common.loading')}</Text>}
        {complete && actions.length === 0 && <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.successSurface }}>
          <CheckCheck size={26} color={theme.success} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: theme.success, fontFamily: bold, fontSize: 15, textAlign }}>{t('actionCenter.upToDate')}</Text>
            <Text style={{ color: theme.textSoft, fontFamily: regular, fontSize: 12, lineHeight: 18, textAlign }}>{t('actionCenter.clear')}</Text>
          </View>
        </View>}
        <View style={{ gap: 9 }}>
          {actions.map((action, index) => {
            const attendance = action.kind === 'attendance'
            const reviews = action.kind === 'reviews'
            const Icon = attendance ? ClipboardCheck : reviews ? ListChecks : Inbox
            const color = attendance ? theme.primary : reviews ? theme.info : theme.success
            const background = attendance ? theme.primarySurface : reviews ? theme.infoSurface : theme.successSurface
            const title = attendance ? `${action.classe} · ${action.seance}` : t(reviews ? 'actionCenter.reviewTitle' : 'actionCenter.messageTitle')
            const detail = t(attendance ? 'actionCenter.studentsPending' : reviews ? 'actionCenter.reviewsPending' : 'actionCenter.messagesPending', { count: action.count })
            return <Pressable key={`${action.kind}:${action.lessonKey || index}`} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={() => onAction(action)}
              style={({ pressed }) => ({ flexDirection: rowDirection, alignItems: 'center', gap: 11, padding: 12, minHeight: 78, borderRadius: 16, borderWidth: 1, borderColor: pressed ? color : theme.border, backgroundColor: pressed ? background : theme.surface })}>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: 42, height: 46, borderRadius: 13, backgroundColor: background }}><Icon size={22} color={color} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: theme.text, fontFamily: bold, fontSize: 14, textAlign }}>{title}</Text>
                <Text style={{ color: theme.textSoft, fontFamily: regular, fontSize: 12, lineHeight: 18, textAlign }}>{detail}</Text>
              </View>
              <View style={{ gap: 4, alignItems: 'center' }}>
                <Text style={{ color, fontFamily: bold, fontSize: 23, fontVariant: ['tabular-nums'] }}>{action.count}</Text>
                <Arrow size={16} color={color} />
              </View>
            </Pressable>
          })}
        </View>
        {!!checkedAt && <Text style={{ color: theme.textSoft, fontFamily: regular, fontSize: 11, textAlign }}>
          {t('actionCenter.lastChecked', { time: new Date(checkedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
        </Text>}
      </View>

      <Pressable accessibilityRole="button" onPress={() => onAction({ kind: 'appointments', count: 0 })}
        style={({ pressed }) => ({ borderRadius: 22, backgroundColor: theme.primaryDark, padding: 18, gap: 16, opacity: pressed ? 0.9 : 1 })}>
        <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 9 }}>
          <CalendarDays size={20} color="#FFFFFF" />
          <Text style={{ flex: 1, color: '#FFFFFF', fontFamily: bold, fontSize: 18, textAlign }}>{t('appointments.title')}</Text>
          <Arrow size={20} color="#FFFFFF" />
        </View>
        <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 14 }}>
          <View style={{ minWidth: 76, maxWidth: 112, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {validDate ? <>
              <Text style={{ color: theme.primaryDark, fontFamily: bold, fontSize: 19, textAlign: 'center' }}>{dateLabel}</Text>
              <Text style={{ color: theme.textSoft, fontFamily: regular, fontSize: 11, textAlign: 'center' }}>{dayLabel}</Text>
            </> : <CalendarDays size={30} color={theme.primary} />}
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: '#FFFFFF', fontFamily: bold, fontSize: 15, textAlign }}>{t(nextAppointment ? 'actionCenter.nextConfirmed' : failed || !checkedAt ? 'actionCenter.viewAgenda' : 'actionCenter.noMeeting')}</Text>
            {nextAppointment ? <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 6 }}>
              <Clock3 size={14} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontFamily: regular, fontSize: 13, flexShrink: 1, textAlign }}>{nextAppointment.time} · {t('appointments.timezone')}</Text>
            </View> : <Text style={{ color: '#FFFFFF', fontFamily: regular, fontSize: 12, lineHeight: 19, textAlign }}>{t('actionCenter.meetingHint')}</Text>}
          </View>
        </View>
        <View style={{ alignSelf: rtl ? 'flex-end' : 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: '#FFFFFF66', paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: bold, fontSize: 12 }}>{t('actionCenter.viewAgenda')}</Text>
        </View>
      </Pressable>
    </View>
  )
}
