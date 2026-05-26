import React from 'react'
import { StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  LayoutDashboard, Users, GraduationCap, Megaphone, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
import AdminUsersScreen from '../screens/admin/AdminUsersScreen'
import AdminClassesScreen from '../screens/admin/AdminClassesScreen'
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen'
import AdminMessagesScreen from '../screens/admin/AdminMessagesScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminEdtScreen from '../screens/admin/AdminEdtScreen'
import AdminCalendarScreen from '../screens/admin/AdminCalendarScreen'
import AdminAbsencesScreen from '../screens/admin/AdminAbsencesScreen'
import AdminDevoirsScreen from '../screens/admin/AdminDevoirsScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function TabIcon({
  Icon, color, focused, theme,
}: { Icon: LucideIcon; color: string; focused: boolean; theme: any }) {
  if (focused) {
    return (
      <LinearGradient
        colors={[theme.primarySurface, theme.roseSurface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconActive, { borderColor: theme.primaryBorder }]}
      >
        <Icon color={color} size={19} strokeWidth={1.8} />
        <View style={[styles.statusDot, { backgroundColor: theme.accent }]} />
      </LinearGradient>
    )
  }
  return (
    <View style={styles.iconInactive}>
      <Icon color={color} size={19} strokeWidth={1.8} />
    </View>
  )
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
          shadowOpacity: 0.08,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        },
        sceneStyle: { backgroundColor: theme.bg },
        tabBarItemStyle: { minHeight: 46 },
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: theme.fonts.medium, marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: t('tabs.home'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminUsers"
        component={AdminUsersScreen}
        options={{ title: t('tabs.users'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminClasses"
        component={AdminClassesScreen}
        options={{ title: t('tabs.classes'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={GraduationCap} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminMessages"
        component={AdminMessagesScreen}
        options={{ title: t('tabs.messages'), tabBarIcon: ({ color, focused }) => <TabIcon Icon={Megaphone} color={color} focused={focused} theme={theme} /> }}
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
      <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} />
      <Stack.Screen name="AdminAbsences" component={AdminAbsencesScreen} />
      <Stack.Screen name="AdminDevoirs" component={AdminDevoirsScreen} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  iconActive: {
    width: 40, height: 32, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  iconInactive: {
    width: 40, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute', top: 6, end: 8,
    width: 5, height: 5, borderRadius: 3,
  },
})
