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
  Icon, color, focused, theme, emphasized = false,
}: { Icon: LucideIcon; color: string; focused: boolean; theme: any; emphasized?: boolean }) {
  if (emphasized) {
    return (
      <LinearGradient
        colors={focused ? [theme.accent, '#FFB066'] : [theme.primary, '#34557F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.centerIcon, theme.shadows.sm]}
      >
        <Icon color="#FFFFFF" size={20} strokeWidth={2} />
      </LinearGradient>
    )
  }

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
          backgroundColor: 'rgba(255,255,255,0.97)',
          borderTopWidth: 0,
          minHeight: 82,
          height: 82,
          paddingTop: 10,
          paddingBottom: 12,
          borderRadius: 26,
          shadowColor: '#1D3557',
          shadowOpacity: 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
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
    borderRadius: 16,
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
  centerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    end: 8,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
})
