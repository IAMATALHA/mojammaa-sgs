/**
 * Stack pour les parents/élèves.
 * "Home" est désormais le nouveau ParentDashboardScreen (style SaaS).
 */
import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  LayoutDashboard, BookOpen, FileText, CalendarX, MessageSquare,
} from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import ParentDashboardScreen from '../screens/student/ParentDashboardScreen'
import ParentDevoirsScreen   from '../screens/student/ParentDevoirsScreen'
import ParentNotesScreen     from '../screens/student/ParentNotesScreen'
import ParentAbsencesScreen  from '../screens/student/ParentAbsencesScreen'
import ParentMessagesScreen  from '../screens/student/ParentMessagesScreen'

const Tab = createBottomTabNavigator()

export default function StudentStack() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   theme.primary,
        tabBarInactiveTintColor: theme.textSoft,
        tabBarStyle: {
          backgroundColor: theme.white,
          borderTopColor:  theme.border,
          borderTopWidth:  1,
          paddingBottom:   Math.max(insets.bottom, 8),
          paddingTop:      8,
          minHeight:       60 + Math.max(insets.bottom, 0),
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontFamily: theme.fonts.semibold,
          marginTop:  4,
        },
      }}
    >
      <Tab.Screen
        name="StudentHome"
        component={ParentDashboardScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="StudentDevoirs"
        component={ParentDevoirsScreen}
        options={{
          title: 'Devoirs',
          tabBarIcon: ({ color }) => <BookOpen color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="StudentNotes"
        component={ParentNotesScreen}
        options={{
          title: 'Notes',
          tabBarIcon: ({ color }) => <FileText color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="StudentAbsences"
        component={ParentAbsencesScreen}
        options={{
          title: 'Absences',
          tabBarIcon: ({ color }) => <CalendarX color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="StudentMessages"
        component={ParentMessagesScreen}
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={22} strokeWidth={2} />,
        }}
      />
    </Tab.Navigator>
  )
}
