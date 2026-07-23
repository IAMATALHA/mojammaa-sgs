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
import type { AppliedScope, StudentProgressionQuery, StudentSegment } from '../types/stats'

// ── Auth ───────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined
}

// ── Partagé ────────────────────────────────────────────────────────────────
/** Devoir sérialisé passé à l'écran de détail (page entière, tous rôles). */
export type DevoirDetailParams = {
  devoir: {
    id: string
    titre: string
    description?: string
    type?: string
    classeId?: string
    teacherId?: string
    teacherNom?: string
    dateLimite?: string
    eleveId?: string
    eleveNom?: string
    parentUid?: string
    attachments?: { url: string; name: string; mime: string; size?: number }[]
  }
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
  TeacherAttendance:    { lessonKey: string }
  TeacherClasseFolder:  { classe: string; openAttendance?: boolean }
  TeacherClasseEleves:  { classe: string }
  TeacherNotes:         { classe?: string }
  TeacherComportement:  { classe: string }
  TeacherPrayer:        { classe: string }
  TeacherRessources:    { classe: string }
  TeacherDevoirsDetail: { classe?: string }
  TeacherDevoirView:    DevoirDetailParams
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
  StudentPickup:       undefined
  StudentComportement: undefined
  StudentRessources:   undefined
  StudentPerformance:  undefined
  StudentEdt:          undefined
}

/** Onglet Devoirs = mini-pile : liste + détail plein écran (tab bar visible). */
export type StudentDevoirsStackParamList = {
  StudentDevoirsList: undefined
  StudentDevoirView:  DevoirDetailParams
}

export type StudentTabsParamList = {
  HomeTab:          NavigatorScreenParams<StudentHomeStackParamList> | undefined
  StudentDevoirs:   NavigatorScreenParams<StudentDevoirsStackParamList> | undefined
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
  AdminEdt:       undefined
  AdminCalendar:  undefined
  AdminAbsences:  undefined
  AdminRollCalls: undefined
  AdminDevoirs:   undefined
  AdminDevoirView: DevoirDetailParams
  AdminMatiereDetail: { matiere?: string; classe?: string; scope?: AppliedScope } | undefined
  AdminUsers:     undefined
  // Drill-downs des statistiques. Chacun reçoit le périmètre RENVOYÉ par le
  // serveur, jamais celui demandé par le client : c'est ce qui garantit que le
  // total de l'écran est exactement le chiffre de la tuile qui l'a ouvert.
  AdminScopeStudents:   {
    scope: AppliedScope
    segment: StudentSegment
    band?: string
    side?: 'below' | 'passing'
    progression?: StudentProgressionQuery
  }
  AdminAttendanceStats: { scope: AppliedScope }
  AdminStudentFile:     { eleveId: string; scope: AppliedScope }
  AdminScopeHomework:   { scope: AppliedScope }
  AdminPickup:    undefined
  AdminPrayer:    undefined
}

/** Tableau de bord admin : onglet (AdminDashboard) ciblant onglets + pile. */
export type AdminDashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabsParamList>,
  NativeStackNavigationProp<AdminStackParamList>
>

// ── Chauffeur / Smart Pickup ─────────────────────────────────────────────
export type DriverStackParamList = {
  DriverHome: undefined
  DriverSettings: undefined
}

// ── Helpers route ──────────────────────────────────────────────────────────
export type TeacherRoute<T extends keyof TeacherStackParamList> = RouteProp<TeacherStackParamList, T>
export type TeacherTabRoute<T extends keyof TeacherTabsParamList> = RouteProp<TeacherTabsParamList, T>
export type StudentTabRoute<T extends keyof StudentTabsParamList> = RouteProp<StudentTabsParamList, T>
export type AdminTabRoute<T extends keyof AdminTabsParamList> = RouteProp<AdminTabsParamList, T>
