'use strict'

/**
 * Calcul réglementaire des évaluations du collège.
 *
 * Source de vérité structurelle : lib/collegeEvaluationPolicy.json.
 * Ce module reste sans dépendance Firebase afin d'être testable et réutilisable
 * par schoolStats/classStats et les callables de drill-down.
 */
const policy = require('./lib/collegeEvaluationPolicy.json')

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

function collegeLevel(classe, niveau) {
  const value = normalizeText(`${classe || ''} ${niveau || ''}`)
  if (/\b1\s*(apic|ac|asc)\b/.test(value) || value.includes('premiere') || value.includes('الأولى')) return '1AC'
  if (/\b2\s*(apic|ac|asc)\b/.test(value) || value.includes('deuxieme') || value.includes('الثانية')) return '2AC'
  if (/\b3\s*(apic|ac|asc)\b/.test(value) || value.includes('troisieme') || value.includes('الثالثة')) return '3AC'
  return null
}

function subjectEntry(matiere) {
  const needle = normalizeText(matiere)
  if (!needle) return null
  for (const [key, entry] of Object.entries(policy.subjects)) {
    const labels = [entry.canonical, ...(entry.aliases || [])].map(normalizeText)
    if (labels.includes(needle)) return { key, ...entry }
  }
  return null
}

function integratedActivityNote(evaluations, bareme) {
  const evaluation = Array.isArray(evaluations)
    ? evaluations.find((row) => {
      const category = String(row?.category || row?.type || '')
      return category === 'integrated' || category === 'integrated_activity'
    })
    : null
  const value = asNumber(evaluation?.note)
  return value != null && value >= 0 && value <= bareme ? value : null
}

