/**
 * Liens d'activation ouverts dans l'application (Android App Links, à partir
 * du build 1.0.18) : `mojammaa.com/parents/activer#CODE` (parent) et
 * `mojammaa.com/activer#CODE` (professeur ; le code décide du parcours).
 *
 * Fonction pure, testée seule (tests/services/activationLink.test.mjs). Les
 * deux chemins sont ceux déclarés dans app.json (android.intentFilters) et
 * prouvés par mojammaa.com/.well-known/assetlinks.json. Le code voyage après
 * « # » : il n'est jamais envoyé au serveur du site.
 */
export type ActivationLink = {
  /** `parent` : code d'un élève ; `account` : « Activer mon compte ». */
  kind: 'parent' | 'account'
  /** `ABC-DEFG-HIJ`, ou vide si le lien n'en porte pas d'entier. */
  code: string
}

const LINK = /^https:\/\/mojammaa\.com\/(parents\/activer|activer)\/?(?:\?[^#]*)?(?:#(.*))?$/i

export function parseActivationLink(url: string | null | undefined): ActivationLink | null {
  const match = LINK.exec((url ?? '').trim())
  if (!match) return null
  let fragment = match[2] ?? ''
  try { fragment = decodeURIComponent(fragment) } catch { /* fragment gardé tel quel */ }
  // Même normalisation que le serveur : 10 lettres ou chiffres, tirets ignorés.
  const code = fragment.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return {
    kind: match[1].toLowerCase() === 'activer' ? 'account' : 'parent',
    code: code.length === 10 ? `${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}` : '',
  }
}
