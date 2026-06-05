/**
 * eleveLabels — helpers d'affichage/clé pour les élèves, partagés entre les
 * écrans de messagerie (prof + admin).
 *
 * `ELEVE_PLACEHOLDER` est injecté dans le corps d'un message à la place de
 * {elevePrenom} ; il est remplacé par le prénom de chaque élève au moment de
 * l'envoi personnalisé (broadcastPersonalized).
 */

import type { EleveDoc } from '../services/elevesService'

// Remplacé par le prénom de chaque élève à l'envoi personnalisé.
export const ELEVE_PLACEHOLDER = '{élève}'

export const eleveKey = (e: EleveDoc) => e.codeMassar

export const eleveName = (e: EleveDoc) =>
  `${e.prenomLatin || e.prenom || ''} ${e.nomLatin || e.nom || ''}`.trim() || e.nomComplet || '—'

export const elevePrenom = (e: EleveDoc) =>
  e.prenomLatin || e.prenom || eleveName(e).split(' ')[0]
