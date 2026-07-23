'use strict'

const {
  calculateCollegeEvaluation,
  normalizeText,
  subjectEntry,
} = require('./collegeEvaluation')

const round1 = (value) => Math.round(value * 10) / 10
const progressionOutcome = (delta) =>
  delta >= 0.5 ? 'improved' : delta <= -0.5 ? 'declined' : 'stable'

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function baremeOf(row) {
  if (Number(row?.bareme) === 10) return 10
  if (asString(row?.cycle).toLowerCase() === 'primaire' || /aep/i.test(asString(row?.classe))) return 10
  return 20
}

function sameSubject(value, requested) {
  const requestedEntry = subjectEntry(requested)
  const valueEntry = subjectEntry(value)
  if (requestedEntry && valueEntry) return requestedEntry.key === valueEntry.key
  return normalizeText(value) === normalizeText(requested)
}

/**
 * Retourne la cohorte appariée d'une transition réglementaire précise.
 * La Map reste interne au serveur : seuls les admins reçoivent ensuite la
 * projection minimale des élèves via getStatsStudents.
 */
function gradeProgressStudents(notes, selection) {
  const rows = new Map()
  ;(notes || []).forEach((row) => {
    if (asString(row.semestre) !== selection.semestre) return
    const evaluation = calculateCollegeEvaluation(row)
    if (!evaluation.policyVersion) return
    const subject = evaluation.canonicalSubject
      || asString(row.matiereLabel)
      || asString(row.matiere)
      || asString(row.subject)
    if (!sameSubject(subject, selection.matiere)) return
    const step = (evaluation.progression?.comparableSteps || []).find((candidate) =>
      candidate.fromSlot === selection.fromSlot && candidate.toSlot === selection.toSlot)
    if (!step) return

    const factor = 20 / baremeOf(row)
    const rawFrom = step.from * factor
    const rawTo = step.to * factor
    const rawDelta = step.delta * factor
    // Le classement se fait sur la précision source. Arrondir d'abord ferait
    // basculer +0,46 vers +0,5 dans le drill-down alors que la carte l'avait
    // classé « stable ». Seul le payload d'affichage est arrondi.
    const outcome = progressionOutcome(rawDelta)
    if (outcome !== selection.outcome) return
    const eleveId = asString(row.eleveId)
    if (!eleveId) return
    rows.set(eleveId, {
      matiere: subject,
      semestre: selection.semestre,
      fromLabel: step.fromLabel,
      toLabel: step.toLabel,
      from: round1(rawFrom),
      to: round1(rawTo),
      delta: round1(rawDelta),
      outcome,
    })
  })
  return rows
}

