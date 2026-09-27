const { moroccoDate } = require('./lib/moroccoTime')
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

// Classe fournie par le client à la création : chaîne bornée, sans espace parasite.
const validClasse = value => typeof value === 'string' && value.length >= 1 && value.length <= 60
  && value.trim() === value && !value.includes('/')

// Parents à notifier : même règle que le client (élèves actifs de la classe → parentUid).
// Un message `toType: 'class'` n'atteint personne : ni push (resolveRecipientUids), ni boîte parent.
async function classParentUids(db, classeId) {
  const snap = await db.collection('eleves').where('classe', '==', classeId).get()
  return [...new Set(snap.docs.filter(d => d.get('active') !== false)
    .map(d => d.get('parentUid')).filter(parent => typeof parent === 'string' && parent))]
}

function messageCopy(kind, { titre, date, matiere }) {
  if (kind === 'created') return {
    subject: ['📚 Nouveau devoir', matiere].filter(Boolean).join(' · '),
    subjectAr: ['📚 واجب جديد', matiere].filter(Boolean).join(' · '),
    subjectEn: ['📚 New homework', matiere].filter(Boolean).join(' · '),
    body: `${titre} — à rendre le ${date}`,
    bodyAr: `${titre} — يُسلَّم بتاريخ ${date}`,
    bodyEn: `${titre} — due ${date}`,
  }
  if (kind === 'removed') return {
    subject: 'Devoir annulé', subjectAr: 'إلغاء الواجب', subjectEn: 'Homework cancelled',
    body: `Le devoir « ${titre} » est annulé.`,
    bodyAr: `تم إلغاء الواجب « ${titre} ».`,
    bodyEn: `Homework “${titre}” has been cancelled.`,
  }
  return {
    subject: 'Devoir modifié', subjectAr: 'تعديل الواجب', subjectEn: 'Homework updated',
    body: `Le devoir « ${titre} » a été modifié. Échéance : ${date}. Consultez les nouvelles consignes.`,
    bodyAr: `تم تعديل الواجب « ${titre} ». آخر أجل: ${date}. يرجى مراجعة التعليمات.`,
    bodyEn: `Homework “${titre}” has been updated. Due: ${date}. Please review the instructions.`,
  }
}

/** Atomic creation/edit/removal, with an idempotency receipt and notification in the same commit. */
async function manageHomework(db, uid, input, now = new Date()) {
  if (!uid) fail('unauthenticated')
  const creating = input?.action === 'create'
  if (!input || !['create', 'edit', 'remove'].includes(input.action)
    || !/^[\w-]{1,128}$/.test(input.id || '') || !/^[\w-]{1,128}$/.test(input.commandId || '')
    || (creating ? !validClasse(input.classeId) : !Number.isFinite(input.version))) fail('invalid-argument')
  const changes = input.action === 'remove' ? null : validateChanges(input.changes)
  const ref = db.doc(`devoirs/${input.id}`)
  const receipt = db.doc(`homeworkCommands/${uid}_${input.commandId}`)
  const messageRef = db.collection('messages').doc(`homework_${uid}_${input.commandId}`)
  return db.runTransaction(async tx => {
    const [user, previous, snapshot] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)), tx.get(receipt), tx.get(ref),
    ])
    if (!['admin', 'professeur'].includes(user.get('role'))) fail('permission-denied')
    if (previous.exists) return previous.get('result')
    const fromNom = `${user.get('prenom') || ''} ${user.get('nom') || ''}`.trim()
    const message = (classeId, parentUids, copy) => ({
      type: 'announcement', category: 'homework', fromId: uid, fromNom,
      fromRole: user.get('role'), toType: 'user', toIds: parentUids,
      toLabel: classeId, classe: classeId, ...copy,
      readBy: [], status: 'sent', priority: 'normal', createdAt: now,
      ...period(moroccoDate(now)),
    })

    if (creating) {
      // Même contrôle que la règle teacherTeaches : classes du profil ou classe principale.
      const classes = [...(Array.isArray(user.get('classes')) ? user.get('classes') : []), user.get('classe')]
      if (user.get('role') !== 'admin' && !classes.includes(input.classeId)) fail('permission-denied')
      if (snapshot.exists) fail('already-exists')
      const parentUids = await classParentUids(db, input.classeId)
      const result = { status: 'created', id: input.id }
      tx.create(ref, {
        ...changes, classeId: input.classeId, teacherId: uid, teacherNom: fromNom,
        createdAt: now, createdVia: 'manageHomework',
      })
      if (parentUids.length) {
        tx.create(messageRef, message(input.classeId, parentUids, messageCopy('created', {
          titre: changes.titre, date: changes.dateLimite, matiere: user.get('matiere') || '',
        })))
      }
      tx.create(receipt, { result, createdAt: now })
      return result
    }

    if (!snapshot.exists) fail('not-found')
    const old = snapshot.data()
    if (user.get('role') !== 'admin' && old.teacherId !== uid) fail('permission-denied')
    if (old.cancelledAt) fail('failed-precondition')
    // Le SDK web renvoie des millisecondes fractionnaires (toMillis non arrondi) ;
    // l'Admin SDK arrondit à l'inférieur. On compare donc à la milliseconde près.
    if ((old.updatedAt?.toMillis?.() || 0) !== Math.floor(input.version)) fail('failed-precondition')
    let result = { status: 'updated' }
    if (changes && Object.keys(changes).every(key => JSON.stringify(changes[key]) === JSON.stringify(old[key]))) {
      tx.create(receipt, { result, createdAt: now })
      return result
    }
    const submissions = changes ? null
      : await tx.get(db.collection('homeworkSubmissions').where('homeworkId', '==', input.id).limit(1))
    // A date/type/attachment change always alerts families. Text-only corrections may be silent.
    const structuralChange = changes && ['dateLimite', 'type', 'attachments'].some(key => JSON.stringify(changes[key]) !== JSON.stringify(old[key] ?? (key === 'attachments' ? [] : '')))
    const parentUids = !changes || structuralChange || input.notify !== false ? await classParentUids(db, old.classeId) : []
    if (changes) {
      tx.update(ref, { ...changes, updatedAt: now, updatedBy: uid })
    } else {
      result = { status: submissions.empty ? 'deleted' : 'cancelled' }
      if (submissions.empty) tx.delete(ref)
      else tx.update(ref, { cancelledAt: now, cancelledBy: uid, updatedAt: now })
    }
    if (parentUids.length) {
      tx.create(messageRef, message(old.classeId, parentUids, messageCopy(changes ? 'updated' : 'removed', {
        titre: changes?.titre || old.titre || '', date: changes?.dateLimite || old.dateLimite || '',
      })))
    }
    tx.create(receipt, { result, createdAt: now })
    return result
  })
}

module.exports = { manageHomework, validateChanges }
