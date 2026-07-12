/**
 * Parse Excel/CSV pour importer les notes d'une classe.
 *
 * Format attendu (1 ligne par élève) :
 *   codeMassar | nom | prenom | note(s) (sur le barème de la classe)
 *
 * En format MASSAR, on lit uniquement les colonnes officielles "النقطة"
 * associées aux contrôles, puis on applique le plafond matière/niveau fourni
 * par l'écran d'import.
 */
// xlsx (~400 Ko) chargé à la demande dans parseNotesFile — pas au démarrage de
// l'écran Notes (cf. audit perf 23/06/2026).
import type * as XLSXType from 'xlsx'
import {
  averageControlNotes,
  makeControlNotes,
  type ControlNote,
} from './notesRules'

export interface ParsedNoteRow {
  codeMassar?: string
  nom?:        string
  prenom?:     string
  note:        number
  controles:   ControlNote[]
  ignoredControls: ControlNote[]
  detectedControlsCount: number
  rawLine:     number
}

export interface ParseNotesOptions {
  maxControls?: number | null
  maxGrade?: number
}

// Défense en profondeur (batch sécurité 6, 2026-07-12) : le fichier importé est
// une entrée NON FIABLE parsée sur l'appareil. Même après passage à SheetJS
// 0.20.3 (corrige les CVE prototype-pollution + ReDoS de xlsx@0.18.5), on borne
// l'entrée AVANT parsing pour couper tout DoS mémoire/CPU par fichier gonflé ou
// forgé. Un relevé de notes de classe réel = quelques Ko / des dizaines de
// lignes ; ces plafonds sont très larges.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024   // 5 Mo
const MAX_IMPORT_ROWS   = 5000

export class NotesImportError extends Error {
  constructor(public readonly code: 'too_large' | 'too_many_rows', message: string) {
    super(message)
    this.name = 'NotesImportError'
  }
}

interface ControlSlot {
  label: string
  note: number | null
}

