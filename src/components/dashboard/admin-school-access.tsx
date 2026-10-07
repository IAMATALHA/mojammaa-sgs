import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { ChevronRight, GraduationCap, Search, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { fontSize, radius, spacing } from '../../theme/designTokens'
import { adminHomeCopy } from '../../utils/admin-home-copy'

export function AdminSearchLink({ language, busy, onPress }: { language: string; busy: boolean; onPress: () => void }) {
  const theme = useTheme()
  const rtl = language.startsWith('ar')
  const copy = adminHomeCopy(language)
  return <Pressable accessibilityRole="button" accessibilityLabel={copy.search} accessibilityHint={copy.studentsHint}
    accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onPress}
    style={({ pressed }) => [s.search, { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: pressed ? theme.surfaceAlt : theme.card, borderColor: theme.border }]}>
    {busy ? <ActivityIndicator color={theme.primary} /> : <Search size={23} color={theme.textSoft} strokeWidth={1.7} />}
    <Text style={{ flex: 1, color: theme.textSoft, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.regular, fontSize: fontSize.bodyLg, textAlign: rtl ? 'right' : 'left' }}>{copy.search}</Text>
  </Pressable>
}

export interface AdminTile { label: string; hint: string; Icon: LucideIcon; onPress: () => void; busy?: boolean }

/** Row of three square tiles; stacks into list rows on narrow screens or large text. */
export function AdminTiles({ language, items }: { language: string; items: AdminTile[] }) {
  const theme = useTheme()
  const rtl = language.startsWith('ar')
  const { width, fontScale } = useWindowDimensions()
  const stacked = width < 350 || fontScale > 1.25
  return <View style={{ gap: spacing.md, flexDirection: stacked ? 'column' : rtl ? 'row-reverse' : 'row' }}>
    {items.map(({ label, hint, Icon, onPress, busy = false }) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint={hint} accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => [s.shortcut, { flex: stacked ? undefined : 1, flexDirection: stacked ? (rtl ? 'row-reverse' : 'row') : 'column', backgroundColor: pressed ? theme.surfaceAlt : theme.card, borderColor: theme.border }]}>
      {busy ? <ActivityIndicator color={theme.primary} /> : <Icon size={26} color={theme.primary} strokeWidth={1.7} />}
      <Text style={{ color: theme.text, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.medium, fontSize: fontSize.small, textAlign: 'center' }}>{label}</Text>
    </Pressable>)}
  </View>
}

export function AdminSchoolShortcuts({ language, openingStudents, onClasses, onStudents, onTeachers }: {
  language: string; openingStudents: boolean; onClasses: () => void; onStudents: () => void; onTeachers: () => void
}) {
  const copy = adminHomeCopy(language)
  return <AdminTiles language={language} items={[
    { label: copy.classes, hint: copy.classesHint, Icon: UsersRound, onPress: onClasses },
    { label: copy.studentDirectory, hint: copy.studentsHint, Icon: UserRound, onPress: onStudents, busy: openingStudents },
    { label: copy.teachers, hint: copy.teachersHint, Icon: GraduationCap, onPress: onTeachers },
  ]} />
}

export function AdminActionRow({ language, title, subtitle, Icon, onPress, accent = false, flush = false }: {
  language: string; title: string; subtitle: string; Icon: LucideIcon; onPress: () => void; accent?: boolean
  /** Drops the bottom divider when related content follows the row. */
  flush?: boolean
}) {
  const theme = useTheme()
  const rtl = language.startsWith('ar')
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress}
    style={({ pressed }) => [s.action, flush && s.flush, { flexDirection: rtl ? 'row-reverse' : 'row', borderColor: theme.border, backgroundColor: pressed ? theme.surfaceAlt : 'transparent' }]}>
    <View style={[s.icon, { backgroundColor: accent ? theme.accentSurface : theme.surfaceAlt }]}>
      <Icon size={23} strokeWidth={1.7} color={accent ? theme.accent : theme.primary} />
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
      <Text style={{ color: theme.text, fontFamily: rtl ? theme.fonts.arabicBold : theme.fonts.semibold, fontSize: fontSize.body, textAlign: rtl ? 'right' : 'left' }}>{title}</Text>
      <Text style={{ color: theme.textSoft, fontFamily: rtl ? theme.fonts.arabic : theme.fonts.regular, fontSize: fontSize.small, textAlign: rtl ? 'right' : 'left' }}>{subtitle}</Text>
    </View>
    <ChevronRight size={20} color={theme.primary} style={{ transform: [{ scaleX: rtl ? -1 : 1 }] }} />
  </Pressable>
}

const s = StyleSheet.create({
  search: { alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, minHeight: 56 },
  shortcut: { minWidth: 0, minHeight: 88, paddingVertical: spacing.lg, paddingHorizontal: spacing.xs, borderWidth: 1, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  action: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  flush: { borderBottomWidth: 0, paddingBottom: spacing.md },
  icon: { width: spacing.huge, height: spacing.huge, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
})
