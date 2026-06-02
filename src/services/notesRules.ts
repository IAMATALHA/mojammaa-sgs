export interface ControlNote {
  numero: number
  label: string
  note: number
}

type CollegeLevel = '1AC' | '2AC' | '3AC'

const COLLEGE_CONTROLS: Record<string, Record<CollegeLevel, number>> = {
  arabe: { '1AC': 2, '2AC': 2, '3AC': 2 },
  francais: { '1AC': 4, '2AC': 4, '3AC': 4 },
  sociales: { '1AC': 3, '2AC': 3, '3AC': 2 },
  mathematiques: { '1AC': 3, '2AC': 3, '3AC': 3 },
  svt: { '1AC': 2, '2AC': 2, '3AC': 3 },
  physiqueChimie: { '1AC': 3, '2AC': 3, '3AC': 3 },
  educationIslamique: { '1AC': 2, '2AC': 2, '3AC': 2 },
  eps: { '1AC': 3, '2AC': 3, '3AC': 3 },
  educationFamiliale: { '1AC': 2, '2AC': 2, '3AC': 2 },
  artsPlastiques: { '1AC': 2, '2AC': 2, '3AC': 2 },
  educationMusicale: { '1AC': 2, '2AC': 2, '3AC': 2 },
  informatique: { '1AC': 3, '2AC': 3, '3AC': 3 },
  anglaisEspagnol: { '1AC': 0, '2AC': 0, '3AC': 2 },
}

function normalizeLabel(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getCollegeLevelFromClasse(classe?: string, niveau?: string): CollegeLevel | null {
  const value = normalizeLabel(`${classe || ''} ${niveau || ''}`)
  if (/\b1\s*(apic|ac|asc)\b/.test(value) || value.includes('premiere') || value.includes('الأولى')) return '1AC'
  if (/\b2\s*(apic|ac|asc)\b/.test(value) || value.includes('deuxieme') || value.includes('الثانية')) return '2AC'
  if (/\b3\s*(apic|ac|asc)\b/.test(value) || value.includes('troisieme') || value.includes('الثالثة')) return '3AC'
  return null
}

export function getSubjectRulesKey(matiere: string): string | null {
  const value = normalizeLabel(matiere)

  if (!value) return null
  if (value.includes('physique') && (value.includes('chimie') || value.includes('pc'))) return 'physiqueChimie'
  if (value.includes('فيزياء') || value.includes('كيمياء')) return 'physiqueChimie'
  if (value.includes('mathematique') || value.includes('math') || value.includes('رياض')) return 'mathematiques'
  if (value.includes('svt') || value.includes('vie') || value.includes('terre') || value.includes('علوم الحياة')) return 'svt'
  if (value.includes('franc')) return 'francais'
  if (value.includes('arab') || value.includes('عربية') || value.includes('العربية')) return 'arabe'
  if (value.includes('histoire') || value.includes('geo') || value.includes('social') || value.includes('اجتماع')) return 'sociales'
  if (value.includes('islam') || value.includes('اسلام')) return 'educationIslamique'
  if (value.includes('education physique') || value.includes('eps') || value.includes('sport') || value.includes('بدنية')) return 'eps'
  if (value.includes('familiale') || value.includes('اسرية') || value.includes('أسرية')) return 'educationFamiliale'
  if (value.includes('musique') || value.includes('موسيقى') || value.includes('موسيقية')) return 'educationMusicale'
  if (value.includes('arts') || value.includes('artistique') || value.includes('plastique') || value.includes('تشكيلية')) return 'artsPlastiques'
  if (value.includes('informatique') || value.includes('اعلاميات') || value.includes('إعلاميات')) return 'informatique'
  if (value.includes('anglais') || value.includes('english') || value.includes('espagnol') || value.includes('انجليزي') || value.includes('اسباني')) return 'anglaisEspagnol'
  if (value.includes('physique')) return 'physiqueChimie'

  return null
}

export function getExpectedControlsForSubject(matiere: string, classe?: string, niveau?: string): number | null {
  const level = getCollegeLevelFromClasse(classe, niveau)
  const key = getSubjectRulesKey(matiere)
  if (!level || !key) return null
  return COLLEGE_CONTROLS[key]?.[level] ?? null
}

export function roundGrade(value: number): number {
  return Math.round(value * 100) / 100
}

export function averageControlNotes(notes: number[]): number {
  if (notes.length === 0) return 0
  return roundGrade(notes.reduce((sum, value) => sum + value, 0) / notes.length)
}

export function formatGrade(value: number): string {
  return roundGrade(value).toFixed(2).replace(/\.?0+$/, '')
}

export function makeControlNotes(values: number[], labels?: string[]): ControlNote[] {
  return values.map((note, idx) => ({
    numero: idx + 1,
    label: labels?.[idx] || `Contrôle ${idx + 1}`,
    note: roundGrade(note),
  }))
}
