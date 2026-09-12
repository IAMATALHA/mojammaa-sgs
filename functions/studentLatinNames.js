const { HttpsError } = require('firebase-functions/v2/https')

const FIELDS = ['nomLatin', 'prenomLatin', 'nomFr', 'prenomFr']
const clean = value => typeof value === 'string' ? value.trim().normalize('NFC') : ''
const validName = value => typeof value === 'string' && value.length <= 100
  && (!value || /^(?=.*\p{Script=Latin})[\p{Script=Latin}\p{M} .’'\-]+$/u.test(value))

// Automatic imports must never replace an existing spelling, including legacy aliases.
function preserveLatinNames(existing, incoming) {
  const patch = {}
  for (const part of ['nom', 'prenom']) {
    const canonical = clean(existing?.[`${part}Latin`])
    const legacy = clean(existing?.[`${part}Fr`])
    const generated = clean(incoming?.[`${part}Latin`])
    patch[`${part}Latin`] = canonical || legacy || generated
    patch[`${part}Fr`] = legacy || canonical || generated
  }
  return patch
}

async function updateStudentLatinNames(db, request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const rows = request.data?.rows
  const userRef = db.collection('users').doc(request.auth.uid)
  // Role check precedes payload validation and is repeated inside the transaction.
  if ((await userRef.get()).get('role') !== 'admin') throw new HttpsError('permission-denied', 'Admin only.')
  if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw new HttpsError('invalid-argument', 'Invalid row count.')
  const codes = new Set(), ids = new Set()
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || row.id.includes('/') || row.id.length > 150
      || !/^[A-Z]\d{9}$/.test(row.codeMassar || '') || ids.has(row.id) || codes.has(row.codeMassar)
      || !row.expected || FIELDS.some(key => typeof row.expected[key] !== 'string')
      || !validName(row.nomLatin) || !validName(row.prenomLatin)
      || (!clean(row.nomLatin) && !clean(row.prenomLatin))) {
      throw new HttpsError('invalid-argument', 'Invalid or duplicate row.')
    }
    ids.add(row.id); codes.add(row.codeMassar)
  }
  return db.runTransaction(async tx => {
    if ((await tx.get(userRef)).get('role') !== 'admin') throw new HttpsError('permission-denied', 'Admin only.')
    const changes = []
    for (const row of rows) {
      const matches = await tx.get(db.collection('eleves').where('codeMassar', '==', row.codeMassar))
      if (matches.docs.length !== 1 || matches.docs[0].id !== row.id || matches.docs[0].get('active') === false) {
        throw new HttpsError('failed-precondition', 'Student matching changed. Review the file again.')
      }
      const current = matches.docs[0]
      if (FIELDS.some(key => clean(current.get(key)) !== row.expected[key])) {
        throw new HttpsError('aborted', 'Names changed. Review the file again.')
      }
      const patch = {}
      for (const part of ['nom', 'prenom']) {
        const value = clean(row[`${part}Latin`])
        // Empty Excel cells preserve BOTH existing fields, even a legacy conflict.
        if (value) {
          patch[`${part}Latin`] = value
          patch[`${part}Fr`] = value
        }
      }
      changes.push({ ref: current.ref, patch })
    }
    // All matching and concurrency checks complete before the first write.
    for (const { ref, patch } of changes) tx.update(ref, patch)
    return { updated: changes.length }
  })
}

module.exports = { updateStudentLatinNames, preserveLatinNames }
