/**
 * Parse Excel/CSV pour importer les notes d'une classe.
 *
 * Format attendu (1 ligne par élève) :
 *   codeMassar | nom | prenom | note (sur 20)
 *
 * Ou plus lâche : on cherche dans chaque ligne 2 valeurs textuelles
 * (nom/prenom) + 1 valeur numérique (la note). Le rapprochement avec
 * la collection eleves se fait par codeMassar si présent, sinon par
 * nom+prenom (normalisé).
 */
import * as XLSX from 'xlsx'

export interface ParsedNoteRow {
  codeMassar?: string
  nom?:        string
  prenom?:     string
  note:        number
  rawLine:     number
}

function normalize(s: any): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function parseNote(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(',', '.').replace(/[^\d.]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse un fichier (uri local) et retourne les lignes interprétables.
 * Auto-détecte si le fichier est CSV ou XLSX en regardant le mime + nom.
 */
export async function parseNotesFile(uri: string, mime: string): Promise<ParsedNoteRow[]> {
  const res  = await fetch(uri)
  const buf  = await res.arrayBuffer()
  const data = new Uint8Array(buf)

  const wb    = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  // header: 1 → array of arrays
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: '' })

  const parsed: ParsedNoteRow[] = []
  rows.forEach((row, idx) => {
    if (!Array.isArray(row) || row.length === 0) return
    // Cherche une valeur numérique = la note
    let note: number | null = null
    const texts: string[] = []
    let codeMassar: string | undefined
    for (const cell of row) {
      const txt = String(cell ?? '').trim()
      // codeMassar : commence par lettre + chiffres
      if (/^[A-Za-z]\d{6,}$/.test(txt)) {
        codeMassar = txt.toUpperCase()
        continue
      }
      const n = parseNote(cell)
      if (n != null && n <= 20 && n >= 0 && note == null) {
        note = n
      } else if (txt) {
        texts.push(txt)
      }
    }
    if (note == null) return  // ligne sans note → ignorée (entête etc.)
    parsed.push({
      codeMassar,
      nom:    texts[0],
      prenom: texts[1],
      note,
      rawLine: idx + 1,
    })
  })
  return parsed
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
  // Dernier fallback : une seule chaîne de texte qui contient nom+prenom
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
