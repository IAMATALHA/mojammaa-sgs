/**
 * Parent / student navigation.
 *
 * Structure (pilote « menu partout + animations d'ouverture ») :
 *   Tab.Navigator (racine — la barre vit ICI, donc visible sur TOUTES les pages)
 *   ├─ HomeTab = NativeStack
 *   │    ├─ StudentHome (dashboard)
 *   │    └─ Comportement / Ressources / Performance / EDT  (poussés → animés + swipe-back)
 *   ├─ StudentDevoirs, StudentNotes, StudentAbsences, StudentMessages, StudentSettings
 *
 * Les écrans détail étant *dans* l'onglet Accueil, la tab bar reste affichée
 * pendant qu'ils sont poussés (push natif), au lieu d'être recouverte.
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
import ParentPerformanceScreen from '../screens/student/ParentPerformanceScreen'
import ParentEdtScreen from '../screens/student/ParentEdtScreen'
import DevoirDetailScreen from '../screens/shared/DevoirDetailScreen'
import type { StudentTabsParamList, StudentHomeStackParamList, StudentDevoirsStackParamList } from './types'

const Tab = createBottomTabNavigator<StudentTabsParamList>()
const HomeStackNav = createNativeStackNavigator<StudentHomeStackParamList>()
const DevoirsStackNav = createNativeStackNavigator<StudentDevoirsStackParamList>()

function TabIcon(props: { Icon: LucideIcon; color: string; focused: boolean; theme: Theme }) {
  return <AnimatedTabIcon {...props} bare />
}

/**
 * Pile de l'onglet Accueil : le dashboard + tous les écrans détail accessibles
 * depuis lui (quick actions, carte enfant, comportement…). Poussés ici, ils
 * conservent la tab bar visible.
 */
function HomeStack() {
  return (
    <HomeStackNav.Navigator
      screenOptions={{
        headerShown: false,
        // Apparition instantanée (comme une bascule d'onglet) + pas de swipe-back :
        // les écrans détail se comportent comme les autres pages. Retour = bouton ‹.
        animation: 'none',
        gestureEnabled: false,
      }}
    >
      <HomeStackNav.Screen name="StudentHome" component={ParentDashboardScreen} />
      <HomeStackNav.Screen name="StudentComportement" component={ParentComportementScreen} />
      <HomeStackNav.Screen name="StudentRessources" component={ParentRessourcesScreen} />
      <HomeStackNav.Screen name="StudentPerformance" component={ParentPerformanceScreen} />
      <HomeStackNav.Screen name="StudentEdt" component={ParentEdtScreen} />
    </HomeStackNav.Navigator>
  )
}

/** Onglet Devoirs : liste + détail PLEIN ÉCRAN (même pilotage que HomeStack). */
function DevoirsStack() {
  return (
    <DevoirsStackNav.Navigator screenOptions={{ headerShown: false, animation: 'none', gestureEnabled: false }}>
      <DevoirsStackNav.Screen name="StudentDevoirsList" component={ParentDevoirsScreen} />
      <DevoirsStackNav.Screen name="StudentDevoirView" component={DevoirDetailScreen} />
    </DevoirsStackNav.Navigator>
  )
}

export default function StudentStack() {
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
        name="HomeTab"
        component={HomeStack}
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} theme={theme} />,
        }}
      />
      <Tab.Screen
        name="StudentDevoirs"
        component={DevoirsStack}
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
