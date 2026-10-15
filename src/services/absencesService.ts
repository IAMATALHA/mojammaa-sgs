/**
 * absencesService — lectures Firestore de la collection `absences`.
 *
 * Format des docs (créé par TeacherAttendanceScreen) :
 *   {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut: 'present' | 'absent' | 'retard', academicYear, semestre, monthKey,
 *     professorId, createdAt
 *   }
 */

import {
  collection, query, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { subscribeChunked } from './chunkedQuery'
import { localISODate } from '../utils/academicPeriod'

export interface AbsenceDoc {
  id?:           string
  eleveId:       string
  eleveNom?:     string
  elevePrenom?:  string
  classe:        string
  date:          string   // ISO 'YYYY-MM-DD'
  academicYear?: string
  semestre?:     string
  monthKey?:     string
  seance:        string   // 'S1'..'S6'
  statut:        'present' | 'absent' | 'retard'
  professorId?:  string
  justified?:    boolean
  raison?:       string
}

const COL = 'absences'

/**
 * Taux de présence des classes d'un prof pour une date. Absents = docs
 * `statut='absent'`, comptés une seule fois par élève même s'il manque
 * plusieurs séances. `totalEleves` est FOURNI par l'appelant (le tableau de
 * bord souscrit déjà aux élèves de ses classes) plutôt que relu ici. La date
 * est en heure LOCALE (`localISODate()`), comme à l'écriture des appels.
 * Retourne un % arrondi 0..100 ; sans élève, 100 par convention.
 */
function presenceRateFromAbsences(absences: AbsenceDoc[], totalEleves: number): number {
  if (totalEleves <= 0) return 100
  const totalAbsents = new Set(absences.map(a => a.eleveId).filter(Boolean)).size
  return Math.round((Math.max(0, totalEleves - totalAbsents) / totalEleves) * 100)
}

/**
 * Même taux, en temps réel (audit 2026-10-15, A03) : l'accueil du professeur
 * reste monté pendant l'appel, la lecture ponctuelle y restait figée. L'écoute
 * ne porte que sur les absents du jour, quelques documents par classe.
 */
export function subscribeTeacherPresenceRate(
  classes: string[],
  totalEleves: number,
  date: string,
  onRate: (rate: number) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeChunked<AbsenceDoc>(
    classes,
    chunk => query(
      collection(db, COL),
      where('classe', 'in', chunk),
      where('date',   '==', date),
      where('statut', '==', 'absent'),
    ),
    rows => onRate(presenceRateFromAbsences(rows, totalEleves)),
    onError,
  )
}

/**
 * Souscrit aux appels d'une liste d'élèves sur le MOIS courant, tous statuts
 * confondus (présents inclus).
 *
 * Fenêtre volontairement courte : l'appel écrit un document par élève ET par
 * séance, présences comprises. Sur une année scolaire cela représente environ
 * 6 × 180 ≈ 1 000 documents par enfant — trop pour un tableau de bord qui n'a
 * besoin que d'un taux récent. Le mois en représente ~130.
 *
 * Pour l'HISTORIQUE que le parent consulte, utiliser
 * `subscribeAbsenceHistoryForEleves` : il porte sur l'année mais ne remonte
 * que les absences, dont le volume est sans commune mesure.
 */
export function subscribeAbsencesForEleves(
  eleveIds: string[],
  period: { academicYear: string; monthKey: string },
  onChange: (list: AbsenceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeChunked<AbsenceDoc>(
    eleveIds,
    chunk => query(
      collection(db, COL),
      where('eleveId', 'in', chunk),
      where('academicYear', '==', period.academicYear),
      where('monthKey', '==', period.monthKey),
    ),
    onChange,
    onError,
  )
}

/**
 * Souscrit à l'HISTORIQUE d'absences d'une liste d'élèves, sur toute l'ANNÉE
 * scolaire.
 *
 * Le filtre `monthKey` employé auparavant vidait la liste du parent à chaque
 * 1er du mois — le même défaut que celui corrigé pour messages/ressources/
 * devoirs en 0f58915, resté ici. L'année est donc la bonne fenêtre.
 *
 * Ce qui rend l'année tenable, c'est `statut == 'absent'` : les présences,
 * écrites à chaque séance, pèsent 95 % de la collection et n'apparaissent pas
 * dans cet écran. On passe de ~1 000 documents par enfant et par an à quelques
 * dizaines.
 *
 * Retards aussi (audit 2026-10-15, A02) : l'écran parent affiche un compteur
 * « Retards » qui restait à zéro. Deux écoutes (absent, retard) plutôt qu'un
 * `statut in [...]` : combiné au `eleveId in` (30 valeurs), il dépasserait la
 * limite de 30 disjonctions de Firestore. Même index (eleveId, academicYear,
 * statut) pour les deux.
 */
export function subscribeAbsenceHistoryForEleves(
  eleveIds: string[],
  period: { academicYear: string },
  onChange: (list: AbsenceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const lists: Record<'absent' | 'retard', AbsenceDoc[] | null> = { absent: null, retard: null }
  const listen = (statut: 'absent' | 'retard') => subscribeChunked<AbsenceDoc>(
    eleveIds,
    chunk => query(
      collection(db, COL),
      where('eleveId', 'in', chunk),
      where('academicYear', '==', period.academicYear),
      where('statut', '==', statut),
    ),
    list => {
      lists[statut] = list
      // Publié quand les deux écoutes ont répondu : pas de compteur qui saute.
      if (lists.absent && lists.retard) onChange([...lists.absent, ...lists.retard])
    },
    onError,
  )
  const unsubs = [listen('absent'), listen('retard')]
  return () => unsubs.forEach(unsub => unsub())
}

/**
 * Taux de présence d'un élève sur les `daysWindow` derniers jours.
 *
 * Le dénominateur vient des DONNÉES, pas d'une constante : l'appel écrit un doc
 * par élève et par séance, `statut` valant 'present', 'absent' ou 'retard'.
 * Un retard compte comme une présence : seuls les jours portés absents réduisent
 * le taux.
 *
 * C'est ce qui rend le calcul indépendant de la fenêtre de données qu'on lui
 * passe. L'ancienne version divisait par un forfait de 22 jours d'école alors
 * qu'elle ne recevait que le mois courant : le 2 du mois, le dénominateur était
 * vingt fois trop grand et le taux remontait à ~100 % quelles que soient les
 * absences. Ici, un début de mois donne simplement un taux calculé sur les
 * quelques jours déjà appelés.
 *
 * Convention : aucun appel sur la fenêtre ⇒ 100 (rien à signaler).
 */
export function computeChildPresenceRate(
  absences: AbsenceDoc[],
  eleveId:  string,
  daysWindow = 30,
): number {
  const since = new Date()
  since.setDate(since.getDate() - daysWindow)
  const sinceISO = localISODate(since)

  const joursAppeles = new Set<string>()
  const joursAbsents = new Set<string>()
  absences.forEach(a => {
    if (a.eleveId !== eleveId || !a.date || a.date < sinceISO) return
    joursAppeles.add(a.date)
    if (a.statut === 'absent') joursAbsents.add(a.date)
  })

  if (joursAppeles.size === 0) return 100
  const rate = (joursAppeles.size - joursAbsents.size) / joursAppeles.size
  return Math.round(Math.max(0, Math.min(1, rate)) * 100)
}
