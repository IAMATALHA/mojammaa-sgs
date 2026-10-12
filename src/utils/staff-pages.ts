import { hasRight, type StaffRight } from './staff-rights'
import type { UserProfile } from '../types'
export const STAFF_PAGES: { key: string; rights: StaffRight[]; route?: string; path?: string }[] = [
  { key: 'attendance', rights: ['absences.saisir'], route: 'StaffLessons' },
  { key: 'absences', rights: ['absences.voir'], path: '/absences' },
  { key: 'declarations', rights: ['absences.saisir'], route: 'StaffDeclarations' },
  { key: 'pickup', rights: ['sortie'], route: 'StaffPickup' },
  { key: 'prayer', rights: ['priere'], route: 'StaffPrayerClasses' },
  { key: 'messages', rights: ['messages.boite', 'messages.envoyer'], route: 'StaffMessages' },
  { key: 'appointments', rights: ['rendezvous'], route: 'StaffAppointments' },
  { key: 'students', rights: ['eleves.voir'], path: '/eleves' },
  { key: 'behavior', rights: ['comportements.voir'], path: '/comportements' },
  { key: 'grades', rights: ['notes.voir'], path: '/notes' },
  { key: 'schedule', rights: ['edt.voir'], path: '/horaires' },
  { key: 'teachers', rights: ['enseignants.modifier'], path: '/enseignants' },
  { key: 'parentCodes', rights: ['codes.parents'], path: '/invitations-parents' },
  { key: 'teacherCodes', rights: ['codes.professeurs'], path: '/codes-professeurs' },
  { key: 'accounts', rights: ['comptes.gerer'], path: '/personnel' },
]
export function staffPages(profile: UserProfile | null) {
  return profile?.role === 'staff' ? STAFF_PAGES.filter(page => page.rights.some(right => hasRight(profile, right))) : []
}
