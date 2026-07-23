import policyJson from '../../functions/lib/collegeEvaluationPolicy.json'

export type CollegeLevel = '1AC' | '2AC' | '3AC'

export interface ControlSlot {
  slot: string
  kind: string
  label: string
}

export interface ControlNote {
  numero: number
  label: string
  note: number
  slot?: string
  kind?: string
  dateEvaluation?: string
}

export interface IntegratedActivityNote {
  note: number
  label: string
  dateEvaluation?: string
}

export interface EvaluationComponent {
  slot: string
  category: 'control' | 'integrated'
  kind: string
  ordinal: number
  label: string
  note: number
  bareme: 10 | 20
  evaluationDate?: string
}

interface PolicySubject {
  canonical: string
  aliases: string[]
  formula: 'weighted_blocks' | 'english_three_blocks'
  controlsByLevel: Record<CollegeLevel, ControlSlot[]>
  integratedWeightByLevel: Record<CollegeLevel, number>
}

interface CollegePolicy {
  academicYear: string
  version: string
  source: string
  subjects: Record<string, PolicySubject>
}

export interface EvaluationRule {
  policyVersion: string
  policyKey: string
  canonicalSubject: string
  level: CollegeLevel
  formula: PolicySubject['formula']
  formulaLabel: string
  controls: ControlSlot[]
  integratedWeight: number
  integratedRequired: boolean
}

export interface ControlProgressionStep {
  fromSlot: string
  fromKind: string
  fromLabel: string
  from: number
  toSlot: string
  toKind: string
  toLabel: string
  to: number
  delta: number
}

export interface EvaluationResult {
  note: number | null
  writtenAverage: number | null
  integratedActivitiesNote: number | null
  complete: boolean
  provisional: boolean
  completionRate: number
  controlsExpected: number
  controlsEntered: number
  componentsExpected: number
  componentsEntered: number
  formulaLabel: string
  progression: {
    steps: ControlProgressionStep[]
    comparableSteps: ControlProgressionStep[]
    first: number | null
    latest: number | null
    delta: number | null
    latestDelta: number | null
  }
}

export const COLLEGE_EVALUATION_POLICY = policyJson as CollegePolicy

