import type { Attachment } from '../services/StorageService'

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
    return [{ url, name, mime, ...(typeof size === 'number' && Number.isFinite(size) && size >= 0 ? { size } : {}) }]
  })
}
