/**
 * Upload de pièces jointes vers Firebase Storage.
 *
 * Pattern de chemin :
 *   devoirs/{teacherUid}/{timestamp}_{filename}
 *   notes-imports/{teacherUid}/{timestamp}_{filename}
 *   annonces/{adminUid}/{timestamp}_{filename}   (affiches d'annonces)
 *
 * On stocke le download URL renvoyé par Firebase dans le document
 * Firestore correspondant (pas le path raw, parce que les URLs incluent
 * un token signé qui survit aux changements de rules).
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../config/firebase'

export interface Attachment {
  url:    string  // download URL Firebase
  name:   string  // nom de fichier original
  mime:   string  // type MIME ('image/jpeg', 'application/pdf', …)
  size?:  number  // taille en octets si connue
}

async function localUriToBlob(uri: string): Promise<Blob> {
  // En React Native, fetch() peut lire un file:// URI et retourner un Blob.
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`Lecture du fichier échouée (${res.status})`)
  return res.blob()
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

// Les pickers (expo-document-picker) ne renvoient pas toujours un mimeType ;
// les appelants tombaient alors sur 'application/octet-stream', désormais
// REFUSÉ par storage.rules (isAllowedDoc). On déduit un type réel depuis
// l'extension pour que l'upload passe sans rouvrir la faille du blob générique.
const EXT_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  txt:  'text/plain',
  csv:  'text/csv',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function resolveMime(mime: string, filename: string): string {
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return EXT_MIME[ext] || 'application/pdf'
}

export async function uploadAttachment(
  localUri: string,
  folder: 'devoirs' | 'notes-imports' | 'annonces' | 'ressources',
  teacherUid: string,
  filename: string,
  mime: string,
): Promise<Attachment> {
  const safe = sanitize(filename) || 'fichier'
  const resolvedMime = resolveMime(mime, safe)
  const path = `${folder}/${teacherUid}/${Date.now()}_${safe}`
  const fileRef = ref(storage, path)
  const blob = await localUriToBlob(localUri)
  await uploadBytes(fileRef, blob, { contentType: resolvedMime })
  const url = await getDownloadURL(fileRef)
  return { url, name: safe, mime: resolvedMime, size: (blob as any).size }
}
