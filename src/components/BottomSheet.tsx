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
import {
  Keyboard, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(height)
  const backdrop   = useSharedValue(0)
  // Hauteur du clavier, suivie à la main : le Modal est statusBarTranslucent,
  // donc Android ne le redimensionne PAS à l'ouverture du clavier (bug RN
  // connu) — sans ça, le bas de la feuille (champs, bouton Envoyer) reste
  // caché derrière le clavier.
  const keyboard = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.7 })
      backdrop.value   = withTiming(1, { duration: 220 })
    } else {
      // Réinit en position fermée : une fermeture directe (croix / envoi réussi)
      // ne passe pas par handleClose, donc sans ça la 2ᵉ ouverture n'anime plus.
      translateY.value = height
      backdrop.value   = 0
      keyboard.value   = 0
    }
  }, [visible, height])

  useEffect(() => {
    // iOS : will* (anime en même temps que le clavier) ; Android : seuls did* existent.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvt, e => {
      keyboard.value = withTiming(e.endCoordinates.height, { duration: Platform.OS === 'ios' ? (e.duration || 220) : 160 })
    })
    const hide = Keyboard.addListener(hideEvt, e => {
      keyboard.value = withTiming(0, { duration: Platform.OS === 'ios' ? (e?.duration || 220) : 160 })
    })
    return () => { show.remove(); hide.remove() }
  }, [])

  const handleClose = () => {
    backdrop.value   = withTiming(0, { duration: 200 })
    translateY.value = withTiming(height, { duration: 220 }, finished => {
      if (finished) runOnJS(onClose)()
    })
  }

  // Le clavier pousse la feuille via un padding bas animé ; la zone de contenu
  // se réduit d'autant (et devient défilable) pour que rien ne soit rogné.
  const basePadBottom = Math.max(insets.bottom, 14) + 14
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    paddingBottom: keyboard.value + basePadBottom,
  }))
  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: Math.max(200, height * maxHeightRatio - keyboard.value - insets.top),
  }))
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))

  if (!visible) return null

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.root}>
        {/* Clavier ouvert : le tap sur le fond ferme d'abord le clavier
            (sans perdre la saisie) ; sinon il ferme la feuille. */}
        <AnimatedPressable
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
          onPress={() => {
            if (Keyboard.isVisible()) { Keyboard.dismiss(); return }
            handleClose()
          }}
        />
        <Animated.View
          style={[styles.sheet, { backgroundColor: theme.card }, sheetStyle]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {/* keyboardShouldPersistTaps : un tap sur « Envoyer » pendant que le
              clavier est ouvert doit agir au 1er tap (pas fermer-le-clavier-puis-retaper). */}
          <Animated.ScrollView
            style={contentStyle}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Tap sur une zone neutre de la feuille → ferme le clavier
                (les boutons/champs enfants gardent la priorité). */}
            <Pressable accessible={false} onPress={Keyboard.dismiss}>
              {children}
            </Pressable>
          </Animated.ScrollView>
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
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    marginBottom: 14,
  },
})
