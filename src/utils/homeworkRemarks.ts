/**
 * Remarque du professeur sur le rendu d'un élève (demande d'une professeure,
 * 15/10/2026) : remarques rapides sur le cahier et le travail, plus un texte
 * libre. Écrites avec la décision (rendu, non fait…) dans homeworkSubmissions,
 * lues par la famille sous le statut.
 *
 * Liste FERMÉE : firestore.rules (validTeacherRemark) n'accepte que ces clés
 * et les mêmes bornes — toute modification se reporte dans les deux fichiers.
 */

export const HOMEWORK_REMARK_TAGS = [
  'bon_travail',
  'cahier_soigne',
  'exercices_partiels',
  'cahier_incomplet',
  'corrections_manquantes',
  'cahier_oublie',
  'a_refaire',
] as const
export type HomeworkRemarkTag = typeof HOMEWORK_REMARK_TAGS[number]

export const HOMEWORK_REMARK_LIMITS = { comment: 500, tags: HOMEWORK_REMARK_TAGS.length }

/** Remarques positives : affichées en vert, les autres en orange. */
export const POSITIVE_REMARK_TAGS: readonly HomeworkRemarkTag[] = ['bon_travail', 'cahier_soigne']

export interface HomeworkRemark { comment: string; tags: HomeworkRemarkTag[] }

export function isRemarkTag(value: unknown): value is HomeworkRemarkTag {
  return typeof value === 'string' && (HOMEWORK_REMARK_TAGS as readonly string[]).includes(value)
}

/** Valeurs lues en base : clés inconnues écartées, ordre de la liste, texte borné. */
export function safeRemark(comment: unknown, tags: unknown): HomeworkRemark {
  const known = Array.isArray(tags) ? tags.filter(isRemarkTag) : []
  return {
    comment: typeof comment === 'string' ? comment.trim().slice(0, HOMEWORK_REMARK_LIMITS.comment) : '',
    tags: HOMEWORK_REMARK_TAGS.filter(tag => known.includes(tag)),
  }
}

export function hasRemark(remark: HomeworkRemark): boolean {
  return remark.comment.length > 0 || remark.tags.length > 0
}
