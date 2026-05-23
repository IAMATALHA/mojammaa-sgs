import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  LayoutDashboard, CalendarDays, Users, BookOpenCheck, MessageSquare,
} from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import TeacherDashboardScreen from '../screens/teacher/TeacherDashboardScreen'
import TeacherEdtScreen      from '../screens/teacher/TeacherEdtScreen'
import TeacherClassesScreen  from '../screens/teacher/TeacherClassesScreen'
import TeacherDevoirsScreen  from '../screens/teacher/TeacherDevoirsScreen'
import TeacherMessagesScreen from '../screens/teacher/TeacherMessagesScreen'

const Tab = createBottomTabNavigator()

export default function TeacherStack() {
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
        name="TeacherHome"
        component={TeacherDashboardScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="TeacherEdt"
        component={TeacherEdtScreen}
        options={{
          title: 'Horaires',
          tabBarIcon: ({ color }) => <CalendarDays color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="TeacherClasses"
        component={TeacherClassesScreen}
        options={{
          title: 'Classes',
          tabBarIcon: ({ color }) => <Users color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="TeacherDevoirs"
        component={TeacherDevoirsScreen}
        options={{
          title: 'Devoirs',
          tabBarIcon: ({ color }) => <BookOpenCheck color={color} size={22} strokeWidth={2} />,
        }}
      />
      <Tab.Screen
        name="TeacherMessages"
        component={TeacherMessagesScreen}
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={22} strokeWidth={2} />,
        }}
      />
    </Tab.Navigator>
  )
}
