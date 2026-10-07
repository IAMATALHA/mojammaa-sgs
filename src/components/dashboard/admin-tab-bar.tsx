import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { fontSize, radius, spacing } from '../../theme/designTokens'

export default function AdminTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const rtl = i18n.language.startsWith('ar')

  return <View style={[s.bar, {
    flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: theme.card, borderColor: theme.border,
    paddingBottom: Math.max(insets.bottom, spacing.sm), paddingLeft: insets.left, paddingRight: insets.right,
  }]}>
    {state.routes.map((route, index) => {
      const { options } = descriptors[route.key]
      const selected = state.index === index
      const label = options.title ?? route.name
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label} testID={options.tabBarButtonTestID}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params)
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={({ pressed }) => [s.tab, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={s.icon}>
          {options.tabBarIcon?.({ focused: selected, color: selected ? theme.primary : theme.textSoft, size: 23 })}
          {options.tabBarBadge != null ? <View style={[s.badge, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.white, fontFamily: theme.fonts.semibold, fontSize: fontSize.caption }}>{options.tabBarBadge}</Text>
          </View> : null}
        </View>
        <Text style={[s.label, { color: selected ? theme.primary : theme.textSoft, fontFamily: rtl ? theme.fonts.arabic : selected ? theme.fonts.semibold : theme.fonts.regular }]}>{label}</Text>
        <View style={[s.indicator, { backgroundColor: selected ? theme.accent : 'transparent' }]} />
      </Pressable>
    })}
  </View>
}

const s = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  tab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', gap: spacing.xs, paddingHorizontal: 2 },
  icon: { alignItems: 'center', justifyContent: 'center', width: 30, height: 26 },
  label: { fontSize: fontSize.caption, textAlign: 'center' },
  indicator: { width: 26, height: 3, borderRadius: radius.pill, marginTop: spacing.xs },
  badge: { position: 'absolute', top: -6, right: -13, minWidth: 18, paddingHorizontal: spacing.xs, borderRadius: radius.pill, alignItems: 'center' },
})
