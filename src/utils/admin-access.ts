/**
 * Accès des comptes gérés par l'administration depuis l'app : invitations
 * professeurs, codes d'activation parents, liens de réinitialisation.
 * Fonctions pures (messages, liens, états) — testées seules
 * (tests/services/adminAccess.test.mjs).
 *
 * Les messages reprennent ceux du site (mojammaa-admin : TeacherAccessModal,
 * ParentInvitations, Comptes) : un même professeur ou parent reçoit le même
 * texte, quel que soit l'outil de l'établissement. Les boutons PRÉPARENT un
 * message (WhatsApp, partage) : rien n'est envoyé automatiquement.
 *
 * Format validé par Youssef (10 et 11 oct. 2026) : arabe d'abord, puis
 * français, brefs, sans emoji. Le lien d'activation vient en premier, seul sur
 * sa ligne : il ouvre le site avec le code déjà rempli, rien à recopier. Le
 * code reste à la fin, seul sur sa ligne (en gras dans WhatsApp), pour
 * l'application (« Activer mon compte », « Ajouter un enfant »). On dit
 * « l'établissement » / « المؤسسة », jamais « l'école » / « المدرسة ».
 */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.youssefatalha.mojammaasgs'

/** Activation parent sur le site : le code voyage après « # », jamais envoyé au serveur. */
export function parentActivationUrl(code: string): string {
  return `https://mojammaa.com/parents/activer#${code}`
}

/** Numéro pour wa.me : indicatif sans « + » (même règle que le site). */
export function whatsAppPhone(phone: string): string {
  const clean = phone.replace(/[\s\-.()]/g, '')
  if (clean.startsWith('+')) return clean.slice(1)
  if (clean.startsWith('00')) return clean.slice(2)
  if (clean.startsWith('212')) return clean
  if (clean.startsWith('0')) return `212${clean.slice(1)}`
  return clean
}

