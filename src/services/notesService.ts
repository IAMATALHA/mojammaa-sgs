import {
  collection, query, where, onSnapshot, doc, getDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { averageControlNotes, type ControlNote } from './notesRules'

export interface NoteDoc {
  id: string
  eleveId: string
  codeMassar: string
  classe: string
  semestre: string
  matiere: string
  matiereLabel: string
  note: number
  controles: ControlNote[]
  controlesCount: number
  controlesExpected: number | null
  controlesIgnored: number
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}

function asControlNotes(v: unknown): ControlNote[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const note = asNumber(row.note)
      if (note == null || note < 0 || note > 20) return null
      const numero = asNumber(row.numero) ?? index + 1
      return {
        numero,
        label: asString(row.label) || `Contrôle ${numero}`,
        note,
      }
    })
    .filter((item): item is ControlNote => item != null)
}

function docToNote(id: string, data: Record<string, unknown>): NoteDoc | null {
  const controles = asControlNotes(data.controles)
  const note = asNumber(data.note) ?? (controles.length > 0 ? averageControlNotes(controles.map(item => item.note)) : null)
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
    controles,
    controlesCount: asNumber(data.controlesCount) ?? controles.length,
    controlesExpected: asNumber(data.controlesExpected),
    controlesIgnored: asNumber(data.controlesIgnored) ?? 0,
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

/**
 * Agrégat ANONYME d'une (classe, semestre), maintenu côté serveur par la CF
 * `onNoteWritten` (functions/classStats.js). Remplace l'ancien getClassNotes()
 * qui téléchargeait les notes brutes de TOUTE la classe (confidentialité) —
 * ne pas réintroduire de lecture classe entière côté parent.
 */
export interface ClassStatsDoc {
  classe:      string
  semestre:    string
  subjectAvgs: Record<string, number>  // moyenne de classe par matiereLabel
  studentAvgs: number[]                // moyennes d'élèves, triées desc, anonymes
  students:    number
  notesCount:  number
}

export async function getClassStats(classe: string, semestre: string): Promise<ClassStatsDoc | null> {
  const id = `${classe}_${semestre}`.replace(/\//g, '_')
  const snap = await getDoc(doc(db, 'classStats', id))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  return {
    classe:      asString(data.classe) || classe,
    semestre:    asString(data.semestre) || semestre,
    subjectAvgs: data.subjectAvgs && typeof data.subjectAvgs === 'object'
      ? data.subjectAvgs as Record<string, number> : {},
    studentAvgs: Array.isArray(data.studentAvgs)
      ? data.studentAvgs.filter((v): v is number => typeof v === 'number') : [],
    students:    asNumber(data.students) ?? 0,
    notesCount:  asNumber(data.notesCount) ?? 0,
  }
}
