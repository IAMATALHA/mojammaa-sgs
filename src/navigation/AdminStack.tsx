import { AdminAppointmentsScreen } from '../screens/shared/appointments-screen'
import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { House, ChartNoAxesColumnIncreasing, CalendarDays, MessageSquare, School } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ThemeProvider, useTheme } from '../contexts/ThemeContext'
import { useUnreadMessagesCount } from '../hooks/useUnreadMessagesCount'
import { adminHomeCopy } from '../utils/admin-home-copy'
import AdminTabBar from '../components/dashboard/admin-tab-bar'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
import AdminSchoolScreen from '../screens/admin/admin-school-screen'
import AdminMessagesScreen from '../screens/admin/AdminMessagesScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminCalendarScreen from '../screens/admin/AdminCalendarScreen'
import AdminAbsencesScreen from '../screens/admin/AdminAbsencesScreen'
import AdminRollCallsScreen from '../screens/admin/AdminRollCallsScreen'
import AdminDevoirsScreen from '../screens/admin/AdminDevoirsScreen'
import AdminUsersScreen from '../screens/admin/AdminUsersScreen'
import DevoirDetailScreen from '../screens/shared/DevoirDetailScreen'
import AdminMatiereDetailScreen from '../screens/admin/AdminMatiereDetailScreen'
import AdminScopeStudentsScreen from '../screens/admin/AdminScopeStudentsScreen'
import AdminStudentFileScreen from '../screens/admin/AdminStudentFileScreen'
import AdminAttendanceStatsScreen from '../screens/admin/AdminAttendanceStatsScreen'
import AdminScopeHomeworkScreen from '../screens/admin/AdminScopeHomeworkScreen'
import type { AdminTabsParamList, AdminStackParamList } from './types'

const Tab = createBottomTabNavigator<AdminTabsParamList>()
const Stack = createNativeStackNavigator<AdminStackParamList>()

function AdminTabs() {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const copy = adminHomeCopy(i18n.language)
  // One subscription supplies both the navigation badge and the home action row.
  const unread = useUnreadMessagesCount()

  return (
    <Tab.Navigator tabBar={props => <AdminTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}>
      <Tab.Screen name="AdminDashboard"
        options={{ title: copy.home, tabBarIcon: ({ color, size, focused }) => <House color={color} size={size} fill={focused ? color : 'none'} strokeWidth={1.7} /> }}>
        {() => <AdminDashboardScreen unreadMessages={unread} />}
      </Tab.Screen>
      <Tab.Screen name="AdminSchoolTab" component={AdminSchoolScreen}
        options={{ title: copy.school, tabBarIcon: ({ color, size }) => <School color={color} size={size} strokeWidth={1.7} /> }} />
      <Tab.Screen name="AdminCalendarTab" component={AdminCalendarScreen}
        options={{ title: copy.calendar, tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} strokeWidth={1.7} /> }} />
      <Tab.Screen name="AdminMessages" component={AdminMessagesScreen}
        options={{
          title: copy.messages,
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} strokeWidth={1.7} />,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }} />
      <Tab.Screen name="AdminStatsTab" component={AdminStatsScreen}
        options={{ title: copy.analyses, tabBarIcon: ({ color, size }) => <ChartNoAxesColumnIncreasing color={color} size={size} strokeWidth={1.7} /> }} />
    </Tab.Navigator>
  )
}

function AdminClassDirectoryScreen() {
  return <AdminStatsScreen classesOnly />
}

export default function AdminStack() {
  return (
    <ThemeProvider variant="admin">
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
        <Stack.Screen name="AdminClasses" component={AdminClassDirectoryScreen} />
        <Stack.Screen name="AdminCalendar" component={AdminCalendarScreen} />
        <Stack.Screen name="AdminAbsences" component={AdminAbsencesScreen} />
        <Stack.Screen name="AdminRollCalls" component={AdminRollCallsScreen} />
        <Stack.Screen name="AdminDevoirs" component={AdminDevoirsScreen} />
        <Stack.Screen name="AdminDevoirView" component={DevoirDetailScreen} />
        <Stack.Screen name="AdminMatiereDetail" component={AdminMatiereDetailScreen} />
        <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
        <Stack.Screen name="AdminScopeStudents" component={AdminScopeStudentsScreen} />
        <Stack.Screen name="AdminStudentFile" component={AdminStudentFileScreen} />
        <Stack.Screen name="AdminAttendanceStats" component={AdminAttendanceStatsScreen} />
        <Stack.Screen name="AdminScopeHomework" component={AdminScopeHomeworkScreen} />
        <Stack.Screen name="AdminAppointments" component={AdminAppointmentsScreen} />
      </Stack.Navigator>
    </ThemeProvider>
  )
}
