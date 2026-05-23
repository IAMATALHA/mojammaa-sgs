/**
 * Bouton qui rétrécit légèrement quand on appuie + haptique léger.
 * C'est LE pattern qui rend une app "polished" : feedback tactile + visuel
 * sur chaque interaction.
 *
 * Usage :
 *   <PressableScale onPress={...} style={...}>
 *     <Text>...</Text>
 *   </PressableScale>
 */
import React from 'react'
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

interface Props extends Omit<PressableProps, 'style'> {
  children:    React.ReactNode
  style?:      StyleProp<ViewStyle>
  scaleDown?:  number   // par défaut 0.96
  haptic?:     boolean  // par défaut true
}

export default function PressableScale({
  children, style, scaleDown = 0.96, haptic = true, onPressIn, onPressOut, ...rest
}: Props) {
  const scale   = useSharedValue(1)
  const opacity = useSharedValue(1)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }))

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.value   = withSpring(scaleDown, { damping: 15, stiffness: 300 })
        opacity.value = withTiming(0.85, { duration: 100 })
        if (haptic) Haptics.selectionAsync().catch(() => {})
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value   = withSpring(1, { damping: 15, stiffness: 300 })
        opacity.value = withTiming(1, { duration: 150 })
        onPressOut?.(e)
      }}
    >
      <Animated.View style={[style, animStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}
