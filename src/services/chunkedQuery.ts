/**
 * Requêtes `in` chunkées — un seul endroit pour la limite Firestore.
 *
 * POURQUOI : `where(champ, 'in', valeurs)` plafonne le nombre de valeurs.
 * Le repo contournait ça par des `valeurs.slice(0, 10)` dispersés dans 5
 * services, ce qui TRONQUAIT silencieusement le résultat dès qu'on dépassait
 * la limite (parents d'absents non notifiés, élèves manquants pour un prof à
 * plus de 10 classes…). Aucune erreur, aucun log : le bug ne se voyait qu'en
 * comparant les chiffres à la main.
 *
 * Ici on découpe et on RECOLLE au lieu de tronquer. Les appelants passent une
 * fabrique de requête et ne connaissent plus la limite.
 *
 * La limite est de 30 depuis 2023 (elle était de 10 à l'origine, d'où les
 * anciens `slice(0, 10)` et les commentaires « limite = 10 » du repo).
 * Cf. https://firebase.google.com/docs/firestore/query-data/queries#in_not-in_and_array-contains-any
 */
import { getDocs, onSnapshot, type Query, type Unsubscribe } from 'firebase/firestore'
import { toDocs, type WithId } from './firestore'

/** Nombre max de valeurs dans un `in` / `not-in` / `array-contains-any`. */
export const IN_QUERY_LIMIT = 30

/**
 * Découpe des valeurs en paquets compatibles avec un `in`.
 * Dédoublonne d'abord : deux fois la même valeur consommerait deux slots.
 */
export function chunkForIn<T>(values: readonly T[], size: number = IN_QUERY_LIMIT): T[][] {
  const unique = [...new Set(values)]
  const chunks: T[][] = []
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size))
  }
  return chunks
}

/**
 * Lecture ponctuelle sur une liste de valeurs de taille quelconque.
 * Les chunks partent en parallèle ; le résultat est dédupliqué par id de doc.
 */
export async function getDocsChunked<T>(
  values: readonly string[],
  buildQuery: (chunk: string[]) => Query,
  size: number = IN_QUERY_LIMIT,
): Promise<WithId<T>[]> {
  const chunks = chunkForIn(values, size)
  if (chunks.length === 0) return []
  const snaps = await Promise.all(chunks.map(chunk => getDocs(buildQuery(chunk))))
  const byId = new Map<string, WithId<T>>()
  snaps.forEach(snap => toDocs<T>(snap).forEach(row => byId.set(row.id, row)))
  return [...byId.values()]
}

/**
 * Souscription temps réel sur une liste de valeurs de taille quelconque.
 *
 * Un listener par chunk, dont les résultats sont fusionnés dans un seul
 * callback. Chaque bucket garde son propre état pour qu'une mise à jour d'un
 * chunk n'efface pas les documents des autres.
 *
 * `onChange` est appelé dès le premier snapshot reçu (même partiel) : c'est le
 * comportement déjà retenu par `subscribeMessages`, qui privilégie l'affichage
 * progressif au tout-ou-rien.
 *
 * L'`Unsubscribe` retourné coupe TOUS les listeners.
 */
export function subscribeChunked<T>(
  values: readonly string[],
  buildQuery: (chunk: string[]) => Query,
  onChange: (rows: WithId<T>[]) => void,
  onError?: (err: Error) => void,
  size: number = IN_QUERY_LIMIT,
): Unsubscribe {
  const chunks = chunkForIn(values, size)
  if (chunks.length === 0) {
    onChange([])
    return () => {}
  }

  const buckets: WithId<T>[][] = chunks.map(() => [])
  const unsubs = chunks.map((chunk, index) => onSnapshot(
    buildQuery(chunk),
    snap => {
      buckets[index] = toDocs<T>(snap)
      const byId = new Map<string, WithId<T>>()
      buckets.forEach(bucket => bucket.forEach(row => byId.set(row.id, row)))
      onChange([...byId.values()])
    },
    err => { onError?.(err) },
  ))

  return () => unsubs.forEach(unsub => unsub())
}
