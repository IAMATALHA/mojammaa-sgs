import { signInWithEmailAndPassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../config/firebase'

/**
 * Connexion parent « mobile + mot de passe ».
 *
 * La callable `parentPhoneLogin` (mojammaa-admin/functions) vérifie le mot de
 * passe côté serveur, sous plafonds anti-bourrinage, puis renvoie l'identifiant
 * Auth du compte ; la session s'ouvre ensuite normalement, comme pour un
 * e-mail. Cet identifiant n'est jamais affiché ni conservé par l'app.
 */
export async function signInParentWithPhone(phoneE164: string, password: string): Promise<void> {
  const callable = httpsCallable<{ phone: string; password: string }, { loginEmail?: string }>(
    functions,
    'parentPhoneLogin',
  )
  const { data } = await callable({ phone: phoneE164, password })
  if (!data?.loginEmail) throw new Error('parentPhoneLogin: réponse incomplète')
  await signInWithEmailAndPassword(auth, data.loginEmail, password)
}

/** Longueur d'un code d'activation, une fois tirets et espaces retirés. */
export const INVITATION_CODE_LENGTH = 10

/** Même normalisation que le serveur : `abc-defg-hij` → `ABCDEFGHIJ`. */
export function normalizeInvitationCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type LinkedChild = { studentName: string; classe: string }

/**
 * Rattache un enfant au compte CONNECTÉ (parent, prof ou chauffeur) avec le
 * code remis par l'école (`linkParentInvitation`, codebase admin). C'est la
 * voie à donner au personnel : l'écran d'activation, déconnecté, crée un
 * second compte parent dès que le numéro saisi n'est pas celui du compte
 * existant (incident du 2026-10-07).
 */
export async function linkChildWithCode(code: string): Promise<LinkedChild> {
  const callable = httpsCallable<{ code: string; telephone: string }, Partial<LinkedChild>>(
    functions,
    'linkParentInvitation',
  )
  const { data } = await callable({ code: normalizeInvitationCode(code), telephone: '' })
  return { studentName: data?.studentName || '', classe: data?.classe || '' }
}
