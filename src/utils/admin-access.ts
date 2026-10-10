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
 * Format validé par Youssef (10 oct. 2026) : arabe d'abord, puis français,
 * brefs ; le code seul sur sa ligne (en gras dans WhatsApp). On dit
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

/** Le code seul sur sa ligne, en gras dans WhatsApp : lisible et facile à recopier. */
const codeLine = (code: string) => `*${code}*`

/** Date limite d'une invitation, chacune dans la langue de son paragraphe. */
export interface InvitationUntil {
  ar: string
  fr: string
}

/** Invitation professeur : arabe puis français (identique au site). */
export function teacherInvitationMessage(prenom: string, invitation: Pick<CreatedTeacherInvitation, 'code' | 'url' | 'mode'>, until: InvitationUntil): string {
  const activation = invitation.mode === 'activation'
  return [
    `${GREETING_AR}\nهذا رمز تفعيل حساب الأستاذ(ة) ${prenom}، صالح لمرة واحدة إلى غاية ${until.ar}:`,
    codeLine(invitation.code),
    (activation
      ? 'في التطبيق اضغطوا «أول مرة؟ تفعيل حسابي»، أدخلوا الرمز ورقم هاتفكم، ثم اختاروا كلمة المرور.'
      : 'في التطبيق اضغطوا «أول مرة؟ تفعيل حسابي»، أدخلوا الرمز ثم سجّلوا الدخول ببياناتكم المعتادة. كلمة المرور لا تتغير.')
      + ' الرمز شخصي، لا تشاركوه.',
    `Bonjour ${prenom}, voici ci-dessus votre code d’activation du compte professeur (usage unique, valable jusqu’au ${until.fr}).\n`
      + (activation
        ? 'Dans l’application, touchez « Première connexion ? Activer mon compte », saisissez ce code et votre numéro, puis choisissez votre mot de passe.'
        : 'Dans l’application, touchez « Première connexion ? Activer mon compte », saisissez ce code, puis connectez-vous avec vos identifiants habituels. Votre mot de passe ne change pas.')
      + ' Code personnel, ne le partagez pas.',
    `Sans application : ${invitation.url}`,
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

/**
 * Code d'activation parent. Le bouton de l'app s'appelle « Première
 * connexion ? Activer mon compte » depuis le 9 oct. 2026 (activation
 * professeurs) : même libellé ici et sur le site.
 */
export function parentCodeMessage(item: ParentCode): string {
  const who = `${item.studentName}${item.classe ? ` (${item.classe})` : ''}`
  return [
    `${GREETING_AR}\nهذا رمز تفعيل حساب ولي أمر التلميذ(ة) ${who}:`,
    codeLine(item.code),
    'ثبّتوا تطبيق Mojammaa Connect، ثم اضغطوا «أول مرة؟ تفعيل حسابي» وأدخلوا الرمز ورقم هاتفكم وكلمة مرور من اختياركم. الرمز شخصي، لا تشاركوه.',
    `Bonjour, voici ci-dessus le code d’activation du compte parent de ${who}.\n`
      + 'Installez Mojammaa Connect, touchez « Première connexion ? Activer mon compte », puis saisissez ce code, votre numéro et un mot de passe. Code personnel, ne le partagez pas.',
    // Sur iPhone ou ordinateur, le lien du site arrive avec le code déjà rempli.
    `Android : ${PLAY_STORE_URL}\niPhone / ordinateur : ${parentActivationUrl(item.code)}`,
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
