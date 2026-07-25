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
 * LIMITE CONNUE : le serveur canonise en plus les libellés via les alias de
 * `collegeEvaluationPolicy.json` (« Maths » → « Mathématiques »), que l'app
 * n'embarque pas. Sans effet en pratique — `setupCoefficients.js` vérifie
 * chaque clé contre les libellés réellement présents en base — mais un
 * coefficient saisi sous un alias retomberait ici à 1.
 */
import { doc, getDoc } from 'firebase/firestore'
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
  const normalizedMap = (values: Record<string, number>) => new Map(
    Object.entries(values || {}).map(([key, value]) => [normalizeSubject(key), value]),
  )
  const global = normalizedMap(coefficients?.matieres || {})
  const byLevel = new Map(
    Object.entries(coefficients?.parNiveau || {}).map(([niveau, values]) => [
      niveau,
      normalizedMap(values || {}),
    ]),
  )

  return (matiere, niveau) => {
    const key = normalizeSubject(matiere)
    const forLevel = niveau ? byLevel.get(niveau)?.get(key) : undefined
    if (forLevel !== undefined && forLevel > 0) return forLevel
    const g = global.get(key)
    return g !== undefined && g > 0 ? g : 1
  }
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
