import React, { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AnimatePresence } from 'moti'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter'
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins'
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes'
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo'
import { AuthProvider } from './src/contexts/AuthContext'
import { ThemeProvider } from './src/contexts/ThemeContext'
import NavigationRoot from './src/navigation/NavigationRoot'
import { initI18n } from './src/i18n'
import AnimatedSplash from './src/components/AnimatedSplash'

export default function App() {
  const [i18nReady, setI18nReady] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)

  useEffect(() => {
    initI18n().then(() => setI18nReady(true))
  }, [])

  // Keep the splash up at least this long so the animation is always seen.
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1900)
    return () => clearTimeout(t)
  }, [])

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    GreatVibes_400Regular,
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
  })

  const ready = fontsLoaded && i18nReady
  const showSplash = !ready || !minElapsed

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {ready && (
          <AuthProvider>
            <ThemeProvider>
              <StatusBar style="auto" />
              <NavigationRoot />
            </ThemeProvider>
          </AuthProvider>
        )}
        <AnimatePresence>
          {showSplash && <AnimatedSplash key="splash" />}
        </AnimatePresence>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
