import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
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

export default function App() {
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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F4ED' }}>
        <ActivityIndicator color="#7BA67B" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <NavigationRoot />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
