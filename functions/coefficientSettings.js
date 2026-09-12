const { HttpsError } = require('firebase-functions/v2/https')
const { requireAdmin } = require('./statsDrilldown')
const { subjectEntry } = require('./collegeEvaluation')
const policy = require('./lib/collegeEvaluationPolicy.json')

function levelAliases(level) {
  const match = /^([123])(?:AC|APIC)$/i.exec(level)
  return match ? [`${match[1]}APIC`, `${match[1]}AC`] : [level]
}

function levelKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 50
    || /[./\[\]~*]/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) {
    throw new HttpsError('invalid-argument', 'Invalid level.')
  }
  return levelAliases(value.trim())[0]
}

function validateValues(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 100) {
    throw new HttpsError('invalid-argument', 'Invalid coefficients.')
  }
  const result = new Map()
  for (const [label, value] of Object.entries(raw)) {
    if (!label.trim() || label.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(label)
      || typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) {
      throw new HttpsError('invalid-argument', 'Coefficients must be greater than 0 and at most 100.')
    }
    const key = subjectEntry(label)?.canonical || label.trim()
    if (result.has(key)) throw new HttpsError('invalid-argument', 'Duplicate subject.')
    result.set(key, value)
  }
  return Object.fromEntries(result)
}

async function getCoefficientSettings(db, request) {
  await requireAdmin(db, request)
  const [config, students, teachers] = await Promise.all([
    db.collection('settings').doc('coefficients').get(),
    db.collection('eleves').select('niveau', 'active').get(),
    db.collection('users').where('role', '==', 'professeur').select('matiere').get(),
  ])
  const data = config.data() || {}
  const canonicalValues = values => Object.fromEntries(Object.entries(values || {}).map(([label, value]) => [subjectEntry(label)?.canonical || label, value]))
  const levels = new Set(Object.keys(data.parNiveau || {}).map(levelKey))
  students.docs.forEach(doc => { if (doc.get('active') !== false && doc.get('niveau')) levels.add(levelKey(doc.get('niveau'))) })
  const subjects = new Set(Object.values(policy.subjects).map(subject => subject.canonical))
  teachers.docs.forEach(doc => { const label = doc.get('matiere'); if (typeof label === 'string' && label.trim()) subjects.add(subjectEntry(label)?.canonical || label.trim()) })
  Object.values(data.parNiveau || {}).forEach(values => Object.keys(values).forEach(label => subjects.add(subjectEntry(label)?.canonical || label)))
  Object.keys(data.matieres || {}).forEach(label => subjects.add(subjectEntry(label)?.canonical || label))
  return {
    levels: [...levels].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })),
    subjects: [...subjects].sort((a, b) => a.localeCompare(b, 'fr')),
    parNiveau: Object.fromEntries(Object.entries(data.parNiveau || {}).map(([level, values]) => [level, canonicalValues(values)])),
    matieres: canonicalValues(data.matieres), revisions: data.levelRevisions || {},
  }
}

async function saveLevelCoefficients(db, request) {
  const uid = await requireAdmin(db, request)
  const input = request.data || {}
  const level = levelKey(input.niveau)
  const values = validateValues(input.values)
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new HttpsError('invalid-argument', 'Revision required.')
  }
  const ref = db.collection('settings').doc('coefficients')
  const revision = await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const config = snap.data() || {}
    const revisions = { ...(config.levelRevisions || {}) }
    const current = revisions[level] || 0
    if (current !== input.expectedRevision) throw new HttpsError('aborted', 'This level was modified. Reload before saving.')
    const parNiveau = { ...(config.parNiveau || {}) }
    // Both spellings occur in student records and existing coefficient grids.
    for (const alias of levelAliases(level)) {
      parNiveau[alias] = values
      revisions[alias] = current + 1
    }
    tx.set(ref, { ...config, parNiveau, levelRevisions: revisions, updatedAt: new Date(), updatedBy: uid })
    return current + 1
  })
  return { niveau: level, values, revision }
}

module.exports = { getCoefficientSettings, saveLevelCoefficients, levelAliases, validateValues }
