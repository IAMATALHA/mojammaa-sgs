import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LayoutDashboard, Users, GraduationCap, CalendarDays, Megaphone, BarChart3, Settings } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen'
import AdminUsersScreen from '../screens/admin/AdminUsersScreen'
import AdminClassesScreen from '../screens/admin/AdminClassesScreen'
import AdminEdtScreen from '../screens/admin/AdminEdtScreen'
import AdminBroadcastScreen from '../screens/admin/AdminBroadcastScreen'
import AdminStatsScreen from '../screens/admin/AdminStatsScreen'
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen'

const Tab = createBottomTabNavigator()

export default function AdminStack() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSoft,
        tabBarStyle: { 
          backgroundColor: theme.white, 
          borderTopColor: theme.border,
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 8), // Dynamically add space for Android buttons
          paddingTop: 8,
          minHeight: 60 + Math.max(insets.bottom, 0),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 4 },
      }}
    >
      <Tab.Screen 
        name="AdminDashboard"  
        component={AdminDashboardScreen}  
        options={{ title: 'Accueil', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminUsers"      
        component={AdminUsersScreen}      
        options={{ title: 'Users', tabBarIcon: ({ color, size }) => <Users color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminClasses"    
        component={AdminClassesScreen}    
        options={{ title: 'Classes', tabBarIcon: ({ color, size }) => <GraduationCap color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminEdt"        
        component={AdminEdtScreen}        
        options={{ title: 'EDT', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminBroadcast"  
        component={AdminBroadcastScreen}  
        options={{ title: 'Annonces', tabBarIcon: ({ color, size }) => <Megaphone color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminStats"      
        component={AdminStatsScreen}      
        options={{ title: 'Stats', tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={24} strokeWidth={2} /> }} 
      />
      <Tab.Screen 
        name="AdminSettings"   
        component={AdminSettingsScreen}   
        options={{ title: 'Réglages', tabBarIcon: ({ color, size }) => <Settings color={color} size={24} strokeWidth={2} /> }} 
      />
    </Tab.Navigator>
  )
}
