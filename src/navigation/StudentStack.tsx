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
import { useTranslation } from 'react-i18next'
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
  statusDot: {
    position: 'absolute',
    top: 6,
    end: 8,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
})
