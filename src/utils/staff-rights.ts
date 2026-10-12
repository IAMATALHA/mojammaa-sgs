/**
 * Droits du personnel administratif (rôle `staff`).
 *
 * Un compte `staff` n'a aucun droit par défaut : chaque droit est une case
 * cochée dans `users/{uid}.droits`. Cette liste est la seule source des clés :
 * les règles Firestore (mojammaa-sgs), les fonctions et les applications
 * comparent ces chaînes telles quelles. Une clé absente d'ici n'existe pas.
 *
 * Sans dépendance, pour pouvoir être copié tel quel dans les applications.
 */

export const STAFF_ROLE = 'staff'

export const STAFF_RIGHTS = [
  // Élèves : fiches et coordonnées des parents.
  'eleves.voir',
  'eleves.modifier',
  // Présences : absences, retards, déclarations des parents.
  'absences.voir',
  'absences.saisir',
  // Mérites et avertissements.
  'comportements.voir',
  'comportements.saisir',
  'sortie',
  'priere',
  // Journal de suivi : convocations, entretiens.
  'suivis',
  'notes.voir',
  'edt.voir',
  // Boîte commune de l'administration, puis envoi aux parents.
  'messages.boite',
  'messages.envoyer',
  'calendrier.modifier',
  'rendezvous',
  // Classes attribuées à chaque enseignant (page Enseignants).
  'enseignants.modifier',
  'codes.parents',
  'codes.professeurs',
  'comptes.gerer',
] as const

export type StaffRight = typeof STAFF_RIGHTS[number]

/**
 * Créer les comptes du personnel et définir leurs droits. Seul un superadmin
 * accorde ou retire ce droit : la liste de ceux qui décident des accès ne
 * s'allonge jamais sans lui.
 */
export const MANAGE_RIGHT: StaffRight = 'comptes.gerer'

/**
 * Droits qu'un admin n'a pas d'office : il doit les porter lui aussi. Ce sont
 * ceux qui touchent aux accès — créer des comptes, remettre à un professeur le
 * code qui ouvre le sien — et qui étaient réservés aux superadmins. Pour tous
 * les autres droits, un admin peut tout.
 */
export const EXPLICIT_RIGHTS: readonly StaffRight[] = [MANAGE_RIGHT, 'codes.professeurs']

/**
 * Cases cochées d'office par une autre. Saisir ou modifier suppose de voir ;
 * et un domaine qui porte sur des élèves nommés suppose leur liste (sans
 * elle, ses écrans n'ont rien à afficher). Suivi de proche en proche.
 */
const IMPLIED: Partial<Record<StaffRight, StaffRight>> = {
  'eleves.modifier': 'eleves.voir',
  'absences.saisir': 'absences.voir',
  'comportements.saisir': 'comportements.voir',
  'absences.voir': 'eleves.voir',
  'comportements.voir': 'eleves.voir',
  'notes.voir': 'eleves.voir',
  'suivis': 'eleves.voir',
  'sortie': 'eleves.voir',
  'codes.parents': 'eleves.voir',
  'messages.envoyer': 'eleves.voir',
  // Attribuer des classes se fait au vu des emplois du temps.
  'enseignants.modifier': 'edt.voir',
}

function isRight(value: unknown): value is StaffRight {
  return typeof value === 'string' && (STAFF_RIGHTS as readonly string[]).includes(value)
}

/**
 * Droits demandés, validés : dans l'ordre de la liste, sans doublon, avec les
 * cases cochées d'office (IMPLIED). `null` si une seule valeur est inconnue — rien
 * n'est accordé à partir d'une demande mal formée.
 */
export function normalizeRights(value: unknown): StaffRight[] | null {
  if (!Array.isArray(value) || value.length > STAFF_RIGHTS.length * 2) return null
  const asked = new Set<StaffRight>()
  for (const item of value) {
    if (!isRight(item)) return null
    for (let right: StaffRight | undefined = item; right && !asked.has(right); right = IMPLIED[right]) asked.add(right)
  }
  return STAFF_RIGHTS.filter(right => asked.has(right))
}

/** Droits lus en base : les clés disparues de la liste sont ignorées. */
export function knownRights(value: unknown): StaffRight[] {
  const stored = Array.isArray(value) ? value : []
  return STAFF_RIGHTS.filter(right => stored.includes(right))
}

/**
 * Ce compte a-t-il ce droit ? `profile` : données de `users/{uid}`. Même
 * décision que `can()` dans firestore.rules pour les droits ordinaires ; un
 * champ `droits` sur la fiche d'un professeur ou d'un parent ne vaut rien.
 */
export function hasRight(profile: { role?: unknown; droits?: unknown } | undefined, right: StaffRight): boolean {
  if (!profile) return false
  const held = knownRights(profile.droits).includes(right)
  if (profile.role === 'admin') return held || !EXPLICIT_RIGHTS.includes(right)
  return profile.role === STAFF_ROLE && held
}

/** Un poste : un nom et des cases cochées d'avance, réutilisables. */
export interface StaffPoste {
  id: string
  nom: string
  nomAr: string
  droits: StaffRight[]
}

/**
 * Postes fournis au départ. L'établissement peut les modifier ou en créer
 * d'autres (collection `staffPostes`) ; un poste ne porte jamais MANAGE_RIGHT.
 */
export const BUILTIN_POSTES: readonly StaffPoste[] = [
  {
    id: 'surveillant_general',
    nom: 'Surveillant général',
    nomAr: 'الحارس العام',
    droits: [
      'eleves.voir', 'absences.voir', 'absences.saisir', 'comportements.voir', 'comportements.saisir',
      'sortie', 'priere', 'suivis', 'notes.voir', 'edt.voir', 'messages.boite', 'messages.envoyer',
      'codes.parents',
    ],
  },
  {
    id: 'relations_parents',
    nom: 'Relations parents',
    nomAr: 'العلاقة مع الأولياء',
    droits: ['eleves.voir', 'absences.voir', 'notes.voir', 'edt.voir', 'codes.parents', 'codes.professeurs'],
  },
]
