/**
 * Taxonomie FIXE des actions de comportement (v1 — décision 2026-06-12 :
 * liste codée en dur, l'édition par l'admin viendra en v2 si besoin).
 *
 * `reason` stocké en base = la CLÉ stable (jamais le libellé), pour que
 * l'affichage suive la langue du lecteur : t(`behavior.reasons.${reason}`).
 */

export type BehaviorKind = 'merite' | 'avertissement'

export const BEHAVIOR_REASONS: Record<BehaviorKind, readonly string[]> = {
  merite: [
    'participation',     // Participation active
    'helpingOthers',     // Aider les autres
    'outstandingWork',   // Travail exceptionnel
    'remarkableEffort',  // Effort remarquable
    'research',          // Recherche / curiosité
    'other',             // Remarque libre
  ],
  avertissement: [
    'disrespect',        // Manque de respect
    'fighting',          // Bagarre
    'homeworkNotDone',   // Devoir non fait
    'forgotMaterials',   // Oubli des affaires scolaires
    'rulesNotFollowed',  // Non-respect des consignes
    'other',             // Remarque libre
  ],
} as const
