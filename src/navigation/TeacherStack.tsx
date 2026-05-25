/**
 * Teacher navigation : NativeStack wrapping warm floating tabs.
 */

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  LayoutDashboard, CalendarDays, Users, BookOpenCheck, MessageSquare,
  type LucideIcon,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'
import TeacherDashboardScreen from '../screens/teacher/TeacherDashboardScreen'
import TeacherEdtScreen from '../screens/teacher/TeacherEdtScreen'
import TeacherClassesScreen from '../screens/teacher/TeacherClassesScreen'
import TeacherDevoirsScreen from '../screens/teacher/TeacherDevoirsScreen'
import TeacherMessagesScreen from '../screens/teacher/TeacherMessagesScreen'
import TeacherAttendanceScreen from '../screens/teacher/TeacherAttendanceScreen'
import TeacherClasseFolderScreen from '../screens/teacher/TeacherClasseFolderScreen'
import TeacherClasseElevesScreen from '../screens/teacher/TeacherClasseElevesScreen'
import TeacherNotesScreen from '../screens/teacher/TeacherNotesScreen'
import TeacherComposeScreen from '../screens/teacher/TeacherComposeScreen'
import TeacherStatsScreen from '../screens/teacher/TeacherStatsScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function TabIcon({
  Icon, color, focused, theme,
}: {
  Icon: LucideIcon
  color: string
  focused: boolean
  theme: any
}) {
  if (focused) {
    return (
      <LinearGradient
        colors={[theme.primarySurface, theme.greenSurface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconActive, { borderColor: theme.primaryBorder }]}
      >
        <Icon color={color} size={20} strokeWidth={1.8} />
        <View style={[styles.statusDot, { backgroundColor: theme.green }]} />
      </LinearGradient>
    )
  }
  return (
    <View style={styles.iconInactive}>
      <Icon color={color} size={20} strokeWidth={1.8} />
    </View>
  )
}

function TeacherTabs() {
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
        sceneStyle: {
          backgroundColor: theme.bg,
        },
        tabBarItemStyle: { minHeight: 46 },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: theme.fonts.medium,
          marginTop: 2,
        },
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
      <Stack.Screen name="TeacherDevoirsDetail" component={TeacherDevoirsScreen} />
      <Stack.Screen name="TeacherCompose" component={TeacherComposeScreen} />
      <Stack.Screen name="TeacherStats" component={TeacherStatsScreen} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  iconActive: {
    width: 42,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInactive: {
    width: 42,
    height: 34,
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
