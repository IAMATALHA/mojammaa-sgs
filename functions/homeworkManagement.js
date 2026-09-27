const fail = (code) => { throw Object.assign(new Error(code), { code }) }
// Pièces jointes : uniquement les fichiers envoyés par l'app (StorageService → devoirs/{uid}/…).
const ATTACHMENT_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/devoirs%2F'
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // même plafond que storage.rules
// Le chemin d'objet est entièrement encodé (%2F) : un « / », « \ » ou « # » brut, ou un
// segment « . »/« .. », ferait sortir l'URL normalisée du bucket (…/o/devoirs%2F../../../b/autre).
const safeObjectPath = url => {
  const [objectPath] = url.slice(ATTACHMENT_PREFIX.length).split('?')
  return !/[/\\#]/.test(objectPath) && !/(^|%2F)(\.|%2E){1,2}(%2F|$)/i.test(objectPath)
}

function period(date) {
  const [year, month] = date.split('-').map(Number)
  const start = month >= 9 ? year : year - 1
  return { academicYear: `${start}-${start + 1}`, semestre: month >= 9 || month <= 1 ? 'S1' : 'S2', monthKey: date.slice(0, 7) }
}

function validateChanges(value) {
  if (!value || typeof value.titre !== 'string' || !value.titre.trim() || value.titre.length > 100
    || typeof value.description !== 'string' || value.description.length > 1000
    || !['Maison', 'Contrôle', 'Révision', 'Projet'].includes(value.type)
    || typeof value.dateLimite !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateLimite)
    || !Number.isFinite(Date.parse(value.dateLimite))
    || new Date(value.dateLimite).toISOString().slice(0, 10) !== value.dateLimite
    || !Array.isArray(value.attachments) || value.attachments.length > 20) fail('invalid-argument')
  const attachments = value.attachments.map(a => {
    if (!a || typeof a.url !== 'string' || !a.url.startsWith(ATTACHMENT_PREFIX) || !safeObjectPath(a.url) || a.url.length > 2048
      || typeof a.name !== 'string' || a.name.length > 200 || typeof a.mime !== 'string' || a.mime.length > 100
      || (a.size !== undefined && (!Number.isFinite(a.size) || a.size < 0 || a.size > MAX_ATTACHMENT_BYTES))) fail('invalid-argument')
    return { url: a.url, name: a.name, mime: a.mime, ...(a.size !== undefined ? { size: a.size } : {}) }
  })
  return { titre: value.titre.trim(), description: value.description.trim(), type: value.type, dateLimite: value.dateLimite, attachments, ...period(value.dateLimite) }
}

/** Atomic edit/removal, with an idempotency receipt and notification in the same commit. */
async function manageHomework(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  if (!input || !['edit', 'remove'].includes(input.action)
    || !/^[\w-]{1,128}$/.test(input.id || '') || !/^[\w-]{1,128}$/.test(input.commandId || '')
    || !Number.isFinite(input.version)) fail('invalid-argument')
  const changes = input.action === 'edit' ? validateChanges(input.changes) : null
  const ref = db.doc(`devoirs/${input.id}`)
  const receipt = db.doc(`homeworkCommands/${uid}_${input.commandId}`)
  return db.runTransaction(async tx => {
    const [user, previous, snapshot] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)), tx.get(receipt), tx.get(ref),
    ])
    if (!['admin', 'professeur'].includes(user.get('role'))) fail('permission-denied')
    if (previous.exists) return previous.get('result')
    if (!snapshot.exists) fail('not-found')
    const old = snapshot.data()
    if (user.get('role') !== 'admin' && old.teacherId !== uid) fail('permission-denied')
    if (old.cancelledAt) fail('failed-precondition')
    // Le SDK web renvoie des millisecondes fractionnaires (toMillis non arrondi) ;
    // l'Admin SDK arrondit à l'inférieur. On compare donc à la milliseconde près.
    if ((old.updatedAt?.toMillis?.() || 0) !== Math.floor(input.version)) fail('failed-precondition')
    let result = { status: 'updated' }
    if (changes) {
      if (Object.keys(changes).every(key => JSON.stringify(changes[key]) === JSON.stringify(old[key]))) {
        tx.create(receipt, { result, createdAt: now })
        return result
      }
      tx.update(ref, { ...changes, updatedAt: now, updatedBy: uid })
    } else {
      const submissions = await tx.get(db.collection('homeworkSubmissions').where('homeworkId', '==', input.id).limit(1))
      result = { status: submissions.empty ? 'deleted' : 'cancelled' }
      if (submissions.empty) tx.delete(ref)
      else tx.update(ref, { cancelledAt: now, cancelledBy: uid, updatedAt: now })
    }
    // A date/type/attachment change always alerts families. Text-only corrections may be silent.
    const structuralChange = changes && ['dateLimite', 'type', 'attachments'].some(key => JSON.stringify(changes[key]) !== JSON.stringify(old[key] ?? (key === 'attachments' ? [] : '')))
    if (!changes || structuralChange || input.notify !== false) {
      const removed = !changes
      const title = changes?.titre || old.titre || ''
      const date = changes?.dateLimite || old.dateLimite || ''
      tx.create(db.collection('messages').doc(`homework_${uid}_${input.commandId}`), {
        type: 'announcement', category: 'homework', fromId: uid,
        fromNom: `${user.get('prenom') || ''} ${user.get('nom') || ''}`.trim(),
        fromRole: user.get('role'), toType: 'class', toIds: [old.classeId],
        toLabel: old.classeId, classe: old.classeId,
        subject: removed ? 'Devoir annulé' : 'Devoir modifié',
        subjectAr: removed ? 'إلغاء الواجب' : 'تعديل الواجب',
        subjectEn: removed ? 'Homework cancelled' : 'Homework updated',
        body: removed ? `Le devoir « ${title} » est annulé.` : `Le devoir « ${title} » a été modifié. Échéance : ${date}. Consultez les nouvelles consignes.`,
        bodyAr: removed ? `تم إلغاء الواجب « ${title} ».` : `تم تعديل الواجب « ${title} ». آخر أجل: ${date}. يرجى مراجعة التعليمات.`,
        bodyEn: removed ? `Homework “${title}” has been cancelled.` : `Homework “${title}” has been updated. Due: ${date}. Please review the instructions.`,
        readBy: [], status: 'sent', priority: 'normal', createdAt: now,
        ...period(now.toISOString().slice(0, 10)),
      })
    }
    tx.create(receipt, { result, createdAt: now })
    return result
  })
}

module.exports = { manageHomework, validateChanges }
