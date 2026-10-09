/**
 * Gestion des accès depuis l'app (administration). Mêmes fonctions serveur que
 * le site (codebase `admin`, déjà publiées) : rien de nouveau côté serveur ni
 * règles. Habilitations vérifiées par le serveur : superadmin pour les
 * invitations professeurs et les liens de réinitialisation, administration
 * pour les codes parents. L'app n'affiche ces actions qu'aux comptes
 * habilités, mais ne s'y fie jamais.
 */
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../config/firebase'
import type { CreatedTeacherInvitation, ParentCode, ResetLink, TeacherAccessRow } from '../utils/admin-access'

/** Compte présent dans `config/superadmins` (lisible par l'administration). */
export async function isSuperAdmin(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'config', 'superadmins'))
  const uids: unknown = snap.exists() ? snap.get('uids') : null
  return Array.isArray(uids) && uids.includes(uid)
}

/** Compte déjà relié au numéro (renvoyé à l'administration seulement). */
export interface PhoneConflict {
  uid: string
  nom: string
  prenom: string
  role: string
  pendingInvitation: boolean
}

export class AdminActionError extends Error {
  /** Motif serveur (`details.reason`), ou code de la callable. */
  readonly reason: string
  readonly conflict: PhoneConflict | null
  constructor(reason: string, message: string, conflict: PhoneConflict | null) {
    super(message)
    this.name = 'AdminActionError'
    this.reason = reason
    this.conflict = conflict
  }
}

async function call<In, Out>(name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown; details?: { reason?: unknown; conflict?: PhoneConflict } } | null
    const code = typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : ''
    throw new AdminActionError(
      typeof e?.details?.reason === 'string' ? e.details.reason : code || 'generic',
      typeof e?.message === 'string' ? e.message : '',
      e?.details?.conflict ?? null,
    )
  }
}

export async function listTeacherAccess(): Promise<TeacherAccessRow[]> {
  return (await call<Record<string, never>, { rows?: TeacherAccessRow[] }>('listTeacherAccess', {})).rows ?? []
}

export function createTeacherInvitation(uid: string, phone: string): Promise<CreatedTeacherInvitation> {
  return call('createTeacherInvitation', { uid, phone })
}

export function revokeTeacherInvitation(invitationId: string): Promise<{ status: string }> {
  return call('revokeTeacherInvitation', { invitationId })
}

export function setTeacherLoginPhone(uid: string, phone: string): Promise<{ phone: string | null }> {
  return call('setTeacherLoginPhone', { uid, phone })
}

/** Récupération accompagnée : l'appelant atteste avoir vérifié l'identité. */
export function createTeacherRecoveryLink(uid: string): Promise<ResetLink> {
  return call('createTeacherRecoveryLink', { uid, identityVerified: true })
}

export function createParentPasswordResetLink(parentUid: string): Promise<ResetLink> {
  return call('createParentPasswordResetLink', { parentUid })
}

export async function createParentInvitations(studentIds: string[]): Promise<ParentCode[]> {
  return (await call<{ studentIds: string[] }, { invitations?: ParentCode[] }>('createParentInvitations', { studentIds })).invitations ?? []
}
