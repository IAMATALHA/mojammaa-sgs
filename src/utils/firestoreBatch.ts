import { writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore'

/**
 * Taille max d'un batch côté client quand les règles font un get() par doc
 * écrit (cohérence élève↔classe sur notes/absences, durci 2026-07-11).
 * Firestore plafonne les accès document des règles à 20 par batch : un batch
 * class-wide (~30 docs) serait rejeté en entier. 10 docs + le get(users/me)
 * mis en cache laissent une marge confortable.
 */
export const RULES_SAFE_BATCH_SIZE = 10

/**
 * Committe les écritures par chunks séquentiels de `size` docs.
 * ⚠️ Les chunks ne sont PAS atomiques entre eux : les appelants utilisent des
 * docId déterministes + set(merge) → rejouer après un échec partiel est sûr.
 */
export async function commitInChunks<T>(
  db: Firestore,
  items: T[],
  writeItem: (batch: WriteBatch, item: T) => void,
  size: number = RULES_SAFE_BATCH_SIZE,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db)
    items.slice(i, i + size).forEach(item => writeItem(batch, item))
    await batch.commit()
  }
}
