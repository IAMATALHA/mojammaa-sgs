/**
 * Identité de connexion parent : un mobile marocain peut remplacer l'e-mail.
 *
 * `normalizeMoroccanMobile` suit exactement le contrat du serveur
 * (mojammaa-admin/functions/src/parentInvitations.ts) : toute modification doit
 * être reportée des deux côtés, avec la même matrice de tests
 * (tests/services/parentIdentity.test.mjs ici, parentInvitations.test.ts là-bas).
 */

// Identifiant Auth technique des parents sans e-mail : jamais affiché.
export const HIDDEN_PARENT_EMAIL_DOMAIN = 'parents.mojammaa.invalid'

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
}

/** Mobile marocain (06/07, formats locaux ou internationaux) → E.164, sinon null. */
export function normalizeMoroccanMobile(value: string): string | null {
  if (value.length > 40) return null
  let compact = toAsciiDigits(value).trim()
  if (!compact || /[A-Za-z]/.test(compact)) return null
  compact = compact.replace(/[\s().-]/g, '')
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
  else if (compact.startsWith('212')) compact = `+${compact}`
  // « +212 (0)6… » : seul le zéro de préfixe national redondant est retiré.
  if (/^\+2120[67]\d{8}$/.test(compact)) compact = `+212${compact.slice(5)}`
  else if (/^0[67]\d{8}$/.test(compact)) compact = `+212${compact.slice(1)}`
  else if (/^[67]\d{8}$/.test(compact)) compact = `+212${compact}`
  return /^\+212[67]\d{8}$/.test(compact) ? compact : null
}

/** +212612345678 → « 06 12 34 56 78 » ; toute autre valeur est rendue telle quelle. */
export function formatMoroccanMobile(phone: string): string {
  const match = /^\+212([67])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone)
  return match ? `0${match.slice(1).join(' ')}` : phone
}

/** Le champ de connexion unique contient un e-mail dès qu'il a un « @ ». */
export function isEmailIdentifier(value: string): boolean {
  return value.includes('@')
}

export function isHiddenParentEmail(value: unknown): boolean {
  return typeof value === 'string'
    && value.trim().toLowerCase().endsWith(`@${HIDDEN_PARENT_EMAIL_DOMAIN}`)
}

/**
 * Identifiant à montrer à l'utilisateur : son e-mail réel, sinon son mobile de
 * connexion. L'identifiant technique caché n'est jamais renvoyé.
 */
export function loginIdentifierLabel(profile: {
  email?: string | null
  authPhoneE164?: string | null
  telephone?: string | null
} | null | undefined): string {
  if (!profile) return ''
  if (profile.email && !isHiddenParentEmail(profile.email)) return profile.email
  const phone = profile.authPhoneE164 || profile.telephone || ''
  return phone ? formatMoroccanMobile(phone) : ''
}

export type ParentLoginFailure = 'invalid-phone' | 'wrong-credentials' | 'rate-limited' | 'temporary'

/**
 * Classe l'échec de la callable `parentPhoneLogin` sans jamais afficher le
 * message brut. Numéro inconnu et mauvais mot de passe restent volontairement
 * la même réponse (le serveur ne les distingue pas non plus).
 */
export function classifyParentLoginError(error: unknown): ParentLoginFailure {
  const raw = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : ''
  const code = raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw
  if (code === 'invalid-argument') return 'invalid-phone'
  if (code === 'unauthenticated' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'wrong-credentials'
  }
  if (code === 'resource-exhausted' || code === 'auth/too-many-requests') return 'rate-limited'
  return 'temporary'
}
