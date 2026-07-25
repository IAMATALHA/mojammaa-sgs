/**
 * Barème d'une note et normalisation sur 20 — règle UNIQUE côté client.
 *
 * POURQUOI CE FICHIER : la règle était réécrite à trois endroits, dans deux
 * versions incompatibles. `useParentData` testait `cycle === 'primaire'` puis
 * le motif « AEP » de la classe ; `useParentNotes` ne testait que « AEP ».
 * Un élève de primaire dont la classe ne contient pas « AEP » était donc noté
 * sur 10 sur la carte du tableau de bord et sur 20 dans son bulletin — deux
 * moyennes différentes pour le même enfant, sur deux écrans.
 *
 * La règle retenue est celle du serveur (`baremeFromData` /
 * `normalizedNote20`, functions/schoolStats.js), afin que le parent et
 * l'administration lisent le même chiffre.
 */

/** Ce dont on a besoin pour trancher le barème d'une note. */
export interface GradeScaleInput {
  bareme?: 10 | 20 | number | null
  cycle?:  string | null
  classe?: string | null
}

/**
 * Barème applicable, par ordre de priorité :
 *   `bareme` explicite du document > cycle primaire > classe « …AEP » > /20.
 *
 * `fallbackClasse` sert quand le document de note ne porte pas sa classe
 * (cas des anciens documents) : on retombe sur celle de l'élève.
 */
export function resolveBareme(note: GradeScaleInput, fallbackClasse?: string | null): 10 | 20 {
  if (note.bareme === 10 || note.bareme === 20) return note.bareme
  if (String(note.cycle || '').toLowerCase() === 'primaire') return 10
  return /aep/i.test(String(note.classe || fallbackClasse || '')) ? 10 : 20
}

/**
 * Note ramenée sur 20, ou `null` si elle est absente ou hors barème.
 * Une note hors bornes est écartée plutôt que rognée : mieux vaut l'exclure de
 * la moyenne que d'y injecter une valeur inventée.
 */
export function noteOn20(
  value: number | null | undefined,
  note: GradeScaleInput,
  fallbackClasse?: string | null,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const bareme = resolveBareme(note, fallbackClasse)
  if (value < 0 || value > bareme) return null
  return value * (20 / bareme)
}

/**
 * Moyenne pondérée Σ(valeur × coef) / Σ(coef).
 * Replie sur la moyenne arithmétique si aucun coefficient exploitable — même
 * comportement que `weightedAvg` côté serveur.
 */
export function weightedAverage(pairs: { value: number; coef: number }[]): number | null {
  if (pairs.length === 0) return null
  const totalCoef = pairs.reduce((sum, p) => sum + (p.coef > 0 ? p.coef : 0), 0)
  if (totalCoef <= 0) {
    return pairs.reduce((sum, p) => sum + p.value, 0) / pairs.length
  }
  return pairs.reduce((sum, p) => sum + p.value * (p.coef > 0 ? p.coef : 0), 0) / totalCoef
}
