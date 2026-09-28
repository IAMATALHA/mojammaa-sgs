/**
 * Pays du champ « numéro de téléphone » (sélecteur + saisie nationale).
 *
 * Le champ produit un numéro E.164 qui doit rester un point fixe de
 * `normalizeLoginPhone` (même contrat que le serveur) : c'est vérifié pour
 * chaque pays par tests/services/phoneCountries.test.mjs. Un pays absent de
 * la liste reste utilisable via « Autre pays » (numéro complet avec +…).
 */
import { normalizeLoginPhone } from './parentIdentity'

export type PhoneLanguage = 'fr' | 'en' | 'ar'

export interface PhoneCountry {
  iso: string
  dial: string
  names: Record<PhoneLanguage, string>
  /** Longueur de la partie nationale, sans le « 0 » de préfixe national. */
  min: number
  max: number
  /** Découpage d'affichage de la partie nationale. */
  groups: number[]
  /** Un « 0 » tapé en tête est le préfixe national : affiché, jamais envoyé. */
  trunkZero: boolean
  /** Exemple (partie nationale) : sert de modèle de saisie. */
  example: string
  /** Contrainte supplémentaire sur la partie nationale. */
  pattern?: RegExp
}

const c = (
  iso: string, dial: string, fr: string, en: string, ar: string,
  min: number, max: number, groups: number[], trunkZero: boolean, example: string, pattern?: RegExp,
): PhoneCountry => ({ iso, dial, names: { fr, en, ar }, min, max, groups, trunkZero, example, pattern })

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  c('MA', '212', 'Maroc', 'Morocco', 'المغرب', 9, 9, [1, 2, 2, 2, 2], true, '612345678', /^[5-7]/),
  c('FR', '33', 'France', 'France', 'فرنسا', 9, 9, [1, 2, 2, 2, 2], true, '612345678'),
  c('BE', '32', 'Belgique', 'Belgium', 'بلجيكا', 8, 9, [3, 2, 2, 2], true, '470123456'),
  c('ES', '34', 'Espagne', 'Spain', 'إسبانيا', 9, 9, [3, 2, 2, 2], false, '612345678'),
  c('NL', '31', 'Pays-Bas', 'Netherlands', 'هولندا', 9, 9, [1, 4, 4], true, '612345678'),
  c('IT', '39', 'Italie', 'Italy', 'إيطاليا', 6, 11, [3, 3, 4], false, '3123456789'),
  c('DE', '49', 'Allemagne', 'Germany', 'ألمانيا', 6, 13, [3, 4, 4], true, '15123456789'),
  c('GB', '44', 'Royaume-Uni', 'United Kingdom', 'المملكة المتحدة', 9, 10, [4, 6], true, '7400123456'),
  c('CH', '41', 'Suisse', 'Switzerland', 'سويسرا', 9, 9, [2, 3, 2, 2], true, '781234567'),
  c('AT', '43', 'Autriche', 'Austria', 'النمسا', 4, 13, [3, 4, 4], true, '6641234567'),
  c('LU', '352', 'Luxembourg', 'Luxembourg', 'لوكسمبورغ', 4, 11, [3, 3, 3], false, '628123456'),
  c('PT', '351', 'Portugal', 'Portugal', 'البرتغال', 9, 9, [3, 3, 3], false, '912345678'),
  c('IE', '353', 'Irlande', 'Ireland', 'أيرلندا', 7, 9, [2, 3, 4], true, '851234567'),
  c('SE', '46', 'Suède', 'Sweden', 'السويد', 7, 10, [2, 3, 2, 2], true, '701234567'),
  c('NO', '47', 'Norvège', 'Norway', 'النرويج', 8, 8, [3, 2, 3], false, '40612345'),
  c('DK', '45', 'Danemark', 'Denmark', 'الدنمارك', 8, 8, [2, 2, 2, 2], false, '32123456'),
  c('FI', '358', 'Finlande', 'Finland', 'فنلندا', 5, 12, [2, 3, 4], true, '412345678'),
  c('PL', '48', 'Pologne', 'Poland', 'بولندا', 9, 9, [3, 3, 3], false, '512345678'),
  c('RO', '40', 'Roumanie', 'Romania', 'رومانيا', 9, 9, [3, 3, 3], true, '712345678'),
  c('GR', '30', 'Grèce', 'Greece', 'اليونان', 10, 10, [3, 3, 4], false, '6912345678'),
  c('TR', '90', 'Turquie', 'Turkey', 'تركيا', 10, 10, [3, 3, 2, 2], true, '5012345678'),
  c('US', '1', 'États-Unis', 'United States', 'الولايات المتحدة', 10, 10, [3, 3, 4], false, '2015550123'),
  c('CA', '1', 'Canada', 'Canada', 'كندا', 10, 10, [3, 3, 4], false, '5145550123'),
  c('DZ', '213', 'Algérie', 'Algeria', 'الجزائر', 8, 9, [3, 2, 2, 2], true, '551234567'),
  c('TN', '216', 'Tunisie', 'Tunisia', 'تونس', 8, 8, [2, 3, 3], false, '20123456'),
  c('LY', '218', 'Libye', 'Libya', 'ليبيا', 8, 9, [2, 3, 4], true, '912345678'),
  c('EG', '20', 'Égypte', 'Egypt', 'مصر', 8, 10, [3, 3, 4], true, '1001234567'),
  c('MR', '222', 'Mauritanie', 'Mauritania', 'موريتانيا', 8, 8, [2, 2, 2, 2], false, '22123456'),
  c('SN', '221', 'Sénégal', 'Senegal', 'السنغال', 9, 9, [2, 3, 2, 2], false, '701234567'),
  c('ML', '223', 'Mali', 'Mali', 'مالي', 8, 8, [2, 2, 2, 2], false, '65012345'),
  c('CI', '225', 'Côte d’Ivoire', 'Côte d’Ivoire', 'ساحل العاج', 10, 10, [2, 2, 2, 2, 2], false, '0701234567'),
  c('SA', '966', 'Arabie saoudite', 'Saudi Arabia', 'السعودية', 8, 9, [2, 3, 4], true, '512345678'),
  c('AE', '971', 'Émirats arabes unis', 'United Arab Emirates', 'الإمارات', 8, 9, [2, 3, 4], true, '501234567'),
  c('QA', '974', 'Qatar', 'Qatar', 'قطر', 8, 8, [4, 4], false, '33123456'),
  c('KW', '965', 'Koweït', 'Kuwait', 'الكويت', 8, 8, [4, 4], false, '50012345'),
  c('BH', '973', 'Bahreïn', 'Bahrain', 'البحرين', 8, 8, [4, 4], false, '36001234'),
  c('OM', '968', 'Oman', 'Oman', 'عُمان', 8, 8, [4, 4], false, '92123456'),
  c('JO', '962', 'Jordanie', 'Jordan', 'الأردن', 8, 9, [1, 4, 4], true, '790123456'),
  c('LB', '961', 'Liban', 'Lebanon', 'لبنان', 7, 8, [2, 3, 3], true, '71123456'),
]

