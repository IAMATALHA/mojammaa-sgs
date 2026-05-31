import React from 'react'
import { StyleSheet, Image, Text } from 'react-native'
import { MotiView } from 'moti'
import { palette } from '../theme/designTokens'

/**
 * Animated splash overlay shown while fonts / i18n load (and for a short
 * minimum so the animation is always visible). Its background matches the
 * native splash `backgroundColor` in app.json for a seamless hand-off.
 *
 * No custom fontFamily here on purpose — app fonts may still be loading
 * while this is on screen, so we rely on the system font.
 */
export default function AnimatedSplash() {
  return (
    <MotiView
      style={styles.fill}
      from={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'timing', duration: 450 }}
    >
      {/* Logo: spring in, then a gentle infinite pulse */}
      <MotiView
        from={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 13, stiffness: 130, delay: 100 }}
      >
        <MotiView
          from={{ scale: 1 }}
          animate={{ scale: 1.04 }}
          transition={{ type: 'timing', duration: 1100, loop: true, repeatReverse: true, delay: 700 }}
        >
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </MotiView>
      </MotiView>

      {/* App name fades up under the logo */}
      <MotiView
        from={{ opacity: 0, translateY: 14 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 550, delay: 450 }}
      >
        <Text style={styles.title}>Mojammaa Connect</Text>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
    gap: 22,
  },
  logo: { width: 148, height: 148 },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
})
