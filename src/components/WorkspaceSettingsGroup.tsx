import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  BusFront, CheckCircle2, ChevronRight, GraduationCap, ShieldCheck,
  UsersRound, type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useWorkspace } from '../contexts/driver-workspace-context'

type WorkspaceKey = 'parent' | 'teacher' | 'admin' | 'driver'

interface WorkspaceOption {
  key: WorkspaceKey
  label: string
  Icon: LucideIcon
  onPress?: () => void
  subtitle: string
  disabled: boolean
}

/** Sélecteur partagé par tous les écrans Réglages, y compris la Direction. */
export default function WorkspaceSettingsGroup() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { role } = useAuth()
  const {
    activeWorkspace,
    canUseDriverWorkspace,
    canUseParentWorkspace,
    isParentWorkspaceLoading,
    parentWorkspaceError,
    openPrimaryWorkspace,
    openDriverWorkspace,
    openParentWorkspace,
    retryParentWorkspace,
  } = useWorkspace()

  const primaryKey: WorkspaceKey = role === 'teacher'
    ? 'teacher'
    : role === 'admin'
      ? 'admin'
      : role === 'driver'
        ? 'driver'
        : 'parent'
  const activeKey: WorkspaceKey = activeWorkspace === 'parent'
    ? 'parent'
    : activeWorkspace === 'driver'
      ? 'driver'
      : primaryKey
  const workspaceMeta: Record<WorkspaceKey, { label: string; Icon: LucideIcon }> = {
    parent: { label: t('workspace.parent'), Icon: UsersRound },
    teacher: { label: t('workspace.teacher'), Icon: GraduationCap },
    admin: { label: t('workspace.admin'), Icon: ShieldCheck },
    driver: { label: t('workspace.driver'), Icon: BusFront },
  }

  const options: WorkspaceOption[] = [{
    key: primaryKey,
    ...workspaceMeta[primaryKey],
    onPress: openPrimaryWorkspace,
    subtitle: activeKey === primaryKey ? t('workspace.active') : t('workspace.switch'),
    disabled: activeKey === primaryKey,
  }]

  if (primaryKey !== 'parent') {
    const canRetryParent = Boolean(parentWorkspaceError)
    options.push({
      key: 'parent',
      ...workspaceMeta.parent,
      onPress: canUseParentWorkspace
        ? openParentWorkspace
        : canRetryParent
          ? retryParentWorkspace
          : undefined,
      subtitle: activeKey === 'parent'
        ? t('workspace.active')
        : isParentWorkspaceLoading
          ? t('workspace.checking')
          : canUseParentWorkspace
            ? t('workspace.switch')
            : canRetryParent
              ? t('workspace.retryParent')
              : t('workspace.parentUnavailable'),
      disabled: activeKey === 'parent'
        || isParentWorkspaceLoading
        || (!canUseParentWorkspace && !canRetryParent),
    })
  }

  if (canUseDriverWorkspace && primaryKey !== 'driver') {
    options.push({
      key: 'driver',
      ...workspaceMeta.driver,
      onPress: openDriverWorkspace,
      subtitle: activeKey === 'driver' ? t('workspace.active') : t('workspace.switch'),
      disabled: activeKey === 'driver',
    })
  }

  return (
    <View>
      <Text style={[styles.groupTitle, { color: theme.textMuted, fontFamily: theme.fonts.bold }]}>
        {t('workspace.title')}
      </Text>
      <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }, theme.shadows.xs]}>
        {options.map((option, index) => {
          const isActive = option.key === activeKey
          const Icon = option.Icon
          return (
            <TouchableOpacity
              key={option.key}
              disabled={option.disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive, disabled: option.disabled }}
              accessibilityLabel={option.label}
              accessibilityHint={option.subtitle}
              onPress={option.onPress}
              style={[
                styles.row,
                index === options.length - 1 && styles.rowLast,
                { borderBottomColor: theme.border },
                option.disabled && !isActive && styles.rowUnavailable,
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: isActive ? theme.primarySurface : theme.surfaceAlt }]}>
                <Icon size={16} color={isActive ? theme.primary : theme.textSoft} strokeWidth={2} />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, { color: theme.text, fontFamily: theme.fonts.semibold }]}>
                  {option.label}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>
                  {option.subtitle}
                </Text>
              </View>
              {isActive
                ? <CheckCircle2 size={18} color={theme.success} strokeWidth={2.2} />
                : !option.disabled && <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
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
  rowUnavailable: { opacity: 0.55 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 14 },
  rowSub: { fontSize: 11.5, marginTop: 2 },
})
