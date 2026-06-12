/**
 * Parent / student navigation : NativeStack wrapping the floating tabs
 * (même structure que TeacherStack — les écrans de détail hors tabs
 * vivent dans le stack racine).
 */
import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import {
  LayoutDashboard, BookOpen, FileText, CalendarX, MessageSquare, Settings,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import { useUnreadMessagesCount } from '../hooks/useUnreadMessagesCount'
import AnimatedTabIcon from '../components/AnimatedTabIcon'
import AnimatedTabBar from '../components/AnimatedTabBar'
import ParentDashboardScreen from '../screens/student/ParentDashboardScreen'
import ParentDevoirsScreen from '../screens/student/ParentDevoirsScreen'
import ParentNotesScreen from '../screens/student/ParentNotesScreen'
import ParentAbsencesScreen from '../screens/student/ParentAbsencesScreen'
import ParentMessagesScreen from '../screens/student/ParentMessagesScreen'
import ParentSettingsScreen from '../screens/student/ParentSettingsScreen'
import ParentComportementScreen from '../screens/student/ParentComportementScreen'
import ParentRessourcesScreen from '../screens/student/ParentRessourcesScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} bare />
}

function StudentTabs() {
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
        name="StudentHome"
        component={ParentDashboardScreen}
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentDevoirs"
        component={ParentDevoirsScreen}
        options={{
          title: t('tabs.homework'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={BookOpen} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentNotes"
        component={ParentNotesScreen}
        options={{
          title: t('tabs.grades'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={FileText} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentAbsences"
        component={ParentAbsencesScreen}
        options={{
          title: t('tabs.absences'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarX} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentMessages"
        component={ParentMessagesScreen}
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageSquare} color={color} focused={focused} theme={theme} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tab.Screen
        name="StudentSettings"
        component={ParentSettingsScreen}
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings} color={color} focused={focused} theme={theme} />,
        }}
      />
    </Tab.Navigator>
  )
}

export default function StudentStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StudentTabs" component={StudentTabs} />
      <Stack.Screen name="StudentComportement" component={ParentComportementScreen} />
      <Stack.Screen name="StudentRessources" component={ParentRessourcesScreen} />
    </Stack.Navigator>
  )
}
