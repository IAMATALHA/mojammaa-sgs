import React from 'react'
import { StyleSheet, Image, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { palette } from '../theme/designTokens'

/**
 * Animated splash overlay shown while fonts / i18n load (and for a short
 * minimum so the animation is always visible). Its background matches the
 * native splash `backgroundColor` in app.json for a seamless hand-off, and
 * the logo is rendered at the same on-screen size as the native splash image.
 *
 * No custom fontFamily here on purpose — app fonts may still be loading
 * while this is on screen, so we rely on the system font.
 */

const easeOut = Easing.out(Easing.cubic)

const DOT_COLORS = [palette.navy, palette.coral, palette.yellow]

export default function AnimatedSplash() {
  return (
    <MotiView
      style={styles.fill}
      from={{ opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ type: 'timing', duration: 420, easing: easeOut }}
    >
      <LinearGradient
        colors={[palette.surface, palette.bg, palette.surfaceAlt]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        {/* Soft gold glow breathing behind the logo */}
        <MotiView
          style={styles.glow}
          from={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1.12 }}
          transition={{
            type: 'timing',
            duration: 1600,
            loop: true,
            repeatReverse: true,
            easing: Easing.inOut(Easing.sin),
          }}
        />

        {/* Logo settles in — no bounce, just a clean ease */}
        <MotiView
          from={{ opacity: 0, scale: 0.92, translateY: 10 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 600, delay: 80, easing: easeOut }}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </MotiView>

        {/* Thin gold rule, then the wordmark rises under it */}
        <MotiView
          style={styles.rule}
          from={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ type: 'timing', duration: 450, delay: 480, easing: easeOut }}
        />
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 560, easing: easeOut }}
        >
          <Text style={styles.title}>MOJAMMAA CONNECT</Text>
        </MotiView>
      </View>

      {/* Minimal loader pinned near the bottom */}
      <View style={styles.dots}>
        {DOT_COLORS.map((color, i) => (
          <MotiView
            key={color}
            style={[styles.dot, { backgroundColor: color }]}
            from={{ opacity: 0.25, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: 'timing',
              duration: 480,
              delay: 900 + i * 160,
              loop: true,
              repeatReverse: true,
              easing: Easing.inOut(Easing.sin),
            }}
          />
        ))}
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: palette.yellowSoft,
  },
  logo: { width: 165, height: 131 },
  rule: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.yellow,
  },
  title: {
    color: palette.navy,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
  },
  dots: {
    position: 'absolute',
    bottom: 88,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
