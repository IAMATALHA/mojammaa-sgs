/**
 * Fichiers d'un devoir ou d'une ressource supprimé(e) (contre-audit
 * 2026-10-15, C08) : ils restaient servis à vie par leur URL à jeton, et le
 * professeur ne pouvait pas les effacer lui-même.
 *
 * Seuls les fichiers du dossier de l'auteur (`devoirs/{uid}/`,
 * `ressources/{uid}/`) sont visés. Le site publie une même ressource dans
 * plusieurs classes (un document par classe, MÊME fichier) : un fichier encore
 * cité par un autre document du même auteur est conservé.
 */
const STORAGE_URL = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/

function storagePath(url) {
  const match = typeof url === 'string' ? STORAGE_URL.exec(url) : null
  if (!match) return null
  try { return { bucket: match[1], path: decodeURIComponent(match[2]) } } catch { return null }
}

/** Fichiers à effacer : dans le dossier de l'auteur et cités par aucun autre document. */
async function orphanedAttachments(db, { collection, folder, data, docId }) {
  const ownerId = typeof data?.teacherId === 'string' ? data.teacherId : ''
  const attachments = Array.isArray(data?.attachments) ? data.attachments : []
  if (!ownerId || ownerId.includes('/') || attachments.length === 0) return []
  const prefix = `${folder}/${ownerId}/`
  const candidates = attachments
    .map(item => storagePath(item?.url))
    .filter(file => file && file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/'))
  if (candidates.length === 0) return []
  const siblings = await db.collection(collection).where('teacherId', '==', ownerId).get()
  const stillUsed = new Set()
  siblings.docs.filter(d => d.id !== docId).forEach(d => {
    const list = d.get('attachments')
    if (Array.isArray(list)) list.forEach(item => { const file = storagePath(item?.url); if (file) stillUsed.add(file.path) })
  })
  const unique = new Map(candidates.map(file => [file.path, file]))
  return [...unique.values()].filter(file => !stillUsed.has(file.path))
}

async function deleteOrphanedAttachments(db, storage, input) {
  // Le bucket du projet seulement : une URL d'un autre bucket est ignorée.
  const bucketName = storage.bucket().name
  const files = (await orphanedAttachments(db, input)).filter(file => file.bucket === bucketName)
  await Promise.all(files.map(file => storage.bucket(file.bucket).file(file.path).delete({ ignoreNotFound: true })))
  return files.length
}

module.exports = { storagePath, orphanedAttachments, deleteOrphanedAttachments }
