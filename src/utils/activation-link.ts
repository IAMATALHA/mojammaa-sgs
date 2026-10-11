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

/** Écran de la pile de connexion qui traite ce lien. */
export function activationScreen(link: ActivationLink): 'ParentActivation' | 'AccountActivation' {
  return link.kind === 'parent' ? 'ParentActivation' : 'AccountActivation'
}

/** Route d'une pile, telle que React Navigation la lit dans un `reset`. */
export type StackRoute = { name: string; key?: string; params?: object }

/**
 * Pile de connexion après un lien : toujours « Login » puis l'écran du lien.
 * La route « Login » déjà montée garde sa clé (saisie conservée) ; l'écran
 * d'activation est une NOUVELLE route à chaque lien : un deuxième lien ne
 * retrouve ni le code ni la vérification en cours du premier, et « J'ai déjà
 * un compte » revient bien à la connexion.
 */
export function authRoutesForLink(
  routes: readonly StackRoute[] | undefined,
  link: ActivationLink,
): { index: number; routes: StackRoute[] } {
  const mounted = routes?.find(route => route.name === 'Login')
  const login: StackRoute = mounted ? { key: mounted.key, name: 'Login', params: mounted.params } : { name: 'Login' }
  return { index: 1, routes: [login, { name: activationScreen(link), params: { code: link.code } }] }
}
