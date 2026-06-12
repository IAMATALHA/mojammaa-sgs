/**
 * AnimatedTabIcon — icône de barre d'onglets avec « pop » au focus.
 * Reprend la pastille active du projet (fond primary + icône blanche) et
 * ajoute un ressort : léger overshoot quand l'onglet devient actif.
 * Remplace les TabIcon locaux des navigators (Admin/Student/Teacher).
 */
import React, { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming,
} from 'react-native-reanimated'
import { type LucideIcon } from 'lucide-react-native'
import { type Theme } from '../contexts/ThemeContext'

interface Props {
  Icon:    LucideIcon
  color:   string
  focused: boolean
  theme:   Theme
  /** Sans fond : la pastille active est dessinée ailleurs (AnimatedTabBar). */
  bare?:   boolean
}

export default function AnimatedTabIcon({ Icon, color, focused, theme, bare }: Props) {
  const scale = useSharedValue(focused ? 1 : 0.9)

  useEffect(() => {
    if (focused) {
      // petit overshoot puis stabilisation → effet « pop »
      scale.value = withSequence(
        withTiming(1.18, { duration: 130 }),
        withSpring(1, { damping: 12, stiffness: 260 }),
      )
    } else {
      scale.value = withSpring(0.9, { damping: 14, stiffness: 220 })
    }
  }, [focused])

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View
      style={[
        styles.pill,
        focused && !bare && { backgroundColor: theme.primary },
        animStyle,
      ]}
    >
      <Icon color={bare ? color : focused ? '#FFFFFF' : color} size={19} strokeWidth={focused ? 1.9 : 1.8} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pill: {
    width: 40,
    height: 34,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
