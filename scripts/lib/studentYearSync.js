'use strict'

function normalizeAcademicYear(value) {
  const academicYear = typeof value === 'string' ? value.trim() : ''
  const match = academicYear.match(/^(\d{4})-(\d{4})$/)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error('Année scolaire invalide. Format attendu : YYYY-YYYY (ex. 2026-2027).')
  }
  return academicYear
}

function isStudentActive(student) {
  return student?.active !== false
}

function studentKey(student) {
  const value = student?.codeMassar || student?.id
  return typeof value === 'string' ? value.trim() : ''
}

function buildStudentYearSyncPlan({
  existingStudents = [],
  importedStudents = [],
  academicYear,
  archiveMissing = false,
}) {
  const normalizedYear = normalizeAcademicYear(academicYear)
  if (!Array.isArray(importedStudents) || importedStudents.length === 0) {
    throw new Error('Aucun élève importé : synchronisation annulée.')
  }

  const importedByKey = new Map()
  for (const student of importedStudents) {
    const key = studentKey(student)
    if (!key) throw new Error('Un élève importé ne possède pas de code MASSAR.')
    if (importedByKey.has(key)) {
      throw new Error('Le fichier contient au moins un code MASSAR dupliqué.')
    }
    importedByKey.set(key, student)
  }

  const existingByKey = new Map()
  for (const student of existingStudents) {
    const key = studentKey(student)
    if (!key) continue
    if (existingByKey.has(key)) {
      throw new Error('La base Firestore contient au moins un code MASSAR dupliqué.')
    }
    existingByKey.set(key, student)
  }

  const toUpsert = [...importedByKey.values()]
  const toArchive = archiveMissing
    ? [...existingByKey.entries()]
        .filter(([key, student]) => !importedByKey.has(key) && isStudentActive(student))
        .map(([, student]) => student)
    : []

  let newCount = 0
  let reactivatedCount = 0
  for (const key of importedByKey.keys()) {
    const existing = existingByKey.get(key)
    if (!existing) newCount++
    else if (!isStudentActive(existing)) reactivatedCount++
  }

  return {
    academicYear: normalizedYear,
    toUpsert,
    toArchive,
    counts: {
      imported: toUpsert.length,
      existing: existingByKey.size,
      new: newCount,
      updated: toUpsert.length - newCount - reactivatedCount,
      reactivated: reactivatedCount,
      archived: toArchive.length,
      alreadyArchived: [...existingByKey.values()]
        .filter(student => !isStudentActive(student) && !importedByKey.has(studentKey(student)))
        .length,
    },
  }
}

function assertArchiveConfirmation(expectedCount, providedValue) {
  const provided = Number(providedValue)
  if (!Number.isInteger(provided) || provided !== expectedCount) {
    throw new Error(
      `Confirmation d'archivage invalide. Attendu : --confirm-archive=${expectedCount}`,
    )
  }
}

module.exports = {
  assertArchiveConfirmation,
  buildStudentYearSyncPlan,
  isStudentActive,
  normalizeAcademicYear,
}
