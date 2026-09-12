/**
 * Coefficients réglementaires des matières — lecture côté application.
 *
 * Source : `settings/coefficients`, le MÊME document que celui consommé par
 * `makeCoefOf` (functions/schoolStats.js) et écrit par
 * `scripts/setupCoefficients.js`. Lisible par tout utilisateur connecté
 * (firestore.rules : « l'app mobile pourra pondérer les moyennes avec les
 * mêmes coefficients »).
 *
 * POURQUOI : le bulletin du parent calculait sa moyenne générale comme une
 * moyenne arithmétique des matières, alors que l'administration applique les
 * coefficients ministériels depuis leur déploiement. Le même élève affichait
 * donc deux moyennes générales selon l'écran. On reprend ici la résolution du
 * serveur, à l'identique.
 *
 * Ordre de résolution (miroir de `makeCoefOf`) :
 *     parNiveau[niveau][matiere]  >  matieres[matiere]  >  1
 *
 * Les alias de matières reprennent la politique partagée du serveur.
 * Les bulletins ouverts souscrivent aux modifications de l'administration.
 */
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import policy from '../../functions/lib/collegeEvaluationPolicy.json'
import { db } from '../config/firebase'
import { docData } from './firestore'

export interface CoefficientsDoc {
  matieres?:  Record<string, number>
  parNiveau?: Record<string, Record<string, number>>
}

/** Résout le coefficient d'une matière pour un niveau donné. */
export type CoefOf = (matiere: string, niveau?: string | null) => number

/**
 * Canonisation des libellés : casse, accents et espaces multiples ne doivent
 * pas créer deux matières distinctes. Même normalisation que `normalizeText`
 * côté serveur (accents retirés, ponctuation réduite à des espaces).
 */
function normalizeSubject(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Construit la fonction de résolution à partir du document brut. */
export function makeCoefOf(coefficients: CoefficientsDoc | null): CoefOf {
  const canonicalKey = (label: string) => {
    const key = normalizeSubject(label)
    for (const subject of Object.values(policy.subjects)) {
      if ([subject.canonical, ...subject.aliases].some(alias => normalizeSubject(alias) === key)) return normalizeSubject(subject.canonical)
    }
    return key
  }
  const normalizedMap = (values: Record<string, number>) => new Map(
    Object.entries(values || {}).map(([key, value]) => [canonicalKey(key), value]),
  )
  const global = normalizedMap(coefficients?.matieres || {})
  const byLevel = new Map(
    Object.entries(coefficients?.parNiveau || {}).map(([niveau, values]) => [
      niveau,
      normalizedMap(values || {}),
    ]),
  )

  return (matiere, niveau) => {
    const key = canonicalKey(matiere)
    const alias = niveau?.replace(/^([123])APIC$/, '$1AC')
    const forLevel = niveau ? (byLevel.get(niveau)?.get(key) ?? byLevel.get(alias || '')?.get(key)) : undefined
    if (forLevel !== undefined && forLevel > 0) return forLevel
    const g = global.get(key)
    return g !== undefined && g > 0 ? g : 1
  }
}

/** An admin edit is reflected in open parent reports without restarting the app. */
export function subscribeCoefficients(onChange: (data: CoefficientsDoc | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(db, 'settings', 'coefficients'), snap => {
    const data = docData<CoefficientsDoc>(snap)
    cached = Promise.resolve(data)
    onChange(data)
  }, onError)
}

// Le document change au rythme des arrêtés ministériels (une fois par an au
// plus) : le relire à chaque montage d'écran serait du gaspillage. Un cache de
// process suffit — un redémarrage de l'app le vide.
let cached: Promise<CoefficientsDoc | null> | null = null

/**
 * Lit `settings/coefficients` (mis en cache pour la session).
 * En cas d'échec de lecture, renvoie `null` : les moyennes retombent alors sur
 * un coefficient 1 partout, c'est-à-dire le comportement d'avant pondération —
 * jamais une erreur affichée au parent.
 */
export function getCoefficients(): Promise<CoefficientsDoc | null> {
  if (!cached) {
    cached = getDoc(doc(db, 'settings', 'coefficients'))
      .then(snap => docData<CoefficientsDoc>(snap))
      .catch(() => null)
  }
  return cached
}

/** Vide le cache (tests, ou rechargement explicite après modification admin). */
export function resetCoefficientsCache(): void {
  cached = null
}
