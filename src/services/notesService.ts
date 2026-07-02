import {
  collection, query, where, onSnapshot, doc, getDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { averageControlNotes, type ControlNote } from './notesRules'

export type CompetenceValue = 'Acquis' | 'En cours' | 'Non acquis'

export interface NoteDoc {
  id: string
  eleveId: string
  codeMassar: string
  classe: string
  semestre: string
  matiere: string
  matiereLabel: string
  note: number | null
  competence: CompetenceValue | null
  cycle: 'prescolaire' | 'primaire' | 'college' | ''
  bareme: 10 | 20 | null
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

function asCompetence(v: unknown): CompetenceValue | null {
  const value = asString(v)
  if (value === 'Acquis' || value === 'En cours' || value === 'Non acquis') return value
  return null
}

function asCycle(v: unknown): NoteDoc['cycle'] {
  const value = asString(v).toLowerCase()
  if (value === 'prescolaire' || value === 'primaire' || value === 'college') return value
  return ''
}

function asBareme(v: unknown): 10 | 20 | null {
  const n = asNumber(v)
  return n === 10 || n === 20 ? n : null
}

function asControlNotes(v: unknown): ControlNote[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const note = asNumber(row.note) ?? asNumber(item)
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
  const controles = asControlNotes(data.controles ?? data.controls)
  const note = asNumber(data.note) ?? (controles.length > 0 ? averageControlNotes(controles.map(item => item.note)) : null)
  const competence = asCompetence(data.note)
  const hasValidNote = note != null && note >= 0 && note <= 20
  if (!hasValidNote && !competence) return null
  return {
    id,
    eleveId: asString(data.eleveId),
    codeMassar: asString(data.codeMassar) || asString(data.eleveId),
    classe: asString(data.classe),
    semestre: asString(data.semestre),
    matiere: asString(data.matiereLabel) || asString(data.matiere),
    matiereLabel: asString(data.matiereLabel) || asString(data.matiere),
    note: hasValidNote ? note : null,
    competence,
    cycle: asCycle(data.cycle),
    bareme: asBareme(data.bareme),
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
  bareme:      10 | 20 | null
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
    bareme:      asBareme(data.bareme),
  }
}
