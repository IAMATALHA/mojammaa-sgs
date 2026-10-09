import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { Award, BookOpen, CalendarDays, ClipboardCheck, KeyRound, Ticket, TrendingUp, UserRound } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAdminStudentDirectory } from '../../hooks/use-admin-student-directory'
import type { AdminDashboardNav } from '../../navigation/types'
import { adminHomeCopy } from '../../utils/admin-home-copy'
import { fontSize, radius, spacing } from '../../theme/designTokens'
import { AdminActionRow, AdminSchoolShortcuts, AdminSearchLink } from '../../components/dashboard/admin-school-access'

export default function AdminSchoolScreen() {
  const theme = useTheme()
  const nav = useNavigation<AdminDashboardNav>()
  const { i18n } = useTranslation()
  const { openingStudents, openStudents } = useAdminStudentDirectory()
  const language = i18n.language
  const copy = adminHomeCopy(language)
  const rtl = language.startsWith('ar')
  const text = { color: theme.text, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.regular, textAlign: rtl ? 'right' as const : 'left' as const }
  const bold = { fontFamily: rtl ? theme.fonts.arabicBold : theme.fonts.bold }

  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.bg }}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={[s.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Text accessibilityRole="header" style={[text, bold, s.title]}>{copy.schoolTitle}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.profile} onPress={() => nav.navigate('AdminSettings')}
          style={({ pressed }) => [s.profile, { backgroundColor: pressed ? theme.border : theme.surfaceAlt }]}>
          <UserRound size={25} color={theme.primary} strokeWidth={1.6} />
        </Pressable>
      </View>
      <Text style={[text, s.subtitle, { color: theme.textSoft }]}>{copy.schoolHint}</Text>
      <AdminSearchLink language={language} busy={openingStudents} onPress={() => { void openStudents(true) }} />
      <AdminSchoolShortcuts language={language} openingStudents={openingStudents}
        onClasses={() => nav.navigate('AdminClasses')} onStudents={() => { void openStudents() }}
        onTeachers={() => nav.navigate('AdminUsers', { role: 'professeur' })} />
      <View>
        <Text accessibilityRole="header" style={[text, bold, { fontSize: fontSize.title }]}>{copy.dailyTools}</Text>
        <AdminActionRow language={language} title={copy.absences} subtitle={copy.absencesHint} Icon={ClipboardCheck} onPress={() => nav.navigate('AdminAbsences')} />
        <AdminActionRow language={language} title={copy.homework} subtitle={copy.homeworkHint} Icon={BookOpen} onPress={() => nav.navigate('AdminDevoirs')} />
        <AdminActionRow language={language} title={copy.calendar} subtitle={copy.calendarHint} Icon={CalendarDays} onPress={() => nav.navigate('AdminCalendarTab')} />
        <AdminActionRow language={language} title={copy.analyses} subtitle={copy.analysesHint} Icon={TrendingUp} onPress={() => nav.navigate('AdminStatsTab')} />
        <AdminActionRow language={language} title={copy.behavior} subtitle={copy.behaviorHint} Icon={Award} onPress={() => nav.navigate('AdminBehavior')} />
      </View>
      <View>
        <Text accessibilityRole="header" style={[text, bold, { fontSize: fontSize.title }]}>{copy.management}</Text>
        <AdminActionRow language={language} title={copy.accounts} subtitle={copy.accountsHint} Icon={KeyRound} onPress={() => nav.navigate('AdminUsers', { role: 'professeur' })} />
        <AdminActionRow language={language} title={copy.parentCodes} subtitle={copy.parentCodesHint} Icon={Ticket} onPress={() => nav.navigate('AdminParentCodes')} />
      </View>
    </ScrollView>
  </SafeAreaView>
}

const s = StyleSheet.create({
  page: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { alignItems: 'center', gap: spacing.md },
  title: { flex: 1, fontSize: fontSize.h1 },
  subtitle: { fontSize: fontSize.body, lineHeight: 24 },
  profile: { width: spacing.huge, height: spacing.huge, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
})
