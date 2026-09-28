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
