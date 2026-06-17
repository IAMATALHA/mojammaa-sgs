/**
 * AnimatedTabBar — barre d'onglets custom avec indicateur « pill » glissant.
 * La pastille navy glisse avec un ressort vers l'onglet actif pendant que
 * l'icône fait son pop (AnimatedTabIcon en mode bare par-dessus la pill).
 * Lit title / tabBarIcon / tabBarBadge depuis les options des écrans.
 */
import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../contexts/ThemeContext'
import { hexWithAlpha } from '../utils/format'

const PILL_W = 46
const PILL_H = 36
// La pill doit rester centrée derrière l'icône (40×34 rendue sous paddingTop 10).
const PILL_TOP = 9

export default function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [barWidth, setBarWidth] = useState(0)
  const pillX = useSharedValue(-PILL_W)
  const tabWidth = barWidth > 0 ? barWidth / state.routes.length : 0

  useEffect(() => {
    if (tabWidth === 0) return
    const target = state.index * tabWidth + tabWidth / 2 - PILL_W / 2
    if (pillX.value < 0) {
      pillX.value = target // premier layout : on se place sans animer
    } else {
      pillX.value = withSpring(target, { damping: 16, stiffness: 190, mass: 0.8 })
    }
  }, [state.index, tabWidth])

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }))

  return (
    <View
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        theme.shadows.md,
        {
          // Translucide : on devine le contenu qui défile derrière la barre.
          backgroundColor: hexWithAlpha(theme.card, 0.75),
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, 8),
          minHeight: 68 + Math.max(insets.bottom, 0),
        },
      ]}
    >
      {barWidth > 0 && (
        <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: theme.primary }, pillStyle]} />
      )}

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const focused = state.index === index
        const label = options.title ?? route.name
        const badge = options.tabBarBadge

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync()
            navigation.navigate(route.name)
          }
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            style={styles.item}
          >
            <View style={styles.iconWrap}>
              {options.tabBarIcon?.({
                focused,
                color: focused ? theme.white : theme.textSoft,
                size: 19,
              })}
              {badge != null && (
                <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                  <Text style={[styles.badgeText, { fontFamily: theme.fonts.semibold }]}>{String(badge)}</Text>
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: focused ? theme.primary : theme.textSoft, fontFamily: theme.fonts.semibold },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  pill: {
    position: 'absolute',
    top: PILL_TOP,
    left: 0,
    width: PILL_W,
    height: PILL_H,
    borderRadius: 16,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    minHeight: 46,
  },
  iconWrap: {
    width: 40,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
  },
  label: {
    fontSize: 9.5,
    marginTop: 2,
  },
})
