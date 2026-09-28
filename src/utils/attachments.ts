import type { Attachment } from '../services/StorageService'

// Seuls les fichiers déposés par l'app (URL de téléchargement Firebase de son
// bucket) sont affichés ou ouverts : une URL externe permettait de charger une
// image depuis un serveur tiers ou d'ouvrir un lien trompeur (audit 2026-09-28, F7).
const APP_FILE_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/'

/**
 * Pièces jointes lues en base : ne garder que celles dont url, name et mime sont des textes.
 * Une écriture malveillante (compte compromis) ou ancienne ne doit jamais faire planter un
 * écran : l'app appelle mime.startsWith et affiche name. Une taille invalide est ignorée.
 */
export function safeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const { url, name, mime, size } = item as Record<string, unknown>
    if (typeof url !== 'string' || typeof name !== 'string' || typeof mime !== 'string') return []
    if (!url.startsWith(APP_FILE_PREFIX)) return []
    return [{ url, name, mime, ...(typeof size === 'number' && Number.isFinite(size) && size >= 0 ? { size } : {}) }]
  })
}
