/**
 * elevesService — lectures Firestore de la collection `eleves`.
 *
 * Les docs sont indexés par `codeMassar` (ID = code MASSAR). Chaque
 * doc suit le shape `EleveDoc` ci-dessous, qui inclut les translittérations
 * arabe → français pour la recherche bilingue.
 */

import {
  collection, query, where, getDocs, onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toDoc, toDocs } from './firestore'

export interface EleveDoc {
  id?:           string   // id du document Firestore (fallback de clé quand codeMassar manque)
  codeMassar:    string
  nom:           string   // arabe
  prenom:        string   // arabe
  nomLatin?:     string   // translit
  prenomLatin?:  string   // translit
  nomComplet?:   string   // arabe complet (legacy MASSAR)
  classe:        string
  classes?:      string[] // si l'élève est dans plusieurs classes
  niveau?:       string
  dateNaissance?:string   // YYYY-MM-DD
  parentUid?:    string   // uid Auth du parent lié (indexé pour subscribeChildrenOfParent)
}

const COL = 'eleves'

/**
 * Liste les élèves filtrés par classes (optionnel).
 *
 * Firestore limite `in` à 10 valeurs — au-delà on chunke.
 */
export async function listEleves(filter?: { classes?: string[] }): Promise<EleveDoc[]> {
  if (!filter?.classes || filter.classes.length === 0) {
    const snap = await getDocs(collection(db, COL))
    return toDocs<EleveDoc>(snap)
  }

  const chunks: string[][] = []
  for (let i = 0; i < filter.classes.length; i += 10) {
    chunks.push(filter.classes.slice(i, i + 10))
  }

  const results: EleveDoc[] = []
  const seen   = new Set<string>()
  for (const chunk of chunks) {
    const q = query(collection(db, COL), where('classe', 'in', chunk))
    const snap = await getDocs(q)
    snap.docs.forEach(d => {
      const data = toDoc<EleveDoc>(d)
      const key = data.codeMassar || d.id
      if (!seen.has(key)) {
        seen.add(key)
        results.push(data)
      }
    })
  }
  return results
}

/**
 * Souscrit en temps réel aux élèves d'un set de classes.
 * Retourne la fonction d'unsubscribe.
 */
export function subscribeEleves(
  classes: string[],
  onChange: (eleves: EleveDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (classes.length === 0) {
    onChange([])
    return () => {}
  }
  // Firestore `in` limit = 10 — on prend juste les 10 premières classes
  // (un prof n'en a quasiment jamais plus).
  const safeClasses = classes.slice(0, 10)
  const q = query(collection(db, COL), where('classe', 'in', safeClasses))
  return onSnapshot(
    q,
    snap => onChange(toDocs<EleveDoc>(snap)),
    err  => { onError?.(err) },
  )
}

/**
 * Compte total d'élèves (utile pour les KPIs).
 */
export async function countEleves(classes?: string[]): Promise<number> {
  const list = await listEleves(classes ? { classes } : undefined)
  return list.length
}

/**
 * Souscrit aux enfants d'un parent (eleves où parentUid == parentUid).
 * Retourne la fonction d'unsubscribe.
 */
export function subscribeChildrenOfParent(
  parentUid: string,
  onChange: (eleves: EleveDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('parentUid', '==', parentUid))
  return onSnapshot(
    q,
    snap => onChange(toDocs<EleveDoc>(snap)),
    err  => { onError?.(err) },
  )
}

/**
 * Groupe les élèves par classe (utile pour l'affichage prof).
 */
export function groupByClasse(eleves: EleveDoc[]): Record<string, EleveDoc[]> {
  const out: Record<string, EleveDoc[]> = {}
  for (const e of eleves) {
    if (!out[e.classe]) out[e.classe] = []
    out[e.classe].push(e)
  }
  return out
}
