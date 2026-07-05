import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  LayoutDashboard, TrendingUp, CalendarDays, MessageSquare, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import { useUnreadMessagesCount } from '../hooks/useUnreadMessagesCount'
import AnimatedTabIcon from '../components/AnimatedTabIcon'
import AnimatedTabBar from '../components/AnimatedTabBar'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
// AdminClassesScreen merged into AdminStatsScreen
import AdminMessagesScreen from '../screens/admin/AdminMessagesScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminEdtScreen from '../screens/admin/AdminEdtScreen'
import AdminCalendarScreen from '../screens/admin/AdminCalendarScreen'
import AdminAbsencesScreen from '../screens/admin/AdminAbsencesScreen'
import AdminRollCallsScreen from '../screens/admin/AdminRollCallsScreen'
import AdminDevoirsScreen from '../screens/admin/AdminDevoirsScreen'
import AdminUsersScreen from '../screens/admin/AdminUsersScreen'
import DevoirDetailScreen from '../screens/shared/DevoirDetailScreen'
import AdminMatiereDetailScreen from '../screens/admin/AdminMatiereDetailScreen'
import type { AdminTabsParamList, AdminStackParamList } from './types'

const Tab = createBottomTabNavigator<AdminTabsParamList>()
const Stack = createNativeStackNavigator<AdminStackParamList>()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} bare />
}

function AdminTabs() {
  const theme = useTheme()
  const { t } = useTranslation()
  const unread = useUnreadMessagesCount()

  return (
    <Tab.Navigator
      tabBar={props => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.bg },
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
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageSquare} color={color} focused={focused} theme={theme} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
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
      <Stack.Screen name="AdminRollCalls" component={AdminRollCallsScreen} />
      <Stack.Screen name="AdminDevoirs" component={AdminDevoirsScreen} />
      <Stack.Screen name="AdminDevoirView" component={DevoirDetailScreen} />
      <Stack.Screen name="AdminMatiereDetail" component={AdminMatiereDetailScreen} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
    </Stack.Navigator>
  )
}
