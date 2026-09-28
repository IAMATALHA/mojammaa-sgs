/**
 * Identité de connexion parent : un numéro de téléphone (Maroc ou étranger)
 * peut remplacer l'e-mail.
 *
 * `normalizeLoginPhone` suit exactement le contrat du serveur
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

// Pays où un « 0 » de préfixe national est souvent tapé après l'indicatif
// (« +33 06… », « +32 0470… ») alors qu'il n'est jamais composé depuis
// l'étranger. Tout autre pays fonctionne aussi, tapé sans ce zéro. L'Italie
// (39) n'y figure pas : ce zéro y fait partie du numéro.
const TRUNK_ZERO_CODES = ['212', '213', '218', '353', '966', '971', '20', '31', '32', '33', '41', '43', '44', '46', '49', '90']

/**
 * Numéro de connexion → E.164, sinon null. Sans indicatif, le numéro est
 * marocain (05/06/07) ; hors du Maroc, l'indicatif est obligatoire (+33…, 0033…).
 */
export function normalizeLoginPhone(value: string): string | null {
  if (value.length > 40) return null
  let compact = toAsciiDigits(value).trim()
  if (!compact || /[A-Za-z]/.test(compact)) return null
  // « +33 (0)6… » : le zéro entre parenthèses n'est jamais composé.
  compact = compact.replace(/\(0\)/g, '').replace(/[\s()./-]/g, '')
  if (!/^\+?\d+$/.test(compact)) return null
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
  else if (/^212\d{9}$/.test(compact)) compact = `+${compact}`
  else if (/^0[5-7]\d{8}$/.test(compact)) compact = `+212${compact.slice(1)}`
  else if (/^[5-7]\d{8}$/.test(compact)) compact = `+212${compact}`
  if (!compact.startsWith('+')) return null
  const trunk = TRUNK_ZERO_CODES.find(code => compact.startsWith(`+${code}0`))
  if (trunk) compact = `+${trunk}${compact.slice(trunk.length + 2)}`
  if (compact.startsWith('+212')) return /^\+212[5-7]\d{8}$/.test(compact) ? compact : null
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}

// Indicatifs courants des familles (Maroc, diaspora) : servent seulement à
// l'affichage (séparer l'indicatif, drapeau de confirmation).
// Un pays absent de cette liste fonctionne aussi : son numéro s'affiche
// simplement sans drapeau.
const COUNTRY_FLAGS: Record<string, string> = {
  '212': '🇲🇦', '213': '🇩🇿', '216': '🇹🇳', '218': '🇱🇾', '221': '🇸🇳', '222': '🇲🇷', '351': '🇵🇹',
  '352': '🇱🇺', '353': '🇮🇪', '966': '🇸🇦', '971': '🇦🇪', '974': '🇶🇦',
  '1': '', '20': '🇪🇬', '31': '🇳🇱', '32': '🇧🇪', '33': '🇫🇷', '34': '🇪🇸', '39': '🇮🇹', '41': '🇨🇭',
  '43': '🇦🇹', '44': '🇬🇧', '45': '🇩🇰', '46': '🇸🇪', '47': '🇳🇴', '48': '🇵🇱', '49': '🇩🇪', '90': '🇹🇷',
}

function countryCodeOf(phone: string): string | null {
  if (!/^\+\d+$/.test(phone)) return null
  return Object.keys(COUNTRY_FLAGS)
    .sort((a, b) => b.length - a.length)
    .find(code => phone.startsWith(`+${code}`)) ?? null
}

/** Affichage courant : « 06 12 34 56 78 » au Maroc, « +33 612345678 » ailleurs. */
export function formatLoginPhone(phone: string): string {
  const match = /^\+212([5-7])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone)
  if (match) return `0${match.slice(1).join(' ')}`
  const code = countryCodeOf(phone)
  return code ? `+${code} ${phone.slice(code.length + 1)}` : phone
}

/**
 * Affichage de confirmation, toujours international avec le drapeau : un
 * parent en France qui a tapé « 06… » sans indicatif voit « 🇲🇦 +212 » et
 * peut corriger avant que ce numéro ne devienne son identifiant.
 */
export function formatLoginPhoneForConfirmation(phone: string): string {
  const match = /^\+212([5-7])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone)
  const code = countryCodeOf(phone)
  const international = match
    ? `+212 ${match.slice(1).join(' ')}`
    : code ? `+${code} ${phone.slice(code.length + 1)}` : phone
  const flag = code ? COUNTRY_FLAGS[code] : ''
  return flag ? `${flag} ${international}` : international
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
  return phone ? formatLoginPhone(phone) : ''
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
