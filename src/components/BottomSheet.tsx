/**
 * BottomSheet — feuille modale qui monte avec un ressort + backdrop qui fond.
 * Entrée : spring depuis le bas. Sortie : glisse vers le bas + fade, PUIS
 * appelle onClose (animation de fermeture propre). Tap sur le backdrop ferme.
 *
 *   <BottomSheet visible={!!detail} onClose={() => setDetail(null)}>
 *     …contenu…
 *   </BottomSheet>
 */
import React, { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated'
import { useTheme } from '../contexts/ThemeContext'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

interface Props {
  visible:          boolean
  onClose:          () => void
  children:         React.ReactNode
  maxHeightRatio?:  number   // hauteur max relative à l'écran, défaut 0.9
}

export default function BottomSheet({ visible, onClose, children, maxHeightRatio = 0.9 }: Props) {
  const theme = useTheme()
  const { height } = useWindowDimensions()
  const translateY = useSharedValue(height)
  const backdrop   = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.7 })
      backdrop.value   = withTiming(1, { duration: 220 })
    } else {
      // Réinit en position fermée : une fermeture directe (croix / envoi réussi)
      // ne passe pas par handleClose, donc sans ça la 2ᵉ ouverture n'anime plus.
      translateY.value = height
      backdrop.value   = 0
    }
  }, [visible, height])

  const handleClose = () => {
    backdrop.value   = withTiming(0, { duration: 200 })
    translateY.value = withTiming(height, { duration: 220 }, finished => {
      if (finished) runOnJS(onClose)()
    })
  }

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))

  if (!visible) return null

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.root}>
        <AnimatedPressable style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} onPress={handleClose} />
        <Animated.View
          style={[styles.sheet, { backgroundColor: theme.card, maxHeight: height * maxHeightRatio }, sheetStyle]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    marginBottom: 14,
  },
})