/** Pays montrés en tête du sélecteur (familles de l'école). */
export const SUGGESTED_COUNTRY_ISOS = ['MA', 'FR', 'BE', 'ES', 'NL', 'IT', 'DE'] as const

/** Pseudo-pays « Autre » : numéro international complet saisi à la main. */
export const OTHER_COUNTRY_ISO = 'INTL'
export const DEFAULT_COUNTRY_ISO = 'MA'

export interface PhoneFieldValue {
  iso: string
  /** Chiffres saisis (partie nationale), ou numéro complet « +… » pour « Autre ». */
  raw: string
}

export function emptyPhoneFieldValue(iso: string = DEFAULT_COUNTRY_ISO): PhoneFieldValue {
  return { iso, raw: '' }
}

export function findPhoneCountry(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find(country => country.iso === iso)
}

/** Drapeau emoji calculé depuis le code ISO (indicateurs régionaux Unicode). */
export function flagOf(iso: string): string {
  if (!/^[A-Z]{2}$/.test(iso)) return '🌐'
  return String.fromCodePoint(...Array.from(iso, char => 0x1F1E6 + char.charCodeAt(0) - 65))
}

export function countryName(country: PhoneCountry, language: string): string {
  const lang = (['fr', 'en', 'ar'].includes(language) ? language : 'fr') as PhoneLanguage
  return country.names[lang]
}

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
}

export function digitsOnly(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, '')
}

function foldForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Recherche par nom (toutes langues, sans accents), code ISO ou indicatif. */
export function searchPhoneCountries(query: string, language: string): PhoneCountry[] {
  const q = foldForSearch(query)
  const dialQuery = digitsOnly(query)
  const sorted = [...PHONE_COUNTRIES].sort((a, b) =>
    countryName(a, language).localeCompare(countryName(b, language), language))
  if (!q) return sorted
  return sorted.filter(country =>
    Object.values(country.names).some(name => foldForSearch(name).includes(q))
    || country.iso.toLowerCase() === q
    || (dialQuery !== '' && /^[+\d\s]+$/.test(query.trim()) && country.dial.startsWith(dialQuery)))
}

