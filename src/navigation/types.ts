/**
 * Param lists typés pour toute la navigation.
 *
 * Trois piles racine montées selon le rôle (cf. AuthContext) :
 *   AuthStack · TeacherStack · StudentStack · AdminStack
 *
 * Chaque pile native enveloppe un Tab.Navigator (les onglets) + des écrans
 * détail poussés. Les écrans onglet → écran détail naviguent « vers le haut »
 * (React Navigation résout sur le parent) ; côté TS on type donc avec le
 * param list de la pile native, ou un CompositeNavigationProp quand un écran
 * cible à la fois des onglets ET des écrans poussés.
 */
import type { NavigatorScreenParams, CompositeNavigationProp, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

// ── Auth ───────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined
}

// ── Teacher ────────────────────────────────────────────────────────────────
export type TeacherTabsParamList = {
  TeacherHome:     undefined
  TeacherEdt:      undefined
  TeacherClasses:  undefined
  TeacherDevoirs:  undefined
  TeacherMessages: { messageId?: string } | undefined
  TeacherSettings: undefined
}

export type TeacherStackParamList = {
  TeacherTabs:          NavigatorScreenParams<TeacherTabsParamList> | undefined
  TeacherAttendance:    { classe: string; seance?: string }
  TeacherClasseFolder:  { classe: string; seance?: string; openAttendance?: boolean }
  TeacherClasseEleves:  { classe: string }
  TeacherNotes:         { classe?: string }
  TeacherComportement:  { classe: string }
  TeacherRessources:    { classe: string }
  TeacherDevoirsDetail: { classe?: string }
  TeacherStats:         undefined
}

/** Tableau de bord prof : onglet (TeacherHome) pouvant cibler onglets + pile. */
export type TeacherDashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<TeacherTabsParamList>,
  NativeStackNavigationProp<TeacherStackParamList>
>

// ── Student / Parent ───────────────────────────────────────────────────────
export type StudentHomeStackParamList = {
  StudentHome:         undefined
  StudentComportement: undefined
  StudentRessources:   undefined
  StudentPerformance:  undefined
  StudentEdt:          undefined
}

export type StudentTabsParamList = {
  HomeTab:          NavigatorScreenParams<StudentHomeStackParamList> | undefined
  StudentDevoirs:   undefined
  StudentNotes:     undefined
  StudentAbsences:  undefined
  StudentMessages:  { messageId?: string } | undefined
  StudentSettings:  undefined
}

/** Tableau de bord parent : écran de HomeTab ciblant la pile Accueil + onglets. */
export type StudentDashboardNav = CompositeNavigationProp<
  NativeStackNavigationProp<StudentHomeStackParamList>,
  BottomTabNavigationProp<StudentTabsParamList>
>

// ── Admin ──────────────────────────────────────────────────────────────────
export type AdminTabsParamList = {
  AdminDashboard:    undefined
  AdminStatsTab:     undefined
  AdminCalendarTab:  undefined
  AdminMessages:     { messageId?: string } | undefined
  AdminSettings:     undefined
}

export type AdminStackParamList = {
  AdminTabs:      NavigatorScreenParams<AdminTabsParamList> | undefined
  AdminStats:     undefined
  AdminEdt:       undefined
  AdminCalendar:  undefined
  AdminAbsences:  undefined
  AdminDevoirs:   undefined
  AdminUsers:     undefined
}

/** Tableau de bord admin : onglet (AdminDashboard) ciblant onglets + pile. */
export type AdminDashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabsParamList>,
  NativeStackNavigationProp<AdminStackParamList>
>

// ── Helpers route ──────────────────────────────────────────────────────────
export type TeacherRoute<T extends keyof TeacherStackParamList> = RouteProp<TeacherStackParamList, T>
export type TeacherTabRoute<T extends keyof TeacherTabsParamList> = RouteProp<TeacherTabsParamList, T>
export type StudentTabRoute<T extends keyof StudentTabsParamList> = RouteProp<StudentTabsParamList, T>
export type AdminTabRoute<T extends keyof AdminTabsParamList> = RouteProp<AdminTabsParamList, T>
