import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../config/firebase'
import { INVITATION_CODE_LENGTH, normalizeInvitationCode, signInParentWithPhone } from './parentAuthService'

/**
 * Activation des professeurs par invitation (mojammaa-admin/functions,
 * teacherInvitations.ts). Même contrat que le site
 * (mojammaa-admin/src/services/teacherAccess.ts) :
 * - `previewActivationCode` : type du code (professeur ou parent) ;
 * - `activateTeacherAccount` : compte jamais utilisé — numéro + code + mot de
 *   passe choisi, puis session ouverte avec ce mot de passe ;
 * - `linkTeacherInvitation` : compte déjà actif — après connexion avec les
 *   identifiants habituels, ajoute le numéro (ou le rôle professeur à un
 *   compte parent) sans toucher au mot de passe.
 * Seul le motif d'un refus (`details.reason`) est lu, jamais son message.
 */

export type ActivationPreview =
  | { kind: 'teacher'; mode: 'activation' | 'link'; addsTeacherRole: boolean }
  | { kind: 'parent' }

export type TeacherAccessReason =
  | 'invalid-code' | 'expired' | 'used' | 'revoked' | 'busy'
  | 'account-active' | 'account-unavailable' | 'wrong-account' | 'phone-unavailable'
  | 'too-many-attempts' | 'parent-invitation' | 'invalid-phone' | 'weak-password'
  | 'signin' | 'generic'

const SERVER_REASONS: readonly string[] = [
  'invalid-code', 'expired', 'used', 'revoked', 'busy', 'account-active', 'account-unavailable',
  'wrong-account', 'phone-unavailable', 'too-many-attempts', 'parent-invitation', 'invalid-phone', 'weak-password',
]

export class TeacherAccessFailure extends Error {
  readonly reason: TeacherAccessReason
  constructor(reason: TeacherAccessReason) {
    super(reason)
    this.name = 'TeacherAccessFailure'
    this.reason = reason
  }
}

export function teacherAccessReason(error: unknown): TeacherAccessReason {
  if (error instanceof TeacherAccessFailure) return error.reason
  const details = (error as { details?: { reason?: unknown } } | null)?.details
  const reason = typeof details?.reason === 'string' ? details.reason : ''
  return SERVER_REASONS.includes(reason) ? reason as TeacherAccessReason : 'generic'
}

/** Affichage du code pendant la saisie : `ABC-DEFG-HIJ`, comme sur le message de l'école. */
export function formatInvitationCode(value: string): string {
  const code = normalizeInvitationCode(value).slice(0, INVITATION_CODE_LENGTH)
  return [code.slice(0, 3), code.slice(3, 7), code.slice(7)].filter(Boolean).join('-')
}

function cleanCode(raw: string): string {
  const code = normalizeInvitationCode(raw)
  if (code.length !== INVITATION_CODE_LENGTH) throw new TeacherAccessFailure('invalid-code')
  return code
}

export async function previewActivationCode(rawCode: string): Promise<ActivationPreview> {
  const code = cleanCode(rawCode)
  try {
    const callable = httpsCallable<{ code: string }, ActivationPreview>(functions, 'previewActivationCode')
    return (await callable({ code })).data
  } catch (error) {
    throw new TeacherAccessFailure(teacherAccessReason(error))
  }
}

/**
 * Active le compte puis ouvre la session. `signedIn: false` : compte activé
 * mais session non ouverte — le code est consommé, se connecter normalement.
 */
export async function activateTeacher(rawCode: string, phoneE164: string, password: string): Promise<{ signedIn: boolean }> {
  const code = cleanCode(rawCode)
  let loginEmail: string
  try {
    const callable = httpsCallable<{ code: string; phone: string; password: string }, { loginEmail?: string }>(functions, 'activateTeacherAccount')
    const { data } = await callable({ code, phone: phoneE164, password })
    if (!data?.loginEmail) throw new TeacherAccessFailure('generic')
    loginEmail = data.loginEmail
  } catch (error) {
    const reason = teacherAccessReason(error)
    // Code déjà consommé : souvent une activation réussie dont la réponse s'est
    // perdue (réseau coupé). Les identifiants choisis ouvrent alors la session.
    if (reason === 'used') {
      try {
        await signInParentWithPhone(phoneE164, password)
        return { signedIn: true }
      } catch { /* identifiants différents : code consommé */ }
    }
    throw new TeacherAccessFailure(reason)
  }
  try {
    await signInWithEmailAndPassword(auth, loginEmail, password)
    return { signedIn: true }
  } catch {
    return { signedIn: false }
  }
}

/** Rattache une invitation au compte CONNECTÉ. */
export async function linkTeacherInvitation(rawCode: string, phoneE164: string): Promise<{ role: string; addedTeacherRole: boolean }> {
  const code = cleanCode(rawCode)
  try {
    const callable = httpsCallable<{ code: string; phone: string }, { role?: string; addedTeacherRole?: boolean }>(functions, 'linkTeacherInvitation')
    const { data } = await callable({ code, phone: phoneE164 })
    return { role: data?.role || 'professeur', addedTeacherRole: data?.addedTeacherRole === true }
  } catch (error) {
    throw new TeacherAccessFailure(teacherAccessReason(error))
  }
}

/**
 * Compte déjà actif : connexion avec les identifiants habituels (e-mail, ou
 * numéro s'il sert déjà à se connecter), puis rattachement.
 */
export async function signInAndLinkTeacher(rawCode: string, phoneE164: string, password: string, email: string): Promise<{ role: string; addedTeacherRole: boolean }> {
  const code = cleanCode(rawCode)
  try {
    if (email.trim()) await signInWithEmailAndPassword(auth, email.trim(), password)
    else await signInParentWithPhone(phoneE164, password)
  } catch {
    throw new TeacherAccessFailure('signin')
  }
  return linkTeacherInvitation(code, phoneE164)
}