function normalizeLabel(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

export function getCollegeLevelFromClasse(classe?: string, niveau?: string): CollegeLevel | null {
  const value = normalizeLabel(`${classe || ''} ${niveau || ''}`)
  if (/\b1\s*(apic|ac|asc)\b/.test(value) || value.includes('premiere') || value.includes('الأولى')) return '1AC'
  if (/\b2\s*(apic|ac|asc)\b/.test(value) || value.includes('deuxieme') || value.includes('الثانية')) return '2AC'
  if (/\b3\s*(apic|ac|asc)\b/.test(value) || value.includes('troisieme') || value.includes('الثالثة')) return '3AC'
  return null
}

export function getSubjectRulesKey(matiere: string): string | null {
  const needle = normalizeLabel(matiere)
  if (!needle) return null
  for (const [key, subject] of Object.entries(COLLEGE_EVALUATION_POLICY.subjects)) {
    const labels = [subject.canonical, ...subject.aliases].map(normalizeLabel)
    if (labels.includes(needle)) return key
  }
  return null
}

function formulaLabel(subject: PolicySubject, level: CollegeLevel): string {
  const integratedWeight = subject.integratedWeightByLevel[level] || 0
  if (subject.formula === 'english_three_blocks') {
    return '(moyenne des contrôles courts + contrôle final + activités intégrées) ÷ 3'
  }
  if (integratedWeight > 0) {
    return `moyenne des évaluations × ${Math.round((1 - integratedWeight) * 100)} % + activités intégrées × ${Math.round(integratedWeight * 100)} %`
  }
  return 'moyenne des contrôles écrits'
}

export function getEvaluationRule(
  matiere: string,
  classe?: string,
  niveau?: string,
): EvaluationRule | null {
  const level = getCollegeLevelFromClasse(classe, niveau)
  const key = getSubjectRulesKey(matiere)
  if (!level || !key) return null
  const subject = COLLEGE_EVALUATION_POLICY.subjects[key]
  const controls = subject.controlsByLevel[level] || []
  const integratedWeight = subject.integratedWeightByLevel[level] || 0
  return {
    policyVersion: COLLEGE_EVALUATION_POLICY.version,
    policyKey: key,
    canonicalSubject: subject.canonical,
    level,
    formula: subject.formula,
    formulaLabel: formulaLabel(subject, level),
    controls,
    integratedWeight,
    integratedRequired: integratedWeight > 0,
  }
}

export function getExpectedControlsForSubject(matiere: string, classe?: string, niveau?: string): number | null {
  return getEvaluationRule(matiere, classe, niveau)?.controls.length ?? null
}

export function roundGrade(value: number): number {
  return Math.round(value * 100) / 100
}

export function averageControlNotes(notes: number[]): number {
  return roundGrade(average(notes) ?? 0)
}

export function formatGrade(value: number): string {
  return roundGrade(value).toFixed(2).replace(/\.?0+$/, '')
}

export function makeControlNotes(values: number[], labels?: string[], slots?: ControlSlot[]): ControlNote[] {
  return values.map((note, idx) => ({
    numero: idx + 1,
    label: labels?.[idx] || slots?.[idx]?.label || `Contrôle ${idx + 1}`,
    note: roundGrade(note),
    ...(slots?.[idx]?.slot ? { slot: slots[idx].slot, kind: slots[idx].kind } : {}),
  }))
}

export function alignControlsWithRule(
  controles: ControlNote[],
  rule: EvaluationRule | null,
): ControlNote[] {
  if (!rule) return controles.map((control, index) => ({ ...control, numero: index + 1 }))
  const expectedSlots = new Set(rule.controls.map(slot => slot.slot))
  const bySlot = new Map<string, ControlNote>()
  controles.forEach(control => {
    if (!control.slot || !expectedSlots.has(control.slot) || bySlot.has(control.slot)) return
    bySlot.set(control.slot, control)
  })
  return rule.controls.flatMap((slot, index) => {
    const existing = bySlot.get(slot.slot)
      || controles.find(control => !control.slot && control.numero === index + 1)
    if (!existing) return []
    return [{
      ...existing,
      numero: index + 1,
      slot: slot.slot,
      kind: slot.kind,
      label: slot.label,
    }]
  })
}

function progressionStep(from: ControlNote, to: ControlNote): ControlProgressionStep {
  return {
    fromSlot: from.slot || `control_${from.numero}`,
    fromKind: from.kind || 'written',
    fromLabel: from.label,
    from: roundGrade(from.note),
    toSlot: to.slot || `control_${to.numero}`,
    toKind: to.kind || 'written',
    toLabel: to.label,
    to: roundGrade(to.note),
    delta: roundGrade(to.note - from.note),
  }
}

function controlProgression(
  controls: ControlNote[],
  rule: EvaluationRule,
): EvaluationResult['progression'] {
  const bySlot = new Map(controls.flatMap(control =>
    control.slot ? [[control.slot, control] as const] : []))
  const steps: ControlProgressionStep[] = []
  for (let index = 1; index < rule.controls.length; index += 1) {
    const from = bySlot.get(rule.controls[index - 1].slot)
    const to = bySlot.get(rule.controls[index].slot)
    if (from && to) steps.push(progressionStep(from, to))
  }

  const comparableSteps: ControlProgressionStep[] = []
  const slotsByKind = new Map<string, ControlSlot[]>()
  rule.controls.forEach(slot => {
    const rows = slotsByKind.get(slot.kind) || []
    rows.push(slot)
    slotsByKind.set(slot.kind, rows)
  })
  slotsByKind.forEach(slots => {
    for (let index = 1; index < slots.length; index += 1) {
      const from = bySlot.get(slots[index - 1].slot)
      const to = bySlot.get(slots[index].slot)
      if (from && to) comparableSteps.push(progressionStep(from, to))
    }
  })
  comparableSteps.sort((a, b) =>
    rule.controls.findIndex(slot => slot.slot === a.toSlot)
    - rule.controls.findIndex(slot => slot.slot === b.toSlot))

  const first = controls[0]
  const latest = controls[controls.length - 1]
  return {
    steps,
    comparableSteps,
    first: first ? roundGrade(first.note) : null,
    latest: latest ? roundGrade(latest.note) : null,
    delta: steps.length > 0 && first && latest && first !== latest
      ? roundGrade(latest.note - first.note)
      : null,
    latestDelta: comparableSteps.length > 0
      ? comparableSteps[comparableSteps.length - 1].delta
      : null,
  }
}

export function calculateCollegeEvaluation({
  matiere,
  classe,
  niveau,
  controles,
  integratedActivity,
}: {
  matiere: string
  classe?: string
  niveau?: string
  controles: ControlNote[]
  integratedActivity?: IntegratedActivityNote | null
}): EvaluationResult | null {
  const rule = getEvaluationRule(matiere, classe, niveau)
  if (!rule) return null
  const aligned = alignControlsWithRule(controles, rule)
  const writtenAverage = average(aligned.map(control => control.note))
  const integratedNote = integratedActivity?.note ?? null

  let note: number | null
  if (rule.formula === 'english_three_blocks') {
    const shortAverage = average(aligned.filter(control => control.kind === 'short').map(control => control.note))
    const finalNote = aligned.find(control => control.kind === 'final')?.note ?? null
    note = average([shortAverage, finalNote, integratedNote].filter((value): value is number => value != null))
  } else if (writtenAverage != null && integratedNote != null && rule.integratedRequired) {
    note = (writtenAverage * (1 - rule.integratedWeight)) + (integratedNote * rule.integratedWeight)
  } else {
    // Une composante future absente ne vaut jamais zéro. La moyenne courante
    // est provisoire et se calcule uniquement sur ce qui est réellement saisi.
    note = writtenAverage ?? integratedNote
  }

  const complete = aligned.length >= rule.controls.length
    && (!rule.integratedRequired || integratedNote != null)
  const expected = rule.controls.length + (rule.integratedRequired ? 1 : 0)
  const entered = Math.min(aligned.length, rule.controls.length)
    + (rule.integratedRequired && integratedNote != null ? 1 : 0)

  return {
    note: note == null ? null : roundGrade(note),
    writtenAverage: writtenAverage == null ? null : roundGrade(writtenAverage),
    integratedActivitiesNote: integratedNote,
    complete,
    provisional: note != null && !complete,
    completionRate: expected > 0 ? Math.round((entered / expected) * 100) : 0,
    controlsExpected: rule.controls.length,
    controlsEntered: Math.min(aligned.length, rule.controls.length),
    componentsExpected: expected,
    componentsEntered: entered,
    formulaLabel: rule.formulaLabel,
    progression: controlProgression(aligned, rule),
  }
}

export function buildEvaluationComponents(
  rule: EvaluationRule,
  controles: ControlNote[],
  integratedActivity: IntegratedActivityNote | null,
  bareme: 10 | 20,
): EvaluationComponent[] {
  const aligned = alignControlsWithRule(controles, rule)
  const controls: EvaluationComponent[] = aligned.map((control, index) => ({
    slot: control.slot || rule.controls[index]?.slot || `control_${index + 1}`,
    category: 'control',
    kind: control.kind || rule.controls[index]?.kind || 'written',
    ordinal: index + 1,
    label: control.label,
    note: roundGrade(control.note),
    bareme,
    ...(control.dateEvaluation ? { evaluationDate: control.dateEvaluation } : {}),
  }))
  if (!integratedActivity) return controls
  return [
    ...controls,
    {
      slot: 'integrated_activities',
      category: 'integrated',
      kind: 'integrated_activity',
      ordinal: rule.controls.length + 1,
      label: integratedActivity.label,
      note: roundGrade(integratedActivity.note),
      bareme,
      ...(integratedActivity.dateEvaluation
        ? { evaluationDate: integratedActivity.dateEvaluation }
        : {}),
    },
  ]
}
