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
import { toDocs } from './firestore'
import { getDocsChunked, subscribeChunked } from './chunkedQuery'

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
  active?:       boolean  // absent sur les anciens docs = actif (compatibilité)
  academicYear?: string
  archivedAt?:   unknown
  archivedBeforeAcademicYear?: string
}

const COL = 'eleves'

/** Les documents historiques sans champ `active` restent actifs. */
export function isActiveEleve(
  eleve: Pick<EleveDoc, 'active'> | Record<string, unknown>,
): boolean {
  return eleve.active !== false
}

/**
 * Liste les élèves filtrés par classes (optionnel).
 * Le nombre de classes n'est pas borné — cf. `chunkedQuery`.
 */
export async function listEleves(filter?: { classes?: string[] }): Promise<EleveDoc[]> {
  if (!filter?.classes || filter.classes.length === 0) {
    const snap = await getDocs(collection(db, COL))
    return toDocs<EleveDoc>(snap).filter(isActiveEleve)
  }

  const rows = await getDocsChunked<EleveDoc>(
    filter.classes,
    chunk => query(collection(db, COL), where('classe', 'in', chunk)),
  )

  // Dédup métier par codeMassar (un élève inscrit dans deux classes du filtre
  // ne doit compter qu'une fois) — plus stricte que la dédup par id de doc.
  const seen = new Set<string>()
  return rows.filter(eleve => {
    if (!isActiveEleve(eleve)) return false
    const key = eleve.codeMassar || eleve.id
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Souscrit en temps réel aux élèves d'un set de classes.
 *
 * Le nombre de classes n'est PAS borné : la version précédente ne gardait que
 * les 10 premières, si bien qu'un professeur enseignant sa matière dans plus de
 * 10 classes (courant au collège) perdait silencieusement les élèves des
 * classes suivantes — effectifs, suivi de devoirs et statistiques compris.
 */
export function subscribeEleves(
  classes: string[],
  onChange: (eleves: EleveDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeChunked<EleveDoc>(
    classes,
    chunk => query(collection(db, COL), where('classe', 'in', chunk)),
    rows => onChange(rows.filter(isActiveEleve)),
    onError,
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
    snap => onChange(toDocs<EleveDoc>(snap).filter(isActiveEleve)),
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
