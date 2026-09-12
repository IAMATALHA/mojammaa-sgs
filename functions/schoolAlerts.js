const { createHash } = require('node:crypto')

const REASONS = {
  participation: ['Participation active', 'مشاركة فعالة', 'Active participation'],
  helpingOthers: ['Aide aux autres', 'مساعدة الآخرين', 'Helping others'],
  outstandingWork: ['Travail exceptionnel', 'عمل متميز', 'Outstanding work'],
  remarkableEffort: ['Effort remarquable', 'مجهود ملحوظ', 'Remarkable effort'],
  research: ['Recherche / curiosité', 'البحث وحب الاستطلاع', 'Research / curiosity'],
  disrespect: ['Manque de respect', 'عدم الاحترام', 'Disrespect'],
  fighting: ['Bagarre', 'شجار', 'Fighting'],
  homeworkNotDone: ['Devoir non fait', 'واجب غير منجز', 'Homework not done'],
  forgotMaterials: ['Oubli des affaires scolaires', 'نسيان الأدوات المدرسية', 'Forgot school supplies'],
  rulesNotFollowed: ['Non-respect des consignes', 'عدم احترام التعليمات', 'Instructions not followed'],
  other: ['Remarque', 'ملاحظة', 'Comment'],
}

function alertCopy(kind, record, child, correction) {
  const name = `${child.prenomLatin || child.prenomFr || child.prenom || ''} ${child.nomLatin || child.nomFr || child.nom || ''}`.trim()
  const nameAr = `${child.prenom || ''} ${child.nom || ''}`.trim()
  const context = `${record.classe || ''} (${record.seance || ''}, ${record.date || ''})`
  if (kind === 'attendance') {
    const status = record.statut === 'retard' ? 'en retard' : 'présent(e)'
    return {
      subject: correction ? 'Absence rectifiée' : 'Absence signalée',
      subjectEn: correction ? 'Absence corrected' : 'Absence reported',
      bodyEn: correction
        ? `Correction: ${name} is ${record.statut === 'retard' ? 'late' : 'present'} — ${context}. The reported absence has been cancelled.`
        : `${name} was marked absent — ${context}.`,
      subjectAr: correction ? 'تصحيح الغياب' : 'إشعار بالغياب',
      body: correction
        ? `Rectification : ${name} est ${status} en ${context}. L’absence signalée est annulée.`
        : `${name} a été marqué(e) absent(e) en ${context}.`,
      bodyAr: correction
        ? `تصحيح: ${nameAr} ${record.statut === 'retard' ? 'متأخر' : 'حاضر'} — ${context}. تم إلغاء الغياب المسجل.`
        : `تم تسجيل غياب ${nameAr} — ${context}.`,
    }
  }
  if (record.cancelledAt) return {
    subject: 'Remarque de comportement annulée', subjectEn: 'Behavior entry cancelled', subjectAr: 'إلغاء ملاحظة سلوكية',
    body: `${name} : la remarque du ${record.date} a été annulée. ${record.cancelReason || ''}`,
    bodyEn: `${name}: the entry dated ${record.date} was cancelled. ${record.cancelReason || ''}`,
    bodyAr: `${nameAr}: تم إلغاء ملاحظة ${record.date}. ${record.cancelReason || ''}`,
  }
  const merit = record.kind === 'merite'
  const reason = REASONS[record.reason] || REASONS.other
  const comment = record.comment ? ` — ${record.comment}` : ''
  return {
    subject: merit ? '⭐ Mérite signalé' : '⚠️ Avertissement',
    subjectEn: merit ? '⭐ Merit awarded' : '⚠️ Warning',
    bodyEn: `${name}: ${reason[2]}${comment} — ${context}.`,
    subjectAr: merit ? '⭐ إشادة بالسلوك' : '⚠️ إنذار سلوكي',
    body: `${name} : ${reason[0]}${comment} — ${context}.`,
    bodyAr: `${nameAr}: ${reason[1]}${comment} — ${context}.`,
  }
}

/** Source record + alert state + message are reconciled in one transaction.
 * Replayed events and metadata-only writes cannot create another alert.
 * Read the CURRENT source: out-of-order triggers converge to its latest state.
 * No student names or device tokens are written to the private state document.
 */
async function reconcileSchoolAlert(db, { kind, sourceRef, before = null, period }) {
  const key = createHash('sha256').update(sourceRef.path).digest('hex')
  const stateRef = db.collection('schoolAlertState').doc(key)
  return db.runTransaction(async tx => {
    const [source, stateSnap] = await Promise.all([tx.get(sourceRef), tx.get(stateRef)])
    if (!source.exists) return null
    const record = source.data()
    if (!record.eleveId) return null
    const state = stateSnap.data() || {}
    const status = kind === 'attendance' ? record.statut : record.cancelledAt ? 'cancelled' : record.kind
    if (kind === 'attendance' && !['absent', 'present', 'retard'].includes(status)) return null
    if (kind === 'behavior' && !['merite', 'avertissement', 'cancelled'].includes(status)) return null
    if (state.status === status) return null
    // The before fallback also rectifies absences created by the previous app.
    const previous = state.status || before?.statut
    const correction = kind === 'attendance' ? previous === 'absent' && status !== 'absent' : status === 'cancelled'
    const emit = kind === 'behavior' ? (status === 'cancelled' ? !!state.messageId : !state.messageId && state.status !== 'cancelled') : status === 'absent' || correction
    const revision = (state.revision || 0) + 1
    if (!emit) {
      tx.set(stateRef, { status, revision, updatedAt: new Date() }, { merge: true })
      return null
    }
    const childSnap = await tx.get(db.collection('eleves').doc(record.eleveId))
    const child = childSnap.data() || {}
    const teacherId = record.professorId || record.teacherId
    const teacher = teacherId ? await tx.get(db.collection('users').doc(teacherId)) : null
    const teacherData = teacher?.data() || {}
    const previousMessage = state.messageId
      ? await tx.get(db.collection('messages').doc(state.messageId)) : null
    const parentUid = child.active !== false && child.parentUid ? child.parentUid : null
    const messageId = `school_${key}_${revision}`
    const message = {
      ...alertCopy(kind, record, child, correction),
      ...period(new Date()),
      type: kind, category: kind,
      fromId: teacherId || 'system-school',
      fromRole: teacherData.role === 'admin' ? 'admin' : 'professeur',
      fromNom: `${teacherData.prenom || ''} ${teacherData.nom || ''}`.trim() || 'Mojammaa Al Maarifa',
      toType: 'user', toIds: parentUid ? [parentUid] : [],
      priority: kind === 'attendance' || status === 'avertissement' ? 'urgent' : 'normal',
      eleveId: record.eleveId, classe: record.classe || '',
      readBy: [], status: 'sent', createdAt: new Date(),
      automation: { source: sourceRef.path, revision, correction },
      push: { status: parentUid ? 'pending' : 'no_recipient', sent: 0, errors: 0 },
    }
    tx.create(db.collection('messages').doc(messageId), message)
    if (previousMessage?.exists) {
      tx.update(previousMessage.ref, {
        'automation.supersededBy': messageId,
        'push.status': 'superseded',
      })
    }
    tx.set(stateRef, { status, revision, messageId, updatedAt: new Date() }, { merge: true })
    return messageId
  })
}

module.exports = { reconcileSchoolAlert, alertCopy }
