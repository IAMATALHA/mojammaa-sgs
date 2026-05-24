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
  Icon, color, focused, theme, emphasized = false,
}: {
  Icon: LucideIcon
  color: string
  focused: boolean
  theme: any
  emphasized?: boolean
}) {
  if (emphasized) {
    return (
      <LinearGradient
        colors={focused ? [theme.accent, '#FFB066'] : [theme.primary, '#34557F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.centerIcon, theme.shadows.sm]}
      >
        <Icon color="#FFFFFF" size={22} strokeWidth={2} />
      </LinearGradient>
    )
  }

  if (focused) {
    return (
      <LinearGradient
        colors={[theme.primarySurface, theme.violetSurface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.iconActive, { borderColor: theme.primaryBorder }]}
      >
        <Icon color={color} size={20} strokeWidth={1.8} />
        <View style={[styles.statusDot, { backgroundColor: theme.accent }]} />
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
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopWidth: 0,
          minHeight: 78,
          height: 78,
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
  centerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
