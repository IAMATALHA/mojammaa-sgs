const fr = {
  eyebrow: 'ESPACE ADMINISTRATION', title: 'L’école, aujourd’hui.',
  refresh: 'Actualiser', updated: 'Actualisé à', loading: 'Chargement du bilan…',
  error: 'Le bilan n’a pas pu être actualisé.', stale: 'Les chiffres affichés datent de la dernière actualisation.', retry: 'Réessayer',
  overview: 'Le point à cette heure', absents: 'Élèves absents', recorded: 'Parmi les élèves pointés',
  completed: 'Classes à jour', missing: 'Classes à vérifier', expected: 'classes attendues',
  noAttendance: 'Aucun appel enregistré pour le moment.', partial: 'Les appels sont incomplets : ce bilan reste partiel.',
  coverage: 'Suivi des appels', coverageHint: 'Une classe est à jour quand tous ses appels attendus à cette heure sont enregistrés.',
  pendingTitle: 'À vérifier maintenant', pendingHint: 'Les appels des cours à venir ne sont pas comptés.',
  missingCall: 'appel non enregistré', missingCalls: 'appels non enregistrés', allCalls: 'Voir tous les appels',
  completeTitle: 'Les appels sont à jour', completeHint: 'Tous les appels attendus à cette heure sont enregistrés.',
  closedTitle: 'Pas de cours aujourd’hui', closedHint: 'Le suivi des appels est suspendu pour cette journée.',
  unplannedTitle: 'Aucun cours renseigné aujourd’hui', unplannedHint: 'Le suivi des classes n’est pas disponible pour cette journée.',
  upcomingTitle: 'La journée n’a pas encore commencé', upcomingHint: 'Aucun appel n’est attendu à cette heure.',
  shortcuts: 'Accès directs', students: 'Rechercher un élève', studentsHint: 'Ouvrir son dossier',
  teachers: 'Enseignants', teachersHint: 'Consulter les coordonnées', message: 'Écrire un message',
  homework: 'Devoirs', homeworkHint: 'Consulter les devoirs', event: 'À venir', directoryError: 'Impossible d’ouvrir les dossiers élèves. Réessayez.',
}
const en: typeof fr = {
  eyebrow: 'ADMINISTRATION', title: 'School, today.', refresh: 'Refresh', updated: 'Updated at', loading: 'Loading today’s overview…',
  error: 'The overview could not be refreshed.', stale: 'Figures are from the last successful refresh.', retry: 'Try again',
  overview: 'At this hour', absents: 'Absent students', recorded: 'Among recorded students', completed: 'Classes up to date',
  missing: 'Classes to check', expected: 'expected classes', noAttendance: 'No attendance recorded yet.', partial: 'Attendance is incomplete: these figures are partial.',
  coverage: 'Attendance coverage', coverageHint: 'A class is up to date when every roll call due by this hour is recorded.',
  pendingTitle: 'Check now', pendingHint: 'Future lessons are not counted.', missingCall: 'unrecorded roll call', missingCalls: 'unrecorded roll calls',
  allCalls: 'View all roll calls', completeTitle: 'Roll calls are up to date', completeHint: 'Every roll call due by this hour is recorded.',
  closedTitle: 'No lessons today', closedHint: 'Attendance tracking is paused for today.',
  unplannedTitle: 'No lessons entered for today', unplannedHint: 'Class tracking is unavailable for today.',
  upcomingTitle: 'The school day has not started', upcomingHint: 'No roll calls are due at this hour.',
  shortcuts: 'Quick access', students: 'Find a student', studentsHint: 'Open their file', teachers: 'Teachers', teachersHint: 'Find contact details',
  message: 'Write a message', homework: 'Homework', homeworkHint: 'View homework', event: 'Coming up', directoryError: 'Could not open student files. Please try again.',
}
const ar: typeof fr = {
  eyebrow: 'فضاء الإدارة', title: 'المدرسة، اليوم.', refresh: 'تحديث', updated: 'آخر تحديث', loading: 'جارٍ تحميل ملخص اليوم…',
  error: 'تعذر تحديث الملخص.', stale: 'الأرقام المعروضة تعود إلى آخر تحديث ناجح.', retry: 'إعادة المحاولة',
  overview: 'الوضع حتى الآن', absents: 'التلاميذ الغائبون', recorded: 'من بين التلاميذ المسجّل حضورهم', completed: 'أقسام مكتملة',
  missing: 'أقسام للمراجعة', expected: 'أقسام منتظرة', noAttendance: 'لم يُسجّل أي حضور بعد.', partial: 'تسجيل الحضور غير مكتمل؛ هذه الأرقام جزئية.',
  coverage: 'متابعة تسجيل الحضور', coverageHint: 'يكتمل القسم عندما تُسجّل جميع نداءاته المستحقة حتى هذه الساعة.',
  pendingTitle: 'للمراجعة الآن', pendingHint: 'لا تُحتسب الحصص التي لم تبدأ بعد.', missingCall: 'نداء غير مسجّل', missingCalls: 'نداءات غير مسجّلة',
  allCalls: 'عرض جميع النداءات', completeTitle: 'تسجيلات الحضور مكتملة', completeHint: 'جميع النداءات المستحقة حتى الآن مسجّلة.',
  closedTitle: 'لا توجد دراسة اليوم', closedHint: 'متابعة الحضور متوقفة لهذا اليوم.',
  unplannedTitle: 'لا توجد حصص مدخلة لهذا اليوم', unplannedHint: 'متابعة الأقسام غير متاحة لهذا اليوم.',
  upcomingTitle: 'لم يبدأ اليوم الدراسي بعد', upcomingHint: 'لا يوجد نداء مستحق حتى هذه الساعة.',
  shortcuts: 'وصول سريع', students: 'البحث عن تلميذ', studentsHint: 'فتح ملفه', teachers: 'الأساتذة', teachersHint: 'عرض معلومات الاتصال',
  message: 'كتابة رسالة', homework: 'الواجبات', homeworkHint: 'عرض الواجبات', event: 'قريباً', directoryError: 'تعذر فتح ملفات التلاميذ. أعد المحاولة.',
}
export function adminHomeCopy(language: string) {
  return language.startsWith('ar') ? ar : language.startsWith('en') ? en : fr
}