function splitGroups(digits: string, groups: number[]): string {
  const parts: string[] = []
  let index = 0
  for (const size of groups) {
    if (index >= digits.length) break
    parts.push(digits.slice(index, index + size))
    index += size
  }
  if (index < digits.length) parts.push(digits.slice(index))
  return parts.join(' ')
}

/** Affichage pendant la saisie : « 06 12 34 56 78 », « 0470 12 34 56 »… */
/**
 * Chiffres nationaux après une saisie dans le champ mis en forme `display`.
 * Effacer un espace de mise en forme retire le chiffre qui le précède À CET
 * ENDROIT : l'ancien calcul retirait toujours le dernier chiffre du numéro,
 * même quand on corrigeait le début (audit 2026-09-28, F2).
 */
export function digitsAfterFormattedEdit(previousDigits: string, display: string, text: string): string {
  const digits = digitsOnly(text)
  if (digits !== previousDigits || text.length >= display.length) return digits
  let at = 0
  while (at < text.length && text[at] === display[at]) at++
  const before = digitsOnly(display.slice(0, at)).length
  return before === 0 ? digits : digits.slice(0, before - 1) + digits.slice(before)
}

export function formatNationalInput(country: PhoneCountry, raw: string): string {
  const digits = digitsOnly(raw)
  if (country.trunkZero && digits.startsWith('0')) {
    const rest = digits.slice(1)
    return rest ? `0${splitGroups(rest, country.groups)}` : '0'
  }
  return splitGroups(digits, country.groups)
}

export function nationalNumber(country: PhoneCountry, raw: string): string {
  const digits = digitsOnly(raw)
  return country.trunkZero && digits.startsWith('0') ? digits.slice(1) : digits
}

/** Modèle de saisie affiché en placeholder (avec le 0 national si d'usage). */
export function phonePlaceholder(country: PhoneCountry): string {
  return formatNationalInput(country, country.trunkZero ? `0${country.example}` : country.example)
}

export type PhoneValidity =
  | { status: 'empty' }
  | { status: 'too-short'; min: number }
  | { status: 'too-long'; max: number }
  | { status: 'invalid' }
  | { status: 'valid'; e164: string }

export function phoneFieldValidity(value: PhoneFieldValue): PhoneValidity {
  if (value.iso === OTHER_COUNTRY_ISO) {
    if (!value.raw.trim()) return { status: 'empty' }
    const e164 = normalizeLoginPhone(value.raw)
    return e164 ? { status: 'valid', e164 } : { status: 'invalid' }
  }
  const country = findPhoneCountry(value.iso)
  if (!country) return { status: 'invalid' }
  const national = nationalNumber(country, value.raw)
  if (!national) return { status: 'empty' }
  if (national.length < country.min) return { status: 'too-short', min: country.min }
  if (national.length > country.max) return { status: 'too-long', max: country.max }
  if (country.pattern && !country.pattern.test(national)) return { status: 'invalid' }
  const e164 = normalizeLoginPhone(`+${country.dial}${national}`)
  return e164 ? { status: 'valid', e164 } : { status: 'invalid' }
}

export function phoneFieldE164(value: PhoneFieldValue): string | null {
  const validity = phoneFieldValidity(value)
  return validity.status === 'valid' ? validity.e164 : null
}

/**
 * Numéro collé ou tapé avec son indicatif (« +32 470… », « 0033 6… ») :
 * bascule sur le bon pays et ne garde que la partie nationale. Renvoie null
 * si la saisie n'est pas internationale.
 */
export function parseInternationalInput(text: string, currentIso: string): PhoneFieldValue | null {
  const trimmed = toAsciiDigits(text).trim()
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) return null
  const e164 = normalizeLoginPhone(trimmed)
  if (!e164) return { iso: OTHER_COUNTRY_ISO, raw: trimmed }
  const candidates = PHONE_COUNTRIES
    .filter(country => e164.startsWith(`+${country.dial}`))
    .sort((a, b) => b.dial.length - a.dial.length)
  if (!candidates.length) return { iso: OTHER_COUNTRY_ISO, raw: e164 }
  const longest = candidates.filter(country => country.dial.length === candidates[0].dial.length)
  // Indicatif partagé (+1 : États-Unis / Canada) : on garde le pays déjà choisi.
  const country = longest.find(item => item.iso === currentIso) ?? longest[0]
  return { iso: country.iso, raw: e164.slice(country.dial.length + 1) }
}

/** Valeur initiale depuis un E.164 connu (dernier numéro utilisé…). */
export function phoneFieldFromE164(e164: string, fallbackIso: string = DEFAULT_COUNTRY_ISO): PhoneFieldValue {
  return parseInternationalInput(e164, fallbackIso) ?? emptyPhoneFieldValue(fallbackIso)
}
