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

export async function uploadAttachment(
  localUri: string,
  folder: 'devoirs' | 'notes-imports' | 'annonces' | 'ressources',
  teacherUid: string,
  filename: string,
  mime: string,
): Promise<Attachment> {
  const safe = sanitize(filename) || 'fichier'
  const path = `${folder}/${teacherUid}/${Date.now()}_${safe}`
  const fileRef = ref(storage, path)
  const blob = await localUriToBlob(localUri)
  await uploadBytes(fileRef, blob, { contentType: mime })
  const url = await getDownloadURL(fileRef)
  return { url, name: safe, mime, size: (blob as any).size }
}
