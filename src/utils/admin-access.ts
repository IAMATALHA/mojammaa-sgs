/**
 * Accès des comptes gérés par l'administration depuis l'app : invitations
 * professeurs, codes d'activation parents, liens de réinitialisation.
 * Fonctions pures (messages, liens, états) — testées seules
 * (tests/services/adminAccess.test.mjs).
 *
 * Les messages reprennent ceux du site (mojammaa-admin : TeacherAccessModal,
 * ParentInvitations, Comptes) : un même professeur ou parent reçoit le même
 * texte, quel que soit l'outil de l'école. Les boutons PRÉPARENT un message
 * (WhatsApp, partage) : rien n'est envoyé automatiquement.
 */
import { formatLoginPhone } from './parentIdentity'

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

/** Message bilingue de l'invitation professeur (identique au site). */
export function teacherInvitationMessage(prenom: string, invitation: Pick<CreatedTeacherInvitation, 'code' | 'url' | 'mode'>, until: string): string {
  return [
    `Bonjour ${prenom}, voici votre invitation pour activer votre compte professeur Mojammaa Al Maarifa (usage unique, valable jusqu'au ${until}) :`,
    invitation.url,
    `Code : ${invitation.code}`,
    invitation.mode === 'activation'
      ? 'Ouvrez le lien, ou dans l’application touchez « Première connexion ? Activer mon compte ». Saisissez votre numéro, puis choisissez votre mot de passe. Ne transmettez ce code à personne.'
      : 'Ouvrez le lien, ou dans l’application touchez « Première connexion ? Activer mon compte », puis connectez-vous avec vos identifiants habituels. Votre mot de passe ne change pas. Ne transmettez ce code à personne.',
    `مرحباً ${prenom}، هذه دعوتكم لتفعيل حساب الأستاذ(ة) على Mojammaa Al Maarifa، صالحة لاستعمال واحد إلى غاية ${until}. افتحوا الرابط أعلاه أو اختاروا في التطبيق «أول مرة؟ تفعيل حسابي»، وأدخلوا الرمز ${invitation.code}. لا تشاركوا هذا الرمز مع أي أحد.`,
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
  const byPhone = link.phoneIsLogin && link.phone
  return [
    `Bonjour ${prenom}, voici votre lien Mojammaa Al Maarifa pour choisir un nouveau mot de passe (usage unique, valable ${link.expiresInMinutes} minutes) :`,
    link.resetUrl,
    byPhone ? `Connectez-vous ensuite avec votre numéro ${formatLoginPhone(link.phone!)} et ce nouveau mot de passe.` : '',
    'مرحباً، هذا رابط لاختيار كلمة مرور جديدة لحسابكم على Mojammaa Al Maarifa، صالح لمرة واحدة ولمدة ساعة.'
      + (byPhone ? ' ثم سجّلوا الدخول برقم هاتفكم وكلمة المرور الجديدة.' : ''),
  ].filter(Boolean).join('\n\n')
}

export interface ParentCode {
  studentId: string
  studentName: string
  classe: string
  code: string
}

/**
 * Code d'activation parent. Le bouton de l'app s'appelle « Première
 * connexion ? Activer mon compte » depuis le 9 oct. 2026 (activation
 * professeurs) : même libellé ici et sur le site.
 */
export function parentCodeMessage(item: ParentCode): string {
  const link = parentActivationUrl(item.code)
  return [
    `Bonjour, voici le code d’activation du compte parent Mojammaa Al Maarifa pour ${item.studentName}${item.classe ? ` (${item.classe})` : ''} : ${item.code}`,
    `1. Installez l’application Mojammaa Connect : ${PLAY_STORE_URL}`,
    '2. Touchez « Première connexion ? Activer mon compte ».',
    '3. Saisissez ce code, votre numéro de téléphone (hors Maroc : avec l’indicatif du pays, ex. +33, +32, +49) et un mot de passe de votre choix. L’e-mail est facultatif.',
    `Sur iPhone ou ordinateur, sans application : ${link} (le code est déjà rempli).`,
    'Ce code est personnel : ne le partagez pas.',
    `مرحباً، هذا رمز تفعيل حساب ولي الأمر للتلميذ(ة) ${item.studentName}: ${item.code}. ثبّتوا تطبيق Mojammaa Connect، ثم اضغطوا «أول مرة؟ تفعيل حسابي» وأدخلوا الرمز ورقم هاتفكم وكلمة مرور من اختياركم. على الآيفون أو الحاسوب، بدون تطبيق: ${link} . الرمز شخصي، لا تشاركوه.`,
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
