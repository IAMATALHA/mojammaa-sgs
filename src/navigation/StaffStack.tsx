import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { hasRight } from '../utils/staff-rights'
import StaffHomeScreen from '../screens/staff/staff-home-screen'
import { StaffLessonsScreen, StaffAttendanceScreen, StaffPrayerClassesScreen, StaffDeclarationsScreen } from '../screens/staff/staff-operations-screen'
import StaffMessagesScreen from '../screens/staff/staff-messages-screen'
import AdminPickupScreen from '../screens/admin/admin-pickup-screen'
import TeacherPrayerScreen from '../screens/teacher/TeacherPrayerScreen'
import { AdminAppointmentsScreen } from '../screens/shared/appointments-screen'
export type StaffLesson = { teacherUid: string; lessonKey: string; classe: string; seance: string; date: string }
export type StaffStackParamList = {
  StaffHome: undefined; StaffLessons: undefined; StaffAttendance: StaffLesson; StaffPickup: undefined;
  StaffPrayerClasses: undefined; StaffPrayer: { classe: string }; StaffMessages: { messageId?: string } | undefined;
  StaffAppointments: undefined; StaffDeclarations: undefined;
}
const Stack = createNativeStackNavigator<StaffStackParamList>()
export default function StaffStack() {
  const { profile } = useAuth(), can = (right: Parameters<typeof hasRight>[1]) => hasRight(profile || undefined, right)
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="StaffHome" component={StaffHomeScreen} />
    {can('absences.saisir') && <Stack.Group><Stack.Screen name="StaffLessons" component={StaffLessonsScreen} /><Stack.Screen name="StaffAttendance" component={StaffAttendanceScreen} /><Stack.Screen name="StaffDeclarations" component={StaffDeclarationsScreen} /></Stack.Group>}
    {can('sortie') && <Stack.Screen name="StaffPickup" component={AdminPickupScreen} />}
    {can('priere') && <Stack.Group><Stack.Screen name="StaffPrayerClasses" component={StaffPrayerClassesScreen} /><Stack.Screen name="StaffPrayer" component={TeacherPrayerScreen} /></Stack.Group>}
    {(can('messages.boite') || can('messages.envoyer')) && <Stack.Screen name="StaffMessages" component={StaffMessagesScreen} />}
    {can('rendezvous') && <Stack.Screen name="StaffAppointments" component={AdminAppointmentsScreen} />}
  </Stack.Navigator>
}
