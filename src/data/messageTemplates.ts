import { palette } from '../theme/designTokens'

export interface TemplateVariable {
  key: string
  label_fr: string
  label_ar: string
  label_en: string
  type: 'number' | 'text' | 'select' | 'date'
  placeholder?: string
  options?: string[]
}

export interface MessageTemplate {
  id: string
  categorie: string
  icon: string
  color: string
  target: 'parents' | 'teachers' | 'all'
  title_fr: string
  title_ar: string
  title_en: string
  template_fr: string
  template_ar: string
  template_en: string
  variables: TemplateVariable[]
}

const MATIERES = [
  'Mathématiques', 'Français', 'Langue Arabe',
  'Anglais', 'SVT', 'Physique-Chimie',
  'Histoire-Géo', 'Éducation Islamique',
  'EPS', 'Informatique',
]

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'devoir_non_rendu',
    categorie: 'Devoir',
    icon: '📚',
    color: palette.brandGoldDark,
    target: 'parents',
    title_fr: 'Devoir non rendu',
    title_ar: 'واجب لم يُسلَّم',
    title_en: 'Homework not submitted',
    template_fr: "Madame/Monsieur, votre enfant {elevePrenom} n'a pas rendu le devoir de {matiere} : exercice {numero} page {page}. Merci de vérifier avec lui/elle.",
    template_ar: 'السيد/ة الكريم/ة، لم يُسلِّم ابنكم/ابنتكم {elevePrenom} واجب {matiere} : تمرين {numero} صفحة {page}. نرجو منكم المتابعة.',
    template_en: "Dear parent, your child {elevePrenom} did not submit the {matiere} homework: exercise {numero} page {page}. Please check with them.",
    variables: [
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
      { key: 'numero', label_fr: 'N° exercice', label_ar: 'رقم التمرين', label_en: 'Exercise #', type: 'number', placeholder: '5' },
      { key: 'page', label_fr: 'Page', label_ar: 'الصفحة', label_en: 'Page', type: 'number', placeholder: '17' },
    ],
  },
  {
    id: 'retard_repete',
    categorie: 'Présence',
    icon: '⏰',
    color: palette.brandGoldDark,
    target: 'parents',
    title_fr: 'Retard répété',
    title_ar: 'تأخر متكرر',
    title_en: 'Repeated lateness',
    template_fr: 'Madame/Monsieur, votre enfant {elevePrenom} a été en retard {nbFois} fois cette semaine en {matiere}. Ce comportement perturbe le bon déroulement du cours.',
    template_ar: 'السيد/ة الكريم/ة، تأخّر ابنكم/ابنتكم {elevePrenom} {nbFois} مرات هذا الأسبوع في حصة {matiere}. هذا يؤثر سلباً على سير الدرس.',
    template_en: 'Dear parent, your child {elevePrenom} has been late {nbFois} times this week in {matiere}. This disrupts the class.',
    variables: [
      { key: 'nbFois', label_fr: 'Nombre de fois', label_ar: 'عدد المرات', label_en: 'Number of times', type: 'number', placeholder: '3' },
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
    ],
  },
  {
    id: 'comportement',
    categorie: 'Comportement',
    icon: '⚠️',
    color: palette.brandRed,
    target: 'parents',
    title_fr: 'Comportement en classe',
    title_ar: 'سلوك داخل الفصل',
    title_en: 'Classroom behavior',
    template_fr: 'Madame/Monsieur, votre enfant {elevePrenom} a eu un comportement inapproprié en cours de {matiere} le {date}. Nous vous demandons de sensibiliser votre enfant au respect des règles de classe.',
    template_ar: 'السيد/ة الكريم/ة، أظهر ابنكم/ابنتكم {elevePrenom} سلوكاً غير لائق في حصة {matiere} بتاريخ {date}. نطلب منكم توعية طفلكم باحترام قواعد الفصل.',
    template_en: 'Dear parent, your child {elevePrenom} had inappropriate behavior in {matiere} class on {date}. Please talk to them about respecting classroom rules.',
    variables: [
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
      { key: 'date', label_fr: 'Date', label_ar: 'التاريخ', label_en: 'Date', type: 'date' },
    ],
  },
  {
    id: 'resultats_insuffisants',
    categorie: 'Notes',
    icon: '📉',
    color: palette.brandRed,
    target: 'parents',
    title_fr: 'Résultats insuffisants',
    title_ar: 'نتائج دون المستوى',
    title_en: 'Poor results',
    template_fr: 'Madame/Monsieur, votre enfant {elevePrenom} a obtenu {note}/20 au contrôle de {matiere}. La moyenne de la classe est {moyenne}/20. Un travail supplémentaire est nécessaire.',
    template_ar: 'السيد/ة الكريم/ة، حصل ابنكم/ابنتكم {elevePrenom} على {note}/20 في فرض {matiere}. معدل القسم هو {moyenne}/20. يستوجب الأمر مزيداً من العمل.',
    template_en: 'Dear parent, your child {elevePrenom} scored {note}/20 on the {matiere} test. Class average is {moyenne}/20. Additional work is needed.',
    variables: [
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
      { key: 'note', label_fr: 'Note obtenue', label_ar: 'النقطة المحصّلة', label_en: 'Score', type: 'number', placeholder: '8' },
      { key: 'moyenne', label_fr: 'Moyenne classe', label_ar: 'معدل القسم', label_en: 'Class avg', type: 'number', placeholder: '12' },
    ],
  },
  {
    id: 'felicitations',
    categorie: 'Félicitations',
    icon: '⭐',
    color: palette.success,
    target: 'parents',
    title_fr: 'Félicitations — Progrès remarquable',
    title_ar: 'تهانينا — تقدم ملحوظ',
    title_en: 'Congratulations — Remarkable progress',
    template_fr: "Madame/Monsieur, nous tenons à vous informer que votre enfant {elevePrenom} a réalisé d'excellents progrès en {matiere}. Sa note est passée de {ancienneNote}/20 à {nouvelleNote}/20. Bravo !",
    template_ar: 'السيد/ة الكريم/ة، يسعدنا إعلامكم بأن ابنكم/ابنتكم {elevePrenom} أحرز تقدماً رائعاً في {matiere}. ارتفعت نقطته/نقطتها من {ancienneNote}/20 إلى {nouvelleNote}/20. مبروك !',
    template_en: "Dear parent, we are pleased to inform you that your child {elevePrenom} has made excellent progress in {matiere}. Their score went from {ancienneNote}/20 to {nouvelleNote}/20. Congratulations!",
    variables: [
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
      { key: 'ancienneNote', label_fr: 'Ancienne note', label_ar: 'النقطة السابقة', label_en: 'Previous score', type: 'number', placeholder: '10' },
      { key: 'nouvelleNote', label_fr: 'Nouvelle note', label_ar: 'النقطة الجديدة', label_en: 'New score', type: 'number', placeholder: '16' },
    ],
  },
  {
    id: 'convocation',
    categorie: 'Réunion',
    icon: '📅',
    color: palette.brandInk,
    target: 'parents',
    title_fr: 'Convocation — Réunion parents',
    title_ar: 'استدعاء — اجتماع أولياء الأمور',
    title_en: 'Summons — Parent meeting',
    template_fr: 'Madame/Monsieur, vous êtes convoqué(e) à une réunion concernant votre enfant {elevePrenom} le {date} à {heure}. Merci de confirmer votre présence.',
    template_ar: 'السيد/ة الكريم/ة، يُرجى حضوركم لاجتماع بخصوص ابنكم/ابنتكم {elevePrenom} بتاريخ {date} الساعة {heure}. نرجو تأكيد حضوركم.',
    template_en: 'Dear parent, you are invited to a meeting about your child {elevePrenom} on {date} at {heure}. Please confirm your attendance.',
    variables: [
      { key: 'date', label_fr: 'Date', label_ar: 'التاريخ', label_en: 'Date', type: 'date' },
      { key: 'heure', label_fr: 'Heure', label_ar: 'الساعة', label_en: 'Time', type: 'text', placeholder: '10:00' },
    ],
  },

  // ── Admin → Prof templates ──────────────────────────────────────────────

  {
    id: 'rappel_appel',
    categorie: 'Présence',
    icon: '📋',
    color: palette.brandOrangeDark,
    target: 'teachers',
    title_fr: "Rappel — Appel non effectué",
    title_ar: 'تذكير — لم يتم تسجيل الحضور',
    title_en: 'Reminder — Attendance not recorded',
    template_fr: "Bonjour, nous remarquons que l'appel n'a pas encore été effectué pour vos classes aujourd'hui. Merci de le faire dès que possible.",
    template_ar: 'مرحباً، نلاحظ أن تسجيل الحضور لم يتم بعد لأقسامكم اليوم. يرجى القيام بذلك في أقرب وقت.',
    template_en: "Hello, we noticed that attendance has not been recorded for your classes today. Please do so as soon as possible.",
    variables: [],
  },
  {
    id: 'reunion_profs',
    categorie: 'Réunion',
    icon: '🤝',
    color: palette.brandInk,
    target: 'teachers',
    title_fr: 'Convocation — Réunion des enseignants',
    title_ar: 'استدعاء — اجتماع الأساتذة',
    title_en: 'Summons — Teachers meeting',
    template_fr: "Cher(e) collègue, vous êtes convoqué(e) à une réunion des enseignants le {date} à {heure}. Ordre du jour : {sujet}. Votre présence est obligatoire.",
    template_ar: 'زميلنا/زميلتنا الكريم/ة، أنتم مدعوون لحضور اجتماع الأساتذة بتاريخ {date} الساعة {heure}. جدول الأعمال: {sujet}. حضوركم إلزامي.',
    template_en: "Dear colleague, you are invited to a teachers meeting on {date} at {heure}. Agenda: {sujet}. Your attendance is mandatory.",
    variables: [
      { key: 'date', label_fr: 'Date', label_ar: 'التاريخ', label_en: 'Date', type: 'date' },
      { key: 'heure', label_fr: 'Heure', label_ar: 'الساعة', label_en: 'Time', type: 'text', placeholder: '10:00' },
      { key: 'sujet', label_fr: 'Ordre du jour', label_ar: 'جدول الأعمال', label_en: 'Agenda', type: 'text', placeholder: 'Bilan du semestre' },
    ],
  },
  {
    id: 'observation_classe',
    categorie: 'Pédagogie',
    icon: '👁️',
    color: palette.brandRed,
    target: 'teachers',
    title_fr: "Observation en classe",
    title_ar: 'ملاحظة داخل الفصل',
    title_en: 'Classroom observation',
    template_fr: "Cher(e) collègue, suite à une observation en classe {classe} le {date}, nous souhaitons échanger avec vous. Merci de vous présenter au bureau de la direction.",
    template_ar: 'زميلنا/زميلتنا الكريم/ة، بعد ملاحظة في قسم {classe} بتاريخ {date}، نودّ التحدث معكم. يرجى الحضور إلى مكتب الإدارة.',
    template_en: "Dear colleague, following an observation in class {classe} on {date}, we would like to discuss with you. Please come to the administration office.",
    variables: [
      { key: 'classe', label_fr: 'Classe', label_ar: 'القسم', label_en: 'Class', type: 'text', placeholder: '1APIC-3' },
      { key: 'date', label_fr: 'Date', label_ar: 'التاريخ', label_en: 'Date', type: 'date' },
    ],
  },
  {
    id: 'felicitations_prof',
    categorie: 'Félicitations',
    icon: '🏆',
    color: palette.success,
    target: 'teachers',
    title_fr: "Félicitations — Travail remarquable",
    title_ar: 'تهانينا — عمل متميز',
    title_en: 'Congratulations — Outstanding work',
    template_fr: "Cher(e) collègue, la direction tient à vous féliciter pour votre excellent travail en {matiere}. Les résultats de vos élèves en témoignent. Continuez ainsi !",
    template_ar: 'زميلنا/زميلتنا الكريم/ة، تودّ الإدارة تهنئتكم على عملكم المتميز في مادة {matiere}. نتائج تلاميذكم خير دليل. واصلوا هذا التألق!',
    template_en: "Dear colleague, the administration congratulates you for your outstanding work in {matiere}. Your students' results speak for themselves. Keep it up!",
    variables: [
      { key: 'matiere', label_fr: 'Matière', label_ar: 'المادة', label_en: 'Subject', type: 'select', options: MATIERES },
    ],
  },
]

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`)
}
