/**
 * Types partagés à travers l'app multi-rôles.
 *
 * Note sur les rôles : la base Firestore existante utilise les libellés
 * 'parent', 'professeur', 'admin'. Le nouveau code interne utilise la
 * convention 'student' / 'teacher' / 'admin' (plus courte, anglo-saxonne),
 * mais on lit/écrit la base avec les anciennes valeurs pour ne pas casser
 * l'app admin web et l'app parent existantes. Le mapping est dans
 * src/contexts/AuthContext.tsx.
 */

export type RoleRaw   = 'parent' | 'student' | 'professeur' | 'admin'
export type RoleLogic = 'student' | 'teacher'    | 'admin'

export interface UserProfile {
  uid:     string
  nom:     string
  prenom:  string
  email:   string
  role:    RoleRaw
  classe?:  string                // legacy : classe unique (1 prof = 1 classe)
  classes?: string[]              // nouveau : tableau de classes attribuées
  expoPushToken?: string
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
