/**
 * BasicSettingsScreen — écran Réglages partagé (prof + parent).
 * Liste groupée sobre : profil avec avatar, langue, version, déconnexion.
 * L'écran admin (AdminSettingsScreen) garde sa propre version avec les
 * outils d'administration en plus.
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  Globe, ChevronRight, CheckCircle2, UsersRound, GraduationCap,
  BusFront, ShieldCheck, type LucideIcon,
} from 'lucide-react-native'
import Constants from 'expo-constants'
import ScreenLayout from './ScreenLayout'
import LanguagePicker from './LanguagePicker'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/driver-workspace-context'
import { initialsOf } from '../utils/format'

const APP_VERSION = Constants.expoConfig?.version ?? '—'

export default function BasicSettingsScreen({ roleLabel }: { roleLabel: string }) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const { profile, role, logout } = useAuth()
  const {
    activeWorkspace,
    canUseDriverWorkspace,
    canUseParentWorkspace,
    openPrimaryWorkspace,
    openDriverWorkspace,
    openParentWorkspace,
  } = useWorkspace()
  const [langOpen, setLangOpen] = useState(false)

  const langLabel = i18n.language === 'ar' ? 'العربية' : i18n.language === 'en' ? 'English' : 'Français'
  const fullName = profile ? `${profile.prenom} ${profile.nom}`.trim() : '—'

  type WorkspaceOption = {
    key: 'parent' | 'teacher' | 'admin' | 'driver'
    label: string
    Icon: LucideIcon
    onPress: () => void
  }

  const primaryKey: WorkspaceOption['key'] = role === 'teacher'
    ? 'teacher'
    : role === 'admin'
      ? 'admin'
      : role === 'driver'
        ? 'driver'
        : 'parent'
  const activeKey: WorkspaceOption['key'] = activeWorkspace === 'parent'
    ? 'parent'
    : activeWorkspace === 'driver'
      ? 'driver'
      : primaryKey
  const workspaceMeta: Record<WorkspaceOption['key'], { label: string; Icon: LucideIcon }> = {
    parent: { label: t('workspace.parent'), Icon: UsersRound },
    teacher: { label: t('workspace.teacher'), Icon: GraduationCap },
    admin: { label: t('workspace.admin'), Icon: ShieldCheck },
    driver: { label: t('workspace.driver'), Icon: BusFront },
  }
  const workspaceOptions: WorkspaceOption[] = [
    {
      key: primaryKey,
      ...workspaceMeta[primaryKey],
      onPress: openPrimaryWorkspace,
    },
  ]
  if (canUseParentWorkspace && primaryKey !== 'parent') {
    workspaceOptions.push({ key: 'parent', ...workspaceMeta.parent, onPress: openParentWorkspace })
  }
  if (canUseDriverWorkspace && primaryKey !== 'driver') {
    workspaceOptions.push({ key: 'driver', ...workspaceMeta.driver, onPress: openDriverWorkspace })
  }

  const handleLogout = () => {
    Alert.alert(t('common.logoutTitle'), t('common.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => logout().catch(() => {}) },
    ])
  }

  return (
    <ScreenLayout title={t('tabs.settings')}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profil */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <View style={[styles.row, styles.rowLast]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={{ color: theme.white, fontFamily: theme.fonts.bold, fontSize: 15 }}>{initialsOf(fullName)}</Text>
            </View>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15 }]}>{fullName}</Text>
              <Text numberOfLines={1} style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
                {profile?.email || ''} · {roleLabel}
              </Text>
            </View>
          </View>
        </View>

        {workspaceOptions.length > 1 ? (
          <View>
            <Text style={[styles.groupTitle, { color: theme.textMuted, fontFamily: theme.fonts.bold }]}>
              {t('workspace.title')}
            </Text>
            <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
              {workspaceOptions.map((option, index) => {
                const isActive = option.key === activeKey
                const Icon = option.Icon
                return (
                  <TouchableOpacity
                    key={option.key}
                    disabled={isActive}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive, disabled: isActive }}
                    accessibilityLabel={`${option.label}${isActive ? `, ${t('workspace.active')}` : ''}`}
                    onPress={option.onPress}
                    style={[
                      styles.row,
                      index === workspaceOptions.length - 1 && styles.rowLast,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: isActive ? theme.primarySurface : theme.surfaceAlt }]}>
                      <Icon size={16} color={isActive ? theme.primary : theme.textSoft} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
                        {isActive ? t('workspace.active') : t('workspace.switch')}
                      </Text>
                    </View>
                    {isActive
                      ? <CheckCircle2 size={18} color={theme.success} strokeWidth={2.2} />
                      : <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ) : null}

        {/* Langue */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setLangOpen(true)}>
            <View style={[styles.rowIcon, { backgroundColor: theme.primarySurface }]}>
              <Globe size={16} color={theme.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.rowTitle, { flex: 1, color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('common.language')}</Text>
            <Text style={[styles.rowValue, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{langLabel}</Text>
            <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Application */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={[styles.rowTitle, { flex: 1, color: theme.text, fontFamily: theme.fonts.semibold }]}>{t('admin.version')}</Text>
            <Text style={[styles.rowValue, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>{APP_VERSION}</Text>
          </View>
        </View>

        {/* Déconnexion */}
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
          <TouchableOpacity style={[styles.row, styles.rowLast, { justifyContent: 'center' }]} onPress={handleLogout}>
            <Text style={{ color: theme.danger, fontFamily: theme.fonts.bold, fontSize: 14 }}>{t('common.logout')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
          Mojammaa Al Maarifa · v{APP_VERSION}
        </Text>
      </ScrollView>

      <LanguagePicker visible={langOpen} onClose={() => setLangOpen(false)} />
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    overflow: 'hidden',
  },
  groupTitle: {
    marginStart: 4,
    marginBottom: 7,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 14 },
  rowSub:   { fontSize: 11.5, marginTop: 2 },
  rowValue: { fontSize: 13 },
  footer: { textAlign: 'center', fontSize: 10.5, letterSpacing: 0.4, marginTop: 10 },
})
