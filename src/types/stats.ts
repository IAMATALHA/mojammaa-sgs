/**
 * Contrat de périmètre statistique — partagé entre l'onglet Statistiques, les
 * écrans de drill-down et les callables admin.
 *
 * Règle unique du module : un écran de détail ne recalcule jamais son propre
 * périmètre. Il reçoit l'`AppliedScope` que le serveur a effectivement utilisé
 * pour produire le chiffre sur lequel l'admin a tapé, et le renvoie tel quel à
 * la callable de drill-down. C'est ce qui rend l'égalité tuile ↔ détail
 * structurelle plutôt que vérifiée après coup.
 */

export type StatsPeriod = 'semaine' | 'mois' | 'S1' | 'S2' | 'annee'
export type StatsCycle = '' | 'prescolaire' | 'primaire' | 'college'
export type StatsFilterKey = 'cycle' | 'niveau' | 'classe' | 'matiere'

export interface StatsScope {
  period: StatsPeriod
  cycle: StatsCycle
  niveau: string
  classe: string
  matiere: string
}

/**
 * Périmètre renvoyé par `getFilteredSchoolStats.applied` — le serveur clampe
 * les valeurs inconnues, donc ceci peut différer de ce que le client a demandé.
 *
 * `notesPeriod` est volontairement distinct de `period` : les notes ne portent
 * aucune date d'évaluation (`createdAt` est la date de saisie), leur seule
 * granularité fiable est le semestre. En vue Semaine/Mois la moyenne couvre
 * donc le semestre en cours, et l'UI doit l'annoncer au lieu de laisser croire
 * à une moyenne hebdomadaire.
 */
export interface AppliedScope extends StatsScope {
  notesPeriod: 'S1' | 'S2' | 'annee'
  from: string
  to: string
}

/**
 * Segments de la liste d'élèves. Tous partagent le même périmètre, la même
 * projection et le même gate admin : une seule callable, un seul endroit où
 * filtrer les données nominatives.
 *
 * `band` et `threshold` sont deux lectures du MÊME partitionnement — celui de
 * `gradeDistribution`, dont la borne (≥10) est aussi le seuil de `successRate`.
 * « Sous le seuil » est l'union des deux bandes basses, « réussissant » celle
 * des deux hautes ; aucun second calcul n'est possible, donc aucune divergence.
 */
export type StudentSegment = 'all' | 'followup' | 'recidivists' | 'band' | 'threshold'

export type GradeBandLabel = '<8' | '8-10' | '10-14' | '14+'

export type FollowUpReason =
  | 'low_average'
  | 'declining'
  | 'absenteeism'
  | 'homework_not_done'
  | 'homework_not_submitted'

export type FollowUpPriority = 'low' | 'medium' | 'high'

/** Valeurs qui justifient chaque badge — le détail doit porter sa propre preuve. */
export interface FollowUpMetrics {
  average?: number
  semesterS1?: number
  semesterS2?: number
  decline?: number
  /** Numérateur ET dénominateur : le badge affiche « 3 j. / 24 j. observés ». */
  absentDays?: number
  observedDays?: number
  homeworkNotDone?: number
  homeworkNotSubmitted?: number
}

/**
 * Élève tel qu'il traverse le réseau. Projection MINIMALE et volontaire :
 * ni date de naissance, ni parentUid, ni nom MASSAR complet, ni email.
 *
 * `id` est le code Massar (l'ID du document `eleves`). C'est un identifiant
 * technique admin-only : il circule dans les appels et les paramètres de
 * navigation, mais ne doit jamais être affiché ni journalisé.
 */
export interface ScopeStudent {
  id: string
  nom: string
  prenom: string
  classe: string
  niveau: string
  average: number | null
  reasons?: FollowUpReason[]
  metrics?: FollowUpMetrics
  priority?: FollowUpPriority
}

export interface ScopeStudentsResult {
  students: ScopeStudent[]
  total: number
  nextCursor: string | null
}
