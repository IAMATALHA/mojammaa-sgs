/**
 * Frontière Firestore typée.
 *
 * `doc.data()` renvoie `DocumentData` (≈ any) : chaque lecture devait donc
 * faire sa propre assertion `as MonDoc`, dispersant ~25 casts non vérifiés à
 * travers les services. Ces helpers centralisent l'UNIQUE point où l'on assume
 * le type des données Firestore, garantissent l'invariant minimal (données
 * présentes + `id` réel du document) et offrent un seul endroit où brancher une
 * validation runtime plus tard (ex. zod) sans toucher aux appelants.
 */
import type {
  DocumentSnapshot, QueryDocumentSnapshot, QuerySnapshot,
} from 'firebase/firestore'

/** Un document Firestore typé, augmenté de son id de document. */
export type WithId<T> = T & { id: string }

/**
 * Convertit un snapshot de document en objet typé `{ ...data, id }`.
 *
 * `id` est placé APRÈS le spread pour qu'un éventuel champ `id` stocké dans le
 * document ne masque jamais l'id réel du doc. Lève si le doc n'a pas de données
 * (cas d'un `DocumentSnapshot` inexistant) plutôt que de propager un objet
 * à moitié construit.
 */
export function toDoc<T>(snap: QueryDocumentSnapshot | DocumentSnapshot): WithId<T> {
  const data = snap.data()
  if (!data) {
    throw new Error(`[firestore] document sans données: ${snap.ref.path}`)
  }
  return { ...(data as T), id: snap.id }
}

/** Mappe tous les documents d'un `QuerySnapshot` en objets typés `{ ...data, id }`. */
export function toDocs<T>(snap: QuerySnapshot): WithId<T>[] {
  return snap.docs.map(d => toDoc<T>(d))
}

/**
 * Données d'un document « racine » (sans fusion d'id), ou `null` s'il n'existe
 * pas. Pour les docs dont l'id n'est pas une donnée utile : singletons, ou docs
 * indexés par une clé métier déjà présente dans les champs (jour scolaire,
 * emploi du temps d'un prof…).
 */
export function docData<T>(snap: DocumentSnapshot): T | null {
  return snap.exists() ? (snap.data() as T) : null
}
