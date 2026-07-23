import type { TFunction } from 'i18next'

export type EvaluationFormula = 'weighted_blocks' | 'english_three_blocks'

/** Libellé localisé de la formule réglementaire, sans texte serveur figé. */
export function translatedFormula(
  formula: EvaluationFormula,
  integratedWeight: number,
  t: TFunction,
): string {
  if (formula === 'english_three_blocks') {
    return t('teacher.formulaEnglishThreeBlocks')
  }
  if (integratedWeight > 0) {
    return t('teacher.formulaWeightedBlocks', {
      written: Math.round((1 - integratedWeight) * 100),
      integrated: Math.round(integratedWeight * 100),
    })
  }
  return t('teacher.formulaWrittenOnly')
}
