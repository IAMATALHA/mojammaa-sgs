const { HttpsError } = require('firebase-functions/v2/https')
const { STAFF_ROLE, hasRight } = require('./staffRights')

/**
 * Teachers may read only current students of their assigned classes.
 * Personnel administratif : tout élève s'il porte la case « élèves », et dans
 * le dossier seulement ce que ses autres cases ouvrent (`sees`).
 */
async function requireStudentFileAccess(db, request, eleveId) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const user = await db.collection('users').doc(uid).get()
  const role = user.get('role')
  const profile = { role, droits: user.get('droits') }
  const staff = role === STAFF_ROLE
  if (!user.exists || !(['admin', 'professeur'].includes(role) || (staff && hasRight(profile, 'eleves.voir')))) {
    throw new HttpsError('permission-denied', 'Access denied.')
  }
  const student = await db.collection('eleves').doc(eleveId).get()
  const classes = [...(Array.isArray(user.get('classes')) ? user.get('classes') : []), user.get('classe')].filter(Boolean)
  if (!student.exists || student.get('active') === false
    || (role === 'professeur' && !classes.includes(student.get('classe')))) {
    throw new HttpsError('not-found', 'Student not found in scope.')
  }
  return {
    uid, role, classe: student.get('classe'), matiere: user.get('matiere') || '',
    // Admin et professeur : inchangé (le professeur est borné à sa matière plus bas).
    sees: {
      grades: !staff || hasRight(profile, 'notes.voir'),
      attendance: !staff || hasRight(profile, 'absences.voir'),
      behavior: !staff || hasRight(profile, 'comportements.voir'),
    },
  }
}

function restrictStudentFileGrades(cache, access) {
  if (access.role === 'admin') return cache
  if (access.role === STAFF_ROLE) {
    // Toute l'école, mais seulement les domaines cochés. Les devoirs n'ont pas
    // de case : ils ne nourrissent jamais le dossier vu par le personnel.
    return {
      ...cache,
      devoirs: [], homeworkSubmissions: [],
      ...(access.sees.grades ? {} : { notes: [], followUpNotes: [] }),
      ...(access.sees.attendance ? {} : { absences: [] }),
    }
  }
  // Exact subject constraint mirrors Firestore notes rules, including no-subject profiles.
  const allowed = row => access.matiere && row.classe === access.classe && row.matiere === access.matiere
  return { ...cache, notes: cache.notes.filter(allowed), followUpNotes: cache.followUpNotes.filter(allowed) }
}

module.exports = { requireStudentFileAccess, restrictStudentFileGrades }
