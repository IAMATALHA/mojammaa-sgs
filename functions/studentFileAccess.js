const { HttpsError } = require('firebase-functions/v2/https')

/** Teachers may read only current students of their assigned classes. */
async function requireStudentFileAccess(db, request, eleveId) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const user = await db.collection('users').doc(uid).get()
  const role = user.get('role')
  if (!user.exists || !['admin', 'professeur'].includes(role)) {
    throw new HttpsError('permission-denied', 'Access denied.')
  }
  const student = await db.collection('eleves').doc(eleveId).get()
  const classes = [...(Array.isArray(user.get('classes')) ? user.get('classes') : []), user.get('classe')].filter(Boolean)
  if (!student.exists || student.get('active') === false
    || (role === 'professeur' && !classes.includes(student.get('classe')))) {
    throw new HttpsError('not-found', 'Student not found in scope.')
  }
  return { uid, role, classe: student.get('classe'), matiere: user.get('matiere') || '' }
}

function restrictStudentFileGrades(cache, access) {
  if (access.role === 'admin') return cache
  // Exact subject constraint mirrors Firestore notes rules, including no-subject profiles.
  const allowed = row => access.matiere && row.classe === access.classe && row.matiere === access.matiere
  return { ...cache, notes: cache.notes.filter(allowed), followUpNotes: cache.followUpNotes.filter(allowed) }
}

module.exports = { requireStudentFileAccess, restrictStudentFileGrades }
