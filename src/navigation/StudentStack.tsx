/**
 * Parent / student navigation with a modern floating bottom bar.
 */
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  LayoutDashboard, BookOpen, FileText, CalendarX, MessageSquare,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import ParentDashboardScreen from '../screens/student/ParentDashboardScreen'
import ParentDevoirsScreen from '../screens/student/ParentDevoirsScreen'
import ParentNotesScreen from '../screens/student/ParentNotesScreen'
import ParentAbsencesScreen from '../screens/student/ParentAbsencesScreen'
import ParentMessagesScreen from '../screens/student/ParentMessagesScreen'

const Tab = createBottomTabNavigator()

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
        colors={[theme.paperWarm, theme.brandYellowSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconActive, { borderColor: 'rgba(252, 191, 73, 0.30)' }]}
      >
        <Icon color={color} size={20} strokeWidth={1.8} />
        <View style={[styles.statusDot, { backgroundColor: theme.brandYellow }]} />
      </LinearGradient>
    )
  }

  return (
    <View style={styles.iconInactive}>
      <Icon color={color} size={20} strokeWidth={1.8} />
    </View>
  )
}

export default function StudentStack() {
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
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10),
          backgroundColor: 'rgba(255,253,248,0.97)',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(29, 53, 87, 0.08)',
          minHeight: 74,
          height: 74,
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
        tabBarItemStyle: {
          minHeight: 46,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: theme.fonts.medium,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="StudentHome"
        component={ParentDashboardScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentDevoirs"
        component={ParentDevoirsScreen}
        options={{
          title: 'Devoirs',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={BookOpen} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentNotes"
        component={ParentNotesScreen}
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={FileText} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentAbsences"
        component={ParentAbsencesScreen}
        options={{
          title: 'Absences',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={CalendarX} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentMessages"
        component={ParentMessagesScreen}
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageSquare} color={color} focused={focused} theme={theme} />,
        }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  iconActive: {
    width: 42,
    height: 32,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInactive: {
    width: 42,
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
