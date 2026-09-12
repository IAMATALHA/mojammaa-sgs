const stamp = value => value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis()
  : value && typeof value.seconds === 'number' ? value.seconds * 1000 + (value.nanoseconds || 0) / 1e6
    : value && typeof value._seconds === 'number' ? value._seconds * 1000 + (value._nanoseconds || 0) / 1e6 : null

function attendanceVersion(record) {
  if (!record) return 'missing'
  return JSON.stringify([
    record.attendanceVersion || '', record.statut || '', record.professorId || '',
    stamp(record.createdAt), stamp(record.updatedAt), record.justified ?? null, record.raison || '',
  ])
}
function lessonKey(slot) {
  return ['v1', slot.day, slot.startTime, slot.endTime ?? '', slot.durationMin ?? '',
    slot.classe, slot.subject ?? '', slot.room ?? ''].map(v => encodeURIComponent(String(v).trim())).join('|')
}
function sessionCode(slot) {
  const explicit = slot.seance?.trim()
  if (explicit) return /^s\d+$/i.test(explicit) ? explicit.toUpperCase() : explicit
  return { '08:15': 'S1', '09:15': 'S2', '08:30': 'S1', '09:30': 'S2', '09:40': 'S2', '10:30': 'S3', '10:50': 'S3', '11:30': 'S4', '13:00': 'S5', '14:00': 'S6' }[slot.startTime.trim()] || null
}
module.exports = { attendanceVersion, lessonKey, sessionCode }