function normalize(s: any): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function parseNote(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const raw = String(v).trim()
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(raw)) return null
  const s = raw.replace(',', '.').replace(/[^\d.]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function parseGrade(v: any, maxGrade = 20): number | null {
  const n = parseNote(v)
  return n != null && n >= 0 && n <= maxGrade ? n : null
}

function asText(v: any): string {
  return String(v ?? '').trim()
}

function isMassarCode(value: string): boolean {
  return /^[A-Za-z]\d{6,}$/.test(value)
}

function splitName(fullName: string): { nom?: string; prenom?: string } {
  const parts = fullName.split(/\s+/).filter(Boolean)
  return { nom: parts[0], prenom: parts.slice(1).join(' ') || undefined }
}

function controlLabel(value: string, index: number): string {
  const txt = value.trim()
  return txt || `Contrôle ${index + 1}`
}

function buildParsedRow(
  base: Pick<ParsedNoteRow, 'codeMassar' | 'nom' | 'prenom' | 'rawLine'>,
  slots: ControlSlot[],
  maxControls?: number | null,
): ParsedNoteRow | null {
  const limit = typeof maxControls === 'number' ? Math.max(0, maxControls) : slots.length
  const allowedSlots = slots.slice(0, limit)
  const ignoredSlots = slots.slice(limit)
  const allowedWithNotes = allowedSlots.filter(slot => slot.note != null)
  const ignoredWithNotes = ignoredSlots.filter(slot => slot.note != null)
  const values = allowedWithNotes.map(slot => slot.note as number)
  const labels = allowedWithNotes.map(slot => slot.label)
  const ignoredValues = ignoredWithNotes.map(slot => slot.note as number)
  const ignoredLabels = ignoredWithNotes.map(slot => slot.label)

  if (values.length === 0) return null

  return {
    ...base,
    note: averageControlNotes(values),
    controles: makeControlNotes(values, labels),
    ignoredControls: makeControlNotes(ignoredValues, ignoredLabels),
    detectedControlsCount: slots.length,
  }
}

function findMassarSubHeaderRow(rows: any[][]): number {
  return rows.findIndex(row =>
    Array.isArray(row) &&
    row.some(cell => asText(cell).includes('النقطة')) &&
    row.some(cell => asText(cell).includes('التغيب')),
  )
}

function parseMassarRows(rows: any[][], maxControls?: number | null, maxGrade = 20): ParsedNoteRow[] {
  const subHeaderIdx = findMassarSubHeaderRow(rows)
  if (subHeaderIdx < 1) return []

  const labelRow = rows[subHeaderIdx - 1] || []
  const subRow = rows[subHeaderIdx] || []
  const noteColumns = subRow
    .map((cell, col) => ({ cell: asText(cell), col }))
    .filter(item => item.cell.includes('النقطة'))
    .map((item, idx) => ({
      col: item.col,
      label: controlLabel(asText(labelRow[item.col]), idx),
    }))

  if (noteColumns.length === 0) return []

  const parsed: ParsedNoteRow[] = []
  rows.slice(subHeaderIdx + 1).forEach((row, offset) => {
    if (!Array.isArray(row) || row.length === 0) return
    const massarIdx = row.findIndex(cell => isMassarCode(asText(cell)))
    if (massarIdx < 0) return

    const codeMassar = asText(row[massarIdx]).toUpperCase()
    const nameParts = splitName(asText(row[massarIdx + 1]))
    const slots = noteColumns.map(column => ({
      label: column.label,
      note: parseGrade(row[column.col], maxGrade),
    }))
    const parsedRow = buildParsedRow({
      codeMassar,
      nom: nameParts.nom,
      prenom: nameParts.prenom,
      rawLine: subHeaderIdx + offset + 2,
    }, slots, maxControls)
    if (parsedRow) parsed.push(parsedRow)
  })

  return parsed
}

function isNoteHeader(value: string): boolean {
  const txt = normalize(value)
  return (
    txt.includes('note') ||
    txt.includes('controle') ||
    txt.includes('contrôle') ||
    txt.includes('فرض') ||
    txt.includes('الفرض') ||
    txt.includes('النقطة') ||
    /^#\d+#$/.test(txt)
  )
}

function parseGenericHeaderRows(rows: any[][], maxControls?: number | null, maxGrade = 20): ParsedNoteRow[] {
  const headerIdx = rows.findIndex(row =>
    Array.isArray(row) && row.filter(cell => isNoteHeader(asText(cell))).length > 0,
  )
  if (headerIdx < 0) return []

  const header = rows[headerIdx] || []
  const noteColumns = header
    .map((cell, col) => ({ col, label: asText(cell) }))
    .filter(item => isNoteHeader(item.label))
  if (noteColumns.length === 0) return []

  const codeIdx = header.findIndex(cell => normalize(cell).includes('massar') || normalize(cell).includes('code'))
  const nomIdx = header.findIndex(cell => normalize(cell) === 'nom' || normalize(cell).startsWith('nom '))
  const prenomIdx = header.findIndex(cell => normalize(cell).includes('prenom') || normalize(cell).includes('prénom'))
  const noteColSet = new Set(noteColumns.map(column => column.col))

  const parsed: ParsedNoteRow[] = []
  rows.slice(headerIdx + 1).forEach((row, offset) => {
    if (!Array.isArray(row) || row.length === 0) return
    const codeMassar = codeIdx >= 0 && isMassarCode(asText(row[codeIdx]))
      ? asText(row[codeIdx]).toUpperCase()
      : row.map(asText).find(isMassarCode)?.toUpperCase()
    const texts = row
      .map((cell, idx) => ({ text: asText(cell), idx }))
      .filter(item => item.text && !noteColSet.has(item.idx))
      .filter(item => !isMassarCode(item.text))
      .filter(item => parseGrade(item.text, maxGrade) == null)
      .map(item => item.text)

    const slots = noteColumns.map((column, idx) => ({
      label: controlLabel(column.label, idx),
      note: parseGrade(row[column.col], maxGrade),
    }))
    const parsedRow = buildParsedRow({
      codeMassar,
      nom: nomIdx >= 0 ? asText(row[nomIdx]) : texts[0],
      prenom: prenomIdx >= 0 ? asText(row[prenomIdx]) : texts[1],
      rawLine: headerIdx + offset + 2,
    }, slots, maxControls)
    if (parsedRow) parsed.push(parsedRow)
  })

  return parsed
}

function parseLooseRows(rows: any[][], maxControls?: number | null, maxGrade = 20): ParsedNoteRow[] {
  const parsed: ParsedNoteRow[] = []
  rows.forEach((row, idx) => {
    if (!Array.isArray(row) || row.length === 0) return

    const texts: string[] = []
    const values: number[] = []
    let codeMassar: string | undefined

    for (const cell of row) {
      const txt = asText(cell)
      if (isMassarCode(txt)) {
        codeMassar = txt.toUpperCase()
        continue
      }
      const n = parseGrade(cell, maxGrade)
      if (n != null) {
        values.push(n)
      } else if (txt) {
        texts.push(txt)
      }
    }

    const slots = values.map((note, noteIdx) => ({
      label: `Contrôle ${noteIdx + 1}`,
      note,
    }))
    const parsedRow = buildParsedRow({
      codeMassar,
      nom: texts[0],
      prenom: texts[1],
      rawLine: idx + 1,
    }, slots, maxControls)
    if (parsedRow) parsed.push(parsedRow)
  })
  return parsed
}

/**
 * Parse un fichier (uri local) et retourne les lignes interprétables.
 * Auto-détecte si le fichier est CSV ou XLSX en regardant le mime + nom.
 */
export async function parseNotesFile(uri: string, mime: string, options: ParseNotesOptions = {}): Promise<ParsedNoteRow[]> {
  const res  = await fetch(uri)
  const buf  = await res.arrayBuffer()
  // Plafond de taille AVANT de charger/parser le contenu (entrée non fiable).
  if (buf.byteLength > MAX_IMPORT_BYTES) {
    throw new NotesImportError('too_large',
      `Fichier trop volumineux (${Math.round(buf.byteLength / 1024 / 1024)} Mo, max 5 Mo).`)
  }
  const data = new Uint8Array(buf)

  const XLSX: typeof XLSXType = await import('xlsx')
  const wb    = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: '' })
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new NotesImportError('too_many_rows',
      `Trop de lignes (${rows.length}, max ${MAX_IMPORT_ROWS}).`)
  }
  const maxControls = options.maxControls
  const maxGrade = options.maxGrade ?? 20

  const massarRows = parseMassarRows(rows, maxControls, maxGrade)
  if (massarRows.length > 0) return massarRows

  const genericHeaderRows = parseGenericHeaderRows(rows, maxControls, maxGrade)
  if (genericHeaderRows.length > 0) return genericHeaderRows

  return parseLooseRows(rows, maxControls, maxGrade)
}

export function matchToEleve<E extends { id: string; nom: string; prenom: string; codeMassar?: string }>(
  row: ParsedNoteRow,
  eleves: E[],
): E | null {
  if (row.codeMassar) {
    const e = eleves.find(x => (x.codeMassar || '').toUpperCase() === row.codeMassar)
    if (e) return e
  }
  if (row.nom && row.prenom) {
    const nNom = normalize(row.nom), nPre = normalize(row.prenom)
    const e = eleves.find(x =>
      (normalize(x.nom) === nNom && normalize(x.prenom) === nPre) ||
      (normalize(x.nom) === nPre && normalize(x.prenom) === nNom)
    )
    if (e) return e
  }
  // Dernier fallback : une seule chaîne de texte qui contient nom+prenom.
  if (row.nom && !row.prenom) {
    const full = normalize(row.nom)
    const e = eleves.find(x =>
      normalize(`${x.nom} ${x.prenom}`) === full ||
      normalize(`${x.prenom} ${x.nom}`) === full
    )
    if (e) return e
  }
  return null
}
