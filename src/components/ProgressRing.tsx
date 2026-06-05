/**
 * ProgressRing — anneau de progression animé (SVG + Reanimated).
 * Le tracé se remplit de 0 → progress (easeOutCubic) et un compteur animé
 * affiche le pourcentage au centre. Idéal pour un taux (présence, devoirs).
 *
 *   <ProgressRing progress={0.93} color={theme.success} trackColor={theme.border} />
 */
import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated'
import AnimatedCounter from './AnimatedCounter'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface Props {
  progress:     number   // 0..1
  size?:        number   // diamètre px, défaut 96
  strokeWidth?: number   // épaisseur, défaut 9
  color:        string   // couleur du tracé rempli
  trackColor:   string   // couleur de la piste
  duration?:    number   // ms, défaut 900
  showPercent?: boolean  // % animé au centre, défaut true
  textColor?:   string
}

export default function ProgressRing({
  progress, size = 96, strokeWidth = 9, color, trackColor,
  duration = 900, showPercent = true, textColor,
}: Props) {
  const clamped = Math.max(0, Math.min(1, progress || 0))
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r

  const sv = useSharedValue(0)
  useEffect(() => {
    sv.value = withTiming(clamped, { duration, easing: Easing.out(Easing.cubic) })
  }, [clamped, duration])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - sv.value),
  }))

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={trackColor} strokeWidth={strokeWidth} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {showPercent && (
        <Text style={{ fontWeight: '800', fontSize: size * 0.26, color: textColor || color }}>
          <AnimatedCounter value={Math.round(clamped * 100)} duration={duration} />
          <Text style={{ fontSize: size * 0.14, fontWeight: '700' }}>%</Text>
        </Text>
      )}
    </View>
  )
}
