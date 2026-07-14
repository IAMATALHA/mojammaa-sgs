import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { BusFront, Settings, type LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import DriverDashboardScreen from '../screens/driver/driver-dashboard-screen'
import DriverSettingsScreen from '../screens/driver/driver-settings-screen'
import type { DriverStackParamList } from './types'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import AnimatedTabIcon from '../components/AnimatedTabIcon'
import AnimatedTabBar from '../components/AnimatedTabBar'

const Tab = createBottomTabNavigator<DriverStackParamList>()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} bare />
}

/** Espace chauffeur : tournée opérationnelle + réglages/multi-espace. */
export default function DriverStack() {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <Tab.Navigator
      tabBar={props => <AnimatedTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}
    >
      <Tab.Screen
        name="DriverHome"
        component={DriverDashboardScreen}
        options={{
          title: t('tabs.pickup'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={BusFront} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="DriverSettings"
        component={DriverSettingsScreen}
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings} color={color} focused={focused} theme={theme} />,
        }}
      />
    </Tab.Navigator>
  )
}
