import React from 'react'
import { StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  LayoutDashboard, Users, GraduationCap, CalendarDays, Megaphone, BarChart3, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
import AdminUsersScreen from '../screens/admin/AdminUsersScreen'
import AdminClassesScreen from '../screens/admin/AdminClassesScreen'
import AdminEdtScreen from '../screens/admin/AdminEdtScreen'
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'

const Tab = createBottomTabNavigator()

function TabIcon({
  Icon, color, focused, theme,
}: { Icon: LucideIcon; color: string; focused: boolean; theme: any }) {
  if (focused) {
    return (
      <LinearGradient
        colors={[theme.paperWarm, theme.brandYellowSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconActive, { borderColor: 'rgba(252, 191, 73, 0.30)' }]}
      >
        <Icon color={color} size={19} strokeWidth={1.8} />
        <View style={[styles.statusDot, { backgroundColor: theme.brandYellow }]} />
      </LinearGradient>
    )
  }

  return (
    <View style={styles.iconInactive}>
      <Icon color={color} size={19} strokeWidth={1.8} />
    </View>
  )
}

export default function AdminStack() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSoft,
        tabBarStyle: {
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: Math.max(insets.bottom, 8),
          backgroundColor: 'rgba(255,253,248,0.97)',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(29, 53, 87, 0.08)',
          minHeight: 76,
          height: 76,
          paddingTop: 9,
          paddingBottom: 10,
          borderRadius: 24,
          shadowColor: '#1D3557',
          shadowOpacity: 0.10,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        sceneStyle: {
          backgroundColor: theme.bg,
        },
        tabBarItemStyle: { minHeight: 46 },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontFamily: theme.fonts.medium,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ title: 'Accueil', tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminUsers"
        component={AdminUsersScreen}
        options={{ title: 'Users', tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminClasses"
        component={AdminClassesScreen}
        options={{ title: 'Classes', tabBarIcon: ({ color, focused }) => <TabIcon Icon={GraduationCap} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminEdt"
        component={AdminEdtScreen}
        options={{ title: 'EDT', tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarDays} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminBroadcast"
        component={AdminBroadcastScreen}
        options={{ title: 'Annonces', tabBarIcon: ({ color, focused }) => <TabIcon Icon={Megaphone} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminStats"
        component={AdminStatsScreen}
        options={{ title: 'Stats', tabBarIcon: ({ color, focused }) => <TabIcon Icon={BarChart3} color={color} focused={focused} theme={theme} /> }}
      />
      <Tab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{ title: 'Réglages', tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings} color={color} focused={focused} theme={theme} /> }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  iconActive: {
    width: 40,
    height: 32,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInactive: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    bottom: 3,
    width: 18,
    height: 3,
    borderRadius: 2,
  },
})