function gradeProgress(notes, semestre) {
  const groups = new Map()
  ;(notes || [])
    .filter((row) => !semestre || asString(row.semestre) === semestre)
    .forEach((row) => {
      const evaluation = calculateCollegeEvaluation(row)
      if (!evaluation.policyVersion) return
      const subject = evaluation.canonicalSubject || asString(row.matiereLabel) || asString(row.matiere)
      const semester = asString(row.semestre) || '—'
      const key = `${subject}\u0000${semester}`
      const current = groups.get(key) || {
        matiere: subject,
        semestre: semester,
        formula: evaluation.formula,
        integratedWeight: evaluation.integratedWeight,
        formulaLabel: evaluation.formulaLabel,
        slots: new Map(),
        documents: 0,
        complete: 0,
        provisional: 0,
        entered: 0,
        expected: 0,
        transitions: new Map(),
      }
      const factor = 20 / baremeOf(row)
      current.documents++
      current.complete += evaluation.complete ? 1 : 0
      current.provisional += evaluation.provisional ? 1 : 0
      current.entered += evaluation.componentsEntered || 0
      current.expected += evaluation.componentsExpected || 0
      ;(evaluation.controls || []).forEach((control) => {
        const slot = current.slots.get(control.slot) || {
          slot: control.slot,
          label: control.label,
          numero: control.numero,
          sum: 0,
          count: 0,
        }
        slot.sum += control.note * factor
        slot.count++
        current.slots.set(control.slot, slot)
      })
      ;(evaluation.progression?.comparableSteps || []).forEach((step) => {
        const eleveId = asString(row.eleveId)
        if (!eleveId) return
        const transitionKey = `${step.fromSlot}\u0000${step.toSlot}`
        const transition = current.transitions.get(transitionKey) || {
          fromSlot: step.fromSlot,
          fromKind: step.fromKind,
          fromLabel: step.fromLabel,
          fromNumero: evaluation.controls.find((row) => row.slot === step.fromSlot)?.numero || 0,
          toSlot: step.toSlot,
          toKind: step.toKind,
          toLabel: step.toLabel,
          toNumero: evaluation.controls.find((row) => row.slot === step.toSlot)?.numero || 0,
          fromSum: 0,
          toSum: 0,
          deltaSum: 0,
          comparableStudents: 0,
          improved: 0,
          stable: 0,
          declined: 0,
          students: new Set(),
        }
        // Le compteur affiché est un compteur d'ÉLÈVES et doit être identique
        // à la cohorte ouverte. Un doublon documentaire ne pèse jamais deux
        // fois dans le nombre « ont progressé ».
        if (transition.students.has(eleveId)) return
        transition.students.add(eleveId)
        const from = step.from * factor
        const to = step.to * factor
        const delta = step.delta * factor
        transition.fromSum += from
        transition.toSum += to
        transition.deltaSum += delta
        transition.comparableStudents++
        const outcome = progressionOutcome(delta)
        if (outcome === 'improved') transition.improved++
        else if (outcome === 'declined') transition.declined++
        else transition.stable++
        current.transitions.set(transitionKey, transition)
      })
      groups.set(key, current)
    })

  return [...groups.values()]
    .map((group) => {
      const transitions = [...group.transitions.values()]
        .sort((a, b) => a.toNumero - b.toNumero || a.fromNumero - b.fromNumero)
        .map((transition) => ({
          fromSlot: transition.fromSlot,
          fromKind: transition.fromKind,
          fromLabel: transition.fromLabel,
          toSlot: transition.toSlot,
          toKind: transition.toKind,
          toLabel: transition.toLabel,
          fromAverage: round1(transition.fromSum / transition.comparableStudents),
          toAverage: round1(transition.toSum / transition.comparableStudents),
          delta: round1(transition.deltaSum / transition.comparableStudents),
          comparableStudents: transition.comparableStudents,
          improved: transition.improved,
          stable: transition.stable,
          declined: transition.declined,
        }))
      const latestTransition = transitions[transitions.length - 1] || null
      return {
        matiere: group.matiere,
        semestre: group.semestre,
        formula: group.formula,
        integratedWeight: group.integratedWeight,
        formulaLabel: group.formulaLabel,
        controls: [...group.slots.values()]
        .sort((a, b) => a.numero - b.numero)
        .map((slot) => ({
          slot: slot.slot,
          label: slot.label,
          average: round1(slot.sum / slot.count),
          entered: slot.count,
        })),
        transitions,
        documents: group.documents,
        complete: group.complete,
        provisional: group.provisional,
        componentsEntered: group.entered,
        componentsExpected: group.expected,
        coverageRate: group.expected > 0 ? Math.round((group.entered / group.expected) * 100) : 0,
        comparableStudents: latestTransition?.comparableStudents || 0,
        improved: latestTransition?.improved || 0,
        stable: latestTransition?.stable || 0,
        declined: latestTransition?.declined || 0,
        latestDelta: latestTransition?.delta ?? null,
      }
    })
    .sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr') || a.semestre.localeCompare(b.semestre))
}

module.exports = { gradeProgress, gradeProgressStudents }
