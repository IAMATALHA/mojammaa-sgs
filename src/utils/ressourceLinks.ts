/**
 * Ressources pédagogiques : types et liens externes.
 *
 * Les règles Firestore ne contrôlent pas le contenu des liens : la garde est
 * ici, à la lecture comme à l'écriture, comme pour les pièces jointes (audit
 * 2026-09-28, F7). Seuls les sites de RESSOURCE_LINK_HOSTS, en https, sont
 * acceptés. Même liste que le site (mojammaa-admin src/utils/ressourceData.ts) :
 * toute modification se reporte des deux côtés.
 *
 * Pas d'objet URL ici : celui de React Native n'implémente pas `hostname`.
 * L'expression est volontairement stricte (ni identifiants, ni port, domaine
 * ASCII uniquement) ; les adresses écrites par le site, déjà normalisées,
 * y passent.
 */

export const RESSOURCE_TYPES = ['cours', 'resume', 'exercices', 'correction', 'video', 'evaluation', 'autre'] as const
export type RessourceType = typeof RESSOURCE_TYPES[number]

export const RESSOURCE_LIMITS = { titre: 100, description: 1000, chapitre: 80, links: 5, linkLabel: 80 }

export const RESSOURCE_LINK_HOSTS = [
  'youtube.com', 'youtu.be',
  'drive.google.com', 'docs.google.com',
  'geogebra.org', 'khanacademy.org', 'wikipedia.org', 'phet.colorado.edu',
  'alloschool.com', 'men.gov.ma',
] as const

export interface RessourceLink { url: string; label: string; host: string }

const HTTPS_URL = /^https:\/\/([a-z0-9.-]+)([/?#][^\s]*)?$/i

export function isRessourceType(value: unknown): value is RessourceType {
  return typeof value === 'string' && (RESSOURCE_TYPES as readonly string[]).includes(value)
}

/**
 * Adresse saisie → adresse https et domaine affichable, ou null si le site
 * n'est pas accepté. « youtu.be/abc » est compris comme « https://youtu.be/abc ».
 */
export function normalizeLink(input: string): { url: string; host: string } | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  const match = HTTPS_URL.exec(withScheme)
  if (!match) return null
  const host = match[1].toLowerCase().replace(/\.$/, '')
  if (!RESSOURCE_LINK_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return null
  const rest = match[2] ?? '/'
  return { url: `https://${host}${rest.startsWith('/') ? rest : `/${rest}`}`, host: host.replace(/^www\./, '') }
}

/** Liens lus en base : les adresses refusées disparaissent, le libellé est borné. */
export function safeLinks(raw: unknown): RessourceLink[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const { url, label } = item as Record<string, unknown>
    const link = typeof url === 'string' ? normalizeLink(url) : null
    if (!link) return []
    const text = typeof label === 'string' ? label.trim().slice(0, RESSOURCE_LIMITS.linkLabel) : ''
    return [{ url: link.url, host: link.host, label: text || link.host }]
  }).slice(0, RESSOURCE_LIMITS.links)
}

/**
 * Texte comparable pour la recherche : casse, accents latins et voyelles
 * arabes retirés, hamza, tâ marbouta et alif maqsoura unifiées.
 */
export function foldSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
}
