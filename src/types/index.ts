/**
 * Types partagés à travers l'app multi-rôles.
 *
 * Note sur les rôles : la base Firestore existante utilise les libellés
 * 'parent', 'professeur', 'admin'. Smart Pickup ajoute 'chauffeur' comme
 * rôle principal possible pour les comptes chauffeur-only ; un parent qui
 * conduit conserve role:'parent' et reçoit son accès via driverProfiles/{uid}.
 * Le nouveau code interne utilise la convention
 * 'student' / 'teacher' / 'admin' / 'driver' (plus courte, anglo-saxonne),
 * mais on lit/écrit la base avec les anciennes valeurs pour ne pas casser
 * l'app admin web et l'app parent existantes. Le mapping est dans
 * src/contexts/AuthContext.tsx.
 */

export type RoleRaw   = 'parent' | 'student' | 'professeur' | 'admin' | 'chauffeur' | 'driver'
export type RoleLogic = 'student' | 'teacher' | 'admin' | 'driver'

export interface UserProfile {
  uid:     string
  nom:     string
  prenom:  string
  email:   string
  role:    RoleRaw
  classe?:  string                // legacy : classe unique (1 prof = 1 classe)
  classes?: string[]              // nouveau : tableau de classes attribuées
  matiere?: string                // prof : sa matière (verrouillée pour la saisie de notes)
  cycle?:   string                // prof : 'primaire' | 'college'
  expoPushToken?: string
  lastLoginAt?: unknown            // Firestore Timestamp — dernière connexion
  lastLoginPlatform?: 'ios' | 'android' | 'web'
}

export interface Eleve {
  id:           string
  nom:          string
  prenom:       string
  classe:       string
  niveau:       string
  codeMassar?:  string
  parentNom?:   string
  parentTel?:   string
  parentEmail?: string
  dateNaissance?: string
}
