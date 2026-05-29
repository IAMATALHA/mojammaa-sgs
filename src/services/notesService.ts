import {
  collection, query, where, onSnapshot, getDocs,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export interface NoteDoc {
  id: string
  eleveId: string
  codeMassar: string
  classe: string
  semestre: string
  matiere: string
  matiereLabel: string
  note: number
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}

function docToNote(id: string, data: Record<string, unknown>): NoteDoc | null {
  const note = asNumber(data.note)
  if (note == null || note < 0 || note > 20) return null
  return {
    id,
    eleveId: asString(data.eleveId),
    codeMassar: asString(data.codeMassar) || asString(data.eleveId),
    classe: asString(data.classe),
    semestre: asString(data.semestre),
    matiere: asString(data.matiereLabel) || asString(data.matiere),
    matiereLabel: asString(data.matiereLabel) || asString(data.matiere),
    note,
  }
}

export function subscribeNotesForEleve(
  eleveId: string,
  onChange: (notes: NoteDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'notes'), where('eleveId', '==', eleveId)),
    snap => {
      const list: NoteDoc[] = []
      snap.docs.forEach(d => {
        const n = docToNote(d.id, d.data() as Record<string, unknown>)
        if (n) list.push(n)
      })
      onChange(list)
    },
    err => onError?.(err),
  )
}

export async function getClassNotes(classe: string, semestre: string): Promise<NoteDoc[]> {
  const snap = await getDocs(
    query(collection(db, 'notes'), where('classe', '==', classe), where('semestre', '==', semestre)),
  )
  const list: NoteDoc[] = []
  snap.docs.forEach(d => {
    const n = docToNote(d.id, d.data() as Record<string, unknown>)
    if (n) list.push(n)
  })
  return list
}
