/**
 * eleveLabels — helpers d'affichage/clé pour les élèves, partagés entre les
 * écrans parents, de sortie et de messagerie (prof + admin).
 *
 * `ELEVE_PLACEHOLDER` est injecté dans le corps d'un message à la place de
 * {elevePrenom} ; il est remplacé par le prénom de chaque élève au moment de
 * l'envoi personnalisé (broadcastPersonalized).
 */

import type { EleveDoc } from '../services/elevesService'

// Remplacé par le prénom de chaque élève à l'envoi personnalisé.
export const ELEVE_PLACEHOLDER = '{élève}'

// codeMassar peut manquer (élève saisi à la main) → fallback id du doc,
// puis classe+nom en dernier recours, pour ne jamais rendre une clé undefined.
export const eleveKey = (e: EleveDoc) => e.codeMassar || e.id || `${e.classe}-${eleveName(e)}`

// Affichage arabe uniquement en attendant la liste officielle en français.
// Les transcriptions latines restent stockées pour la recherche et la validation.
type ArabicName = Partial<Pick<EleveDoc, 'prenom' | 'nom' | 'nomComplet'>>

export function eleveNameParts(e?: ArabicName) {
  const firstName = e?.prenom?.trim() || ''
  const lastName = e?.nom?.trim() || ''
  return {
    firstName: firstName || (!lastName ? e?.nomComplet?.trim() || '' : ''),
    lastName,
  }
}

export const eleveName = (e: ArabicName) => {
  const { firstName, lastName } = eleveNameParts(e)
  return [firstName, lastName].filter(Boolean).join(' ') || '—'
}

export const elevePrenom = (e: EleveDoc) =>
  e.prenom?.trim() || eleveName(e).split(' ')[0]