function normalizedControls(rawControls, slots, bareme) {
  if (!Array.isArray(rawControls)) return []
  if (slots.length === 0) {
    return rawControls
      .map((item, index) => {
        const row = item && typeof item === 'object' ? item : { note: item }
        const note = asNumber(row.note)
        if (note == null || note < 0 || note > bareme) return null
        const numero = asNumber(row.numero ?? row.ordinal) ?? index + 1
        return {
          numero,
          slot: String(row.slot || row.id || `control_${numero}`),
          kind: String(row.kind || row.type || 'written'),
          label: String(row.label || `Contrôle ${numero}`),
          note,
          dateEvaluation: String(row.dateEvaluation || row.evaluationDate || ''),
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.numero - b.numero)
  }

  const slotByName = new Map(slots.map((slot) => [slot.slot, slot]))
  const slotIndex = new Map(slots.map((slot, index) => [slot.slot, index]))
  const bySlot = new Map()
  rawControls.forEach((item, index) => {
    const row = item && typeof item === 'object' ? item : { note: item }
    const note = asNumber(row.note)
    if (note == null || note < 0 || note > bareme) return

    const declaredSlot = String(row.slot || row.id || '')
    const rawOrdinal = asNumber(row.numero ?? row.ordinal)
    const ordinal = rawOrdinal != null ? Math.trunc(rawOrdinal) : index + 1
    // Un slot explicit inconnu est rejeté : le rabattre sur son ordinal ferait
    // passer une composante arbitraire pour un contrôle réglementaire.
    const slot = declaredSlot
      ? slotByName.get(declaredSlot)
      : slots[ordinal - 1]
    if (!slot || bySlot.has(slot.slot)) return

    const officialIndex = slotIndex.get(slot.slot)
    bySlot.set(slot.slot, {
      numero: officialIndex + 1,
      slot: slot.slot,
      kind: slot.kind,
      label: slot.label,
      note,
      dateEvaluation: String(row.dateEvaluation || row.evaluationDate || ''),
    })
  })
  return [...bySlot.values()].sort((a, b) => a.numero - b.numero)
}

function progressionStep(from, to) {
  return {
    fromSlot: from.slot,
    fromKind: from.kind,
    fromLabel: from.label,
    from: round2(from.note),
    toSlot: to.slot,
    toKind: to.kind,
    toLabel: to.label,
    to: round2(to.note),
    delta: round2(to.note - from.note),
  }
}

function controlProgression(controls, slots = []) {
  const bySlot = new Map(controls.map((control) => [control.slot, control]))
  const steps = []
  const comparableSteps = []

  if (slots.length > 0) {
    // Trajectoire d'affichage : uniquement deux slots réglementaires voisins.
    // Si C2 manque, C1 et C3 ne deviennent jamais artificiellement voisins.
    for (let index = 1; index < slots.length; index += 1) {
      const from = bySlot.get(slots[index - 1].slot)
      const to = bySlot.get(slots[index].slot)
      if (from && to) steps.push(progressionStep(from, to))
    }

    // Comparaisons pédagogiques : deux occurrences consécutives d'un même type
    // dans la grille officielle (ex. compréhension 1 → compréhension 2).
    const slotsByKind = new Map()
    slots.forEach((slot) => {
      const rows = slotsByKind.get(slot.kind) || []
      rows.push(slot)
      slotsByKind.set(slot.kind, rows)
    })
    slotsByKind.forEach((kindSlots) => {
      for (let index = 1; index < kindSlots.length; index += 1) {
        const from = bySlot.get(kindSlots[index - 1].slot)
        const to = bySlot.get(kindSlots[index].slot)
        if (from && to) comparableSteps.push(progressionStep(from, to))
      }
    })
    comparableSteps.sort((a, b) => {
      const aTo = slots.findIndex((slot) => slot.slot === a.toSlot)
      const bTo = slots.findIndex((slot) => slot.slot === b.toSlot)
      return aTo - bTo
    })
  } else {
    for (let index = 1; index < controls.length; index += 1) {
      const from = controls[index - 1]
      const to = controls[index]
      if (to.numero !== from.numero + 1) continue
      const step = progressionStep(from, to)
      steps.push(step)
      if (from.kind === to.kind) comparableSteps.push(step)
    }
  }
  const first = controls[0]
  const latest = controls[controls.length - 1]
  return {
    steps,
    comparableSteps,
    first: first ? round2(first.note) : null,
    latest: latest ? round2(latest.note) : null,
    delta: steps.length > 0 && first && latest && first !== latest
      ? round2(latest.note - first.note)
      : null,
    latestDelta: comparableSteps.length > 0
      ? comparableSteps[comparableSteps.length - 1].delta
      : null,
  }
}

function fallbackResult(data, bareme) {
  const rawControls = Array.isArray(data?.controles)
    ? data.controles
    : Array.isArray(data?.controls) ? data.controls : []
  const controls = normalizedControls(rawControls, [], bareme)
  const explicit = asNumber(data?.note)
  const controlAverage = average(controls.map((row) => row.note))
  const note = explicit != null && explicit >= 0 && explicit <= bareme
    ? explicit
    : controlAverage
  return {
    policyVersion: null,
    policyKey: null,
    canonicalSubject: String(data?.matiereLabel || data?.matiere || data?.subject || ''),
    level: null,
    formula: 'legacy',
    formulaLabel: 'Note enregistrée',
    note: note == null ? null : round2(note),
    writtenAverage: controlAverage == null ? null : round2(controlAverage),
    integratedActivitiesNote: null,
    integratedWeight: 0,
    controls,
    controlsExpected: null,
    controlsEntered: controls.length,
    componentsExpected: null,
    componentsEntered: controls.length,
    complete: note != null,
    provisional: false,
    completionRate: note == null ? 0 : 100,
    progression: controlProgression(controls),
  }
}

function calculateCollegeEvaluation(data) {
  const baremeRaw = asNumber(data?.bareme)
  const bareme = baremeRaw === 10 || baremeRaw === 20 ? baremeRaw : 20
  const subject = subjectEntry(data?.matiere || data?.matiereLabel || data?.subject)
  const level = collegeLevel(data?.classe, data?.niveau)
  if (!subject || !level) return fallbackResult(data, bareme)
  // Les documents historiques portent seulement une note finale. Même si une
  // ancienne version contient un tableau `controles`, ses éléments ne sont pas
  // typés : on ne peut pas deviner rétroactivement lequel était un final anglais
  // ou une activité intégrée. Seul le schéma v2 déclenche la formule officielle.
  const structured = Number(data?.schemaVersion) === 2
  if (!structured) return fallbackResult(data, bareme)

  const slots = subject.controlsByLevel[level] || []
  const evaluations = Array.isArray(data?.evaluations) ? data.evaluations : []
  const structuredEvaluations = evaluations.filter((row) => {
      const category = String(row?.category || row?.type || '')
      return category !== 'integrated' && category !== 'integrated_activity'
    })
  const controls = normalizedControls(structuredEvaluations, slots, bareme)
  // En v2, `evaluations` est l'unique source de vérité validée par les règles.
  // Les miroirs historiques (`activitesIntegrees`, `controls`, `controles`)
  // restent tolérés dans le document pour compatibilité d'affichage, mais ne
  // participent jamais au calcul réglementaire.
  const integratedNote = integratedActivityNote(evaluations, bareme)
  const integratedWeight = Number(subject.integratedWeightByLevel[level] || 0)
  const needsIntegrated = integratedWeight > 0
  const writtenAverage = average(controls.map((row) => row.note))

  let note = null
  let formulaLabel = ''
  if (subject.formula === 'english_three_blocks') {
    const shortAverage = average(controls.filter((row) => row.kind === 'short').map((row) => row.note))
    const finalNote = controls.find((row) => row.kind === 'final')?.note ?? null
    const blocks = [shortAverage, finalNote, integratedNote].filter((value) => value != null)
    note = average(blocks)
    formulaLabel = '(moyenne des contrôles courts + contrôle final + activités intégrées) ÷ 3'
  } else {
    if (writtenAverage != null && integratedNote != null && needsIntegrated) {
      note = (writtenAverage * (1 - integratedWeight)) + (integratedNote * integratedWeight)
    } else {
      note = writtenAverage ?? integratedNote
    }
    formulaLabel = needsIntegrated
      ? `moyenne des évaluations × ${Math.round((1 - integratedWeight) * 100)} % + activités intégrées × ${Math.round(integratedWeight * 100)} %`
      : 'moyenne des contrôles écrits'
  }

  const complete = controls.length >= slots.length && (!needsIntegrated || integratedNote != null)
  const expectedComponents = slots.length + (needsIntegrated ? 1 : 0)
  const enteredComponents = Math.min(controls.length, slots.length) + (needsIntegrated && integratedNote != null ? 1 : 0)

  return {
    policyVersion: policy.version,
    policyKey: subject.key,
    canonicalSubject: subject.canonical,
    level,
    formula: subject.formula,
    formulaLabel,
    note: note == null ? null : round2(note),
    writtenAverage: writtenAverage == null ? null : round2(writtenAverage),
    integratedActivitiesNote: integratedNote,
    integratedWeight,
    controls,
    controlsExpected: slots.length,
    controlsEntered: Math.min(controls.length, slots.length),
    componentsExpected: expectedComponents,
    componentsEntered: enteredComponents,
    complete,
    provisional: note != null && !complete,
    completionRate: expectedComponents > 0
      ? Math.round((enteredComponents / expectedComponents) * 100)
      : 0,
    progression: controlProgression(controls, slots),
  }
}

module.exports = {
  EVALUATION_POLICY: policy,
  calculateCollegeEvaluation,
  collegeLevel,
  normalizeText,
  subjectEntry,
}
