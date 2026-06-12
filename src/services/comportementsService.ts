/**
 * comportementsService — collection `comportements` (mérites / avertissements).
 *
 * Format des docs (créé par BehaviorSheet côté prof) :
 *   {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance?,
 *     kind: 'merite' | 'avertissement',
 *     reason: clé de BEHAVIOR_REASONS (jamais un libellé),
 *     comment?, teacherId, teacherNom, createdAt
 *   }
 *
 * À l'enregistrement, un doc `messages` est écrit pour le parent (historique
 * permanent + push envoyé SERVEUR par la CF onMessageCreated — même schéma
 * que notifyParentsOfAbsents dans TeacherAttendanceScreen : pas de push
 * client, un prof n'a pas le droit de lire users/{parent}).
 */

import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query,
  Timestamp, where, type Unsubscribe,
} from 'firebase/firestore'
import i18n from '../i18n'
import { db } from '../config/firebase'
import { sendMessage } from './messagesService'
import type { BehaviorKind } from '../utils/behaviorTaxonomy'

export interface ComportementDoc {
  id?:          string
  eleveId:      string
  eleveNom:     string
  elevePrenom:  string
  classe:       string
  date:         string   // ISO 'YYYY-MM-DD'
  seance?:      string   // 'S1'..'S6' si saisi depuis l'appel
  kind:         BehaviorKind
  reason:       string   // clé behavior.reasons.*
  comment?:     string
  teacherId:    string
  teacherNom:   string
  createdAt?:   any
}

const COL = 'comportements'

/** Libellé bilingue d'une raison, indépendant de la langue du téléphone du prof. */
function reasonLabel(reason: string, lng: 'fr' | 'ar'): string {
  return i18n.t(`behavior.reasons.${reason}`, { lng })
}

export interface RecordComportementInput {
  eleve:    { id: string; nom: string; prenom: string }
  classe:   string
  date:     string
  seance?:  string
  kind:     BehaviorKind
  reason:   string
  comment?: string
  teacher:  { uid: string; nom: string; prenom: string }
}

/**
 * Écrit le doc comportement puis, si l'élève a un parent lié, le message
 * bilingue qui déclenche le push. Retourne true si un parent a été notifié.
 */
export async function recordComportement(input: RecordComportementInput): Promise<boolean> {
  const { eleve, classe, date, seance, kind, reason, comment, teacher } = input
  const teacherNom = `${teacher.prenom} ${teacher.nom}`.trim()

  await addDoc(collection(db, COL), {
    eleveId:     eleve.id,
    eleveNom:    eleve.nom,
    elevePrenom: eleve.prenom,
    classe,
    date,
    ...(seance ? { seance } : {}),
    kind,
    reason,
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
    teacherId:   teacher.uid,
    teacherNom,
    createdAt:   Timestamp.now(),
  })

  // ── Notification parent (best-effort : le doc est déjà sauvegardé) ──
  const eleveSnap = await getDoc(doc(db, 'eleves', eleve.id))
  const parentUid = (eleveSnap.data() as any)?.parentUid
  if (!parentUid) return false

  const childName = `${eleve.prenom} ${eleve.nom}`.trim()
  const merite = kind === 'merite'
  const subject   = merite ? '⭐ Mérite signalé' : '⚠️ Avertissement'
  const subjectAr = merite ? '⭐ إشادة بالسلوك' : '⚠️ إنذار سلوكي'
  const commentSuffix   = comment?.trim() ? ` — ${comment.trim()}` : ''
  const body = merite
    ? `${childName} a été félicité(e) en ${classe} : ${reasonLabel(reason, 'fr')}${commentSuffix} (${teacherNom}, ${date}).`
    : `${childName} a reçu un avertissement en ${classe} : ${reasonLabel(reason, 'fr')}${commentSuffix} (${teacherNom}, ${date}).`
  const bodyAr = merite
    ? `تمت الإشادة بسلوك ${childName} في القسم ${classe}: ${reasonLabel(reason, 'ar')}${commentSuffix}`
    : `تلقى/تلقت ${childName} إنذارًا في القسم ${classe}: ${reasonLabel(reason, 'ar')}${commentSuffix}`

  await sendMessage({
    type:      'behavior',
    subject,
    subjectAr,
    body,
    bodyAr,
    fromId:    teacher.uid,
    fromNom:   teacherNom,
    fromRole:  'professeur',
    toType:    'user',
    toIds:     [parentUid],
    category:  'behavior',
    priority:  merite ? 'normal' : 'urgent',
    eleveId:   eleve.id,
    classe,
  })
  return true
}

/**
 * Souscrit aux comportements d'une liste d'élèves (les enfants d'un parent).
 * Même contrainte que subscribeAbsencesForEleves : `in` limité à 10.
 */
export function subscribeComportementsForEleves(
  eleveIds: string[],
  onChange: (list: ComportementDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (eleveIds.length === 0) {
    onChange([])
    return () => {}
  }
  const q = query(collection(db, COL), where('eleveId', 'in', eleveIds.slice(0, 10)))
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ComportementDoc, 'id'>) }))),
    err => { onError?.(err) },
  )
}

/** Souscrit au journal de comportement d'une classe (vue prof). */
export function subscribeComportementsForClasse(
  classe: string,
  onChange: (list: ComportementDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('classe', '==', classe))
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ComportementDoc, 'id'>) }))),
    err => { onError?.(err) },
  )
}

export async function deleteComportement(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
