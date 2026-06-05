import React from 'react'
import { StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  LayoutDashboard, TrendingUp, CalendarDays, MessageSquare, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import AnimatedTabIcon from '../components/AnimatedTabIcon'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
// AdminClassesScreen merged into AdminStatsScreen
import AdminMessagesScreen from '../screens/admin/AdminMessagesScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminEdtScreen from '../screens/admin/AdminEdtScreen'
import AdminCalendarScreen from '../screens/admin/AdminCalendarScreen'
import AdminAbsencesScreen from '../screens/admin/AdminAbsencesScreen'
import AdminDevoirsScreen from '../screens/admin/AdminDevoirsScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} />
}

function AdminTabs() {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSoft,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 10,
          minHeight: 68 + Math.max(insets.bottom, 0),
          shadowColor: '#1D3557',
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -3 },
          elevation: 6,
        },
        sceneStyle: { backgroundColor: theme.bg },
        tabBarItemStyle: { minHeight: 46 },
        tabBarLabelStyle: { fontSize: 9.5, fontFamily: theme.fonts.semibold, marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: t('tabs.home'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminStatsTab"
        component={AdminStatsScreen}
        options={{ title: t('tabs.stats'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={TrendingUp} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminCalendarTab"
        component={AdminCalendarScreen}
        options={{ title: t('tabs.calendar'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarDays} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminMessages"
        component={AdminMessagesScreen}
        options={{ title: t('tabs.messages'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageSquare} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{ title: t('tabs.settings'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings} color={color} focused={focused} theme={theme} /> }}
      />
    </Tab.Navigator>
  )
}

export default function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="AdminStats" component={AdminStatsScreen} />
      <Stack.Screen name="AdminEdt" component={AdminEdtScreen} />
      <Stack.Screen name="AdminCalendar" component={AdminCalendarScreen} />
      <Stack.Screen name="AdminAbsences" component={AdminAbsencesScreen} />
      <Stack.Screen name="AdminDevoirs" component={AdminDevoirsScreen} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  iconActive: {
    width: 40, height: 32, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  iconInactive: {
    width: 40, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
})
