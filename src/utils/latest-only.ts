/**
 * Garde « seule la dernière demande compte » pour des réponses asynchrones qui
 * peuvent revenir dans le désordre (vérification d'un code, lecture du lien de
 * lancement). Fonction pure, testée seule (tests/services/latestOnly.test.mjs).
 */
export interface LatestOnly {
  /** Démarre une demande ; la fonction rendue dit si elle est encore la dernière. */
  begin(): () => boolean
  /** Périme les demandes en cours : saisie modifiée, intention plus récente, écran quitté. */
  cancel(): void
}

export function createLatestOnly(): LatestOnly {
  let current = 0
  return {
    begin() {
      current += 1
      const run = current
      return () => run === current
    },
    cancel() {
      current += 1
    },
  }
}
