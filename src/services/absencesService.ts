/**
 * absencesService — lectures Firestore de la collection `absences`.
 *
 * Format des docs (créé par TeacherAttendanceScreen) :
 *   {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut: 'present' | 'absent', academicYear, semestre, monthKey,
 *     professorId, createdAt
 *   }
 */

import {
  collection, query, where, type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { getDocsChunked, subscribeChunked } from './chunkedQuery'
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
 * Date du jour en heure LOCALE. Les appels sont ÉCRITS avec `localISODate()`
 * (TeacherAttendanceScreen) : lire avec `toISOString()` (UTC) interrogeait la
 * veille entre minuit et 1h du matin au Maroc (UTC+1).
 */
function todayISO(): string {
  return localISODate()
}

/**
 * Calcule le taux de présence pour les classes d'un prof, sur la date
 * passée (ou aujourd'hui par défaut). Absents = docs `statut='absent'`,
 * comptés une seule fois par élève même s'il manque plusieurs séances.
 *
 * `totalEleves` est FOURNI par l'appelant plutôt que relu ici. Le tableau de
 * bord professeur souscrit déjà aux élèves de ses classes (`subscribeEleves`) :
 * les relire pour les compter doublait les documents chargés à chaque ouverture
 * — de l'ordre de 350 documents inutiles pour un professeur à douze classes, à
 * 600 élèves. L'appelant tient de toute façon le compte filtré par
 * `isActiveEleve`, donc le chiffre est identique.
 *
 * Retourne un % arrondi 0..100. Si aucune classe ou aucun élève,
 * renvoie 100 (rien à signaler → présence parfaite par convention).
 */
export async function computeTeacherPresenceRate(
  classes: string[],
  totalEleves: number,
  date = todayISO(),
): Promise<number> {
  if (classes.length === 0 || totalEleves <= 0) return 100

  const absencesDuJour = await getDocsChunked<AbsenceDoc>(
    classes,
    chunk => query(
      collection(db, COL),
      where('classe', 'in', chunk),
      where('date',   '==', date),
      where('statut', '==', 'absent'),
    ),
  )
  // Compte unique par eleveId (un élève peut être absent à plusieurs séances le même jour)
  const totalAbsents = new Set(
    absencesDuJour.map(a => a.eleveId).filter(Boolean),
  ).size

  const rate = Math.max(0, totalEleves - totalAbsents) / totalEleves
  return Math.round(rate * 100)
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
 * NB : les retards ne sont pas remontés — l'écran les filtrait déjà côté
 * client (`useParentAbsences`), le comportement visible est inchangé.
 */
export function subscribeAbsenceHistoryForEleves(
  eleveIds: string[],
  period: { academicYear: string },
  onChange: (list: AbsenceDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeChunked<AbsenceDoc>(
    eleveIds,
    chunk => query(
      collection(db, COL),
      where('eleveId', 'in', chunk),
      where('academicYear', '==', period.academicYear),
      where('statut', '==', 'absent'),
    ),
    onChange,
    onError,
  )
}

/**
 * Taux de présence d'un élève sur les `daysWindow` derniers jours.
 *
 * Le dénominateur vient des DONNÉES, pas d'une constante : l'appel écrit un doc
 * par élève et par séance, `statut` valant 'present' ou 'absent'. On compte donc
 * les jours réellement appelés, et parmi eux ceux où l'élève a été porté absent.
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
