/**
 * Teacher navigation : NativeStack wrapping warm floating tabs.
 */

import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  LayoutDashboard, CalendarDays, Users, BookOpenCheck, MessageSquare, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import { useUnreadMessagesCount } from '../hooks/useUnreadMessagesCount'
import AnimatedTabIcon from '../components/AnimatedTabIcon'
import AnimatedTabBar from '../components/AnimatedTabBar'
import TeacherDashboardScreen from '../screens/teacher/TeacherDashboardScreen'
import TeacherEdtScreen from '../screens/teacher/TeacherEdtScreen'
import TeacherClassesScreen from '../screens/teacher/TeacherClassesScreen'
import TeacherDevoirsScreen from '../screens/teacher/TeacherDevoirsScreen'
import TeacherMessagesScreen from '../screens/teacher/TeacherMessagesScreen'
import TeacherAttendanceScreen from '../screens/teacher/TeacherAttendanceScreen'
import TeacherClasseFolderScreen from '../screens/teacher/TeacherClasseFolderScreen'
import TeacherClasseElevesScreen from '../screens/teacher/TeacherClasseElevesScreen'
import TeacherNotesScreen from '../screens/teacher/TeacherNotesScreen'
import TeacherComportementScreen from '../screens/teacher/TeacherComportementScreen'
import TeacherRessourcesScreen from '../screens/teacher/TeacherRessourcesScreen'
import TeacherStatsScreen from '../screens/teacher/TeacherStatsScreen'
import TeacherSettingsScreen from '../screens/teacher/TeacherSettingsScreen'
import type { TeacherTabsParamList, TeacherStackParamList } from './types'

const Tab = createBottomTabNavigator<TeacherTabsParamList>()
const Stack = createNativeStackNavigator<TeacherStackParamList>()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} bare />
}

function TeacherTabs() {
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
        name="TeacherHome"
        component={TeacherDashboardScreen}
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="TeacherEdt"
        component={TeacherEdtScreen}
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarDays} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="TeacherClasses"
        component={TeacherClassesScreen}
        options={{
          title: t('tabs.classes'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Users} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="TeacherDevoirs"
        component={TeacherDevoirsScreen}
        options={{
          title: t('tabs.homework'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={BookOpenCheck} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="TeacherMessages"
        component={TeacherMessagesScreen}
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageSquare} color={color} focused={focused} theme={theme} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tab.Screen
        name="TeacherSettings"
        component={TeacherSettingsScreen}
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings} color={color} focused={focused} theme={theme} />,
        }}
      />
    </Tab.Navigator>
  )
}

export default function TeacherStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TeacherTabs" component={TeacherTabs} />
      <Stack.Screen name="TeacherAttendance" component={TeacherAttendanceScreen} />
      <Stack.Screen name="TeacherClasseFolder" component={TeacherClasseFolderScreen} />
      <Stack.Screen name="TeacherClasseEleves" component={TeacherClasseElevesScreen} />
      <Stack.Screen name="TeacherNotes" component={TeacherNotesScreen} />
      <Stack.Screen name="TeacherComportement" component={TeacherComportementScreen} />
      <Stack.Screen name="TeacherRessources" component={TeacherRessourcesScreen} />
      <Stack.Screen name="TeacherDevoirsDetail" component={TeacherDevoirsScreen} />
      <Stack.Screen name="TeacherStats" component={TeacherStatsScreen} />
    </Stack.Navigator>
  )
}