export function whatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${whatsAppPhone(phone)}?text=${encodeURIComponent(text)}`
}

export interface CreatedTeacherInvitation {
  invitationId: string
  code: string
  url: string
  expiresAtMs: number
  mode: 'activation' | 'link'
  phoneE164: string
  addsTeacherRole: boolean
  revokedCount: number
}

const GREETING_AR = 'السلام عليكم ورحمة الله،'

/**
 * Fin de message : installation de l'application, puis le code en secours,
 * seul sur sa ligne et en gras dans WhatsApp. Le message entier collé dans
 * l'application redonne ce code (invitationCodeFromText).
 */
const installAndCode = (code: string) => [
  `تثبيت التطبيق / Installer Mojammaa Connect (Android)\n${PLAY_STORE_URL}`,
  `الرمز، إن طلبه التطبيق / Code, si l’application le demande\n*${code}*`,
]

/** Date limite d'une invitation, chacune dans la langue de son paragraphe. */
export interface InvitationUntil {
  ar: string
  fr: string
}

/** Invitation professeur : lien d'abord, arabe puis français (identique au site). */
export function teacherInvitationMessage(prenom: string, invitation: Pick<CreatedTeacherInvitation, 'code' | 'url' | 'mode'>, until: InvitationUntil): string {
  const activation = invitation.mode === 'activation'
  return [
    `${GREETING_AR}\nهذا رابط تفعيل حساب الأستاذ(ة) ${prenom}:`,
    invitation.url,
    'اضغطوا على الرابط: الرمز مكتوب فيه. '
      + (activation ? 'أدخلوا رقم هاتفكم واختاروا كلمة المرور، ثم ثبّتوا التطبيق.' : 'سجّلوا الدخول كالمعتاد؛ كلمة المرور لا تتغير.')
      + `\nرابط شخصي، صالح إلى ${until.ar}.`,
    `Bonjour ${prenom}, voici ci-dessus le lien d’activation de votre compte professeur.\n`
      + 'Touchez-le : le code y est déjà. '
      + (activation ? 'Saisissez votre numéro, choisissez un mot de passe, puis installez l’application.' : 'Connectez-vous comme d’habitude, sans changer votre mot de passe.')
      + `\nLien personnel, valable jusqu’au ${until.fr}.`,
    ...installAndCode(invitation.code),
  ].join('\n\n')
}

export interface ResetLink {
  resetUrl: string
  phone: string | null
  phoneIsLogin: boolean
  expiresInMinutes: number
  hasRealEmail?: boolean
}

/** Lien de réinitialisation (parent ou professeur), envoyé en conversation individuelle. */
export function resetLinkMessage(prenom: string, link: ResetLink): string {
  // Se connecter par téléphone n'a de sens que si ce numéro est l'identifiant du compte.
  const byPhone = link.phoneIsLogin && Boolean(link.phone)
  const hour = link.expiresInMinutes === 60
  return [
    `${GREETING_AR}\nهذا رابط لاختيار كلمة مرور جديدة، صالح لمرة واحدة ولمدة ${hour ? 'ساعة' : `${link.expiresInMinutes} دقيقة`}:`,
    link.resetUrl,
    byPhone ? 'ثم سجّلوا الدخول برقم هاتفكم وكلمة المرور الجديدة.' : '',
    `Bonjour ${prenom}, voici ci-dessus votre lien pour choisir un nouveau mot de passe (usage unique, valable ${hour ? '1 heure' : `${link.expiresInMinutes} minutes`}).`
      + (byPhone ? ' Connectez-vous ensuite avec votre numéro et ce nouveau mot de passe.' : ''),
  ].filter(Boolean).join('\n\n')
}

export interface ParentCode {
  studentId: string
  studentName: string
  classe: string
  code: string
}

/** Activation parent : lien d'abord, arabe puis français (identique au site). */
export function parentCodeMessage(item: ParentCode): string {
  const who = `${item.studentName}${item.classe ? ` (${item.classe})` : ''}`
  return [
    `${GREETING_AR}\nهذا رابط تفعيل حساب ولي أمر ${who}:`,
    // Le site s'ouvre sur tous les appareils, avec le code déjà rempli.
    parentActivationUrl(item.code),
    'اضغطوا على الرابط: الرمز مكتوب فيه. أدخلوا رقم هاتفكم واختاروا كلمة المرور، ثم ثبّتوا التطبيق. الرابط شخصي.',
    `Bonjour, voici ci-dessus le lien d’activation du compte parent de ${who}.\n`
      + 'Touchez-le : le code y est déjà. Saisissez votre numéro, choisissez un mot de passe, puis installez l’application. Lien personnel.',
    ...installAndCode(item.code),
  ].join('\n\n')
}

export type InvitationStatus = 'pending' | 'used' | 'revoked' | 'expired'
export type RevokeReason = 'reissued' | 'admin' | 'attempts' | 'phone-changed' | 'incompatible'

export interface TeacherAccessRow {
  uid: string
  account: { exists: boolean; disabled: boolean; everSignedIn: boolean; loginPhone: string | null; hasRealEmail: boolean }
  invitation: {
    id: string
    status: InvitationStatus
    mode: 'activation' | 'link'
    phoneE164: string
    addsTeacherRole: boolean
    codeLast4: string
    createdAtMs: number
    expiresAtMs: number
    usedAtMs: number | null
    revokedAtMs: number | null
    revokeReason: RevokeReason | null
  } | null
}

export type AccessBadge = 'disabled' | 'phone' | 'pending' | 'expired' | 'revoked' | 'active-email' | 'to-invite' | 'unknown'

/** État affiché sur la carte d'un professeur (même règle que la page Enseignants du site). */
export function teacherAccessBadge(row: TeacherAccessRow | undefined): AccessBadge {
  if (!row) return 'unknown'
  const status = row.invitation?.status
  if (row.account.disabled) return 'disabled'
  // Connexion par téléphone active : une invitation révoquée ou expirée n'est
  // plus que l'historique (setTeacherLoginPhone révoque celles en attente).
  // Seule une invitation EN ATTENTE reste signalée.
  if (row.account.loginPhone && status !== 'pending') return 'phone'
  if (status === 'pending') return 'pending'
  if (status === 'expired') return 'expired'
  if (status === 'revoked') return 'revoked'
  if (row.account.everSignedIn) return 'active-email'
  return 'to-invite'
}
