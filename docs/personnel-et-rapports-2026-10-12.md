# Personnel administratif, Rapports et corrections — 11 et 12 octobre 2026

**Tout est commité sur `feat/parent-phone-login` dans les deux dépôts. Rien n'est poussé, rien n'est déployé.** Les familles, les professeurs et la direction utilisent toujours la version précédente.

## Ce qui change

### 1. Comptes du personnel (rôle `staff`)

Un compte du personnel n'a aucun droit par défaut. On lui donne un **poste** (titre affiché) et on coche des **droits**. Ce qui n'est pas coché est refusé par les règles et par les fonctions.

| Personne | Compte | Ce qu'elle peut faire |
|---|---|---|
| Mme Habiba | admin, superadmin | Tout ; décide avec Youssef qui peut gérer les droits |
| Kawtar | admin | Tout, comme Mme Habiba ; gère les comptes du personnel une fois le droit accordé |
| Rachid, Khalid | staff, « Surveillant général » | Élèves, présences (appel), notes en lecture, mérites, sortie, prière, suivi, messages de l'administration, emploi du temps, codes parents |
| Rachid, en plus | | Codes professeurs, classes des enseignants |
| Fatima | staff, « Relations parents » | Codes parents et professeurs, élèves, présences et notes en lecture, emploi du temps |

- Page **Personnel et droits** : créer un compte, remettre son code d'activation, cocher ses droits, créer un poste, récupérer un accès perdu. Chaque changement est journalisé.
- Seul un superadmin (Youssef, Mme Habiba) accorde le droit de gérer les comptes.
- Un compte du personnel ne supprime jamais une donnée d'élève.

### 2. Site

- Accueil et menu du personnel selon ses droits.
- Pages ouvertes au personnel : Élèves, Présences, Notes et bulletins (lecture), Mérites, Messages, Enseignants (classes seulement), Codes parents, Codes professeurs, Emploi du temps en lecture seule (`/horaires`, à imprimer).
- Liens WhatsApp : numéros sans zéro initial, chiffres arabes et préfixes internationaux désormais corrects.
- Message d'activation parent raccourci, identique à celui de l'application.

### 3. Rapports (direction seulement)

- Réservés au rôle admin : Mme Habiba et Kawtar. Aucun droit ne les ouvre au personnel.
- Nouvel onglet **Vue d'ensemble**, ouvert d'office : élèves, classes, enseignants, comptes parents, assiduité, moyenne, réussite, élèves à suivre ; tableaux par niveau, classement des classes, par matière ; répartition des moyennes ; absences et retards par jour.
- **Exporter en Excel** : un classeur complet (synthèse, niveaux, classes classées, matières, répartition, absences par jour, progression, élèves à suivre).
- **PDF / Imprimer** : le même rapport en A4 ; dans la fenêtre d'impression, choisir « Enregistrer au format PDF ».
- Aucun changement côté serveur pour cette page.

### 4. Application mobile

- Un compte du personnel arrive dans son propre accueil (avant : l'interface parent).
- Écrans selon les droits : appel sur la séance d'un professeur, déclarations d'absence des parents, sortie, prière, messages, rendez-vous. Les autres pages ouvrent le site.

### 5. Corrections de l'audit de Codex (E1 à E5)

Script des parents orphelins (E1, E2), feuille « Ajouter un enfant » (E3), activation parent par e-mail (E4), liens WhatsApp de l'application (E5). Détail : `docs/audit-enhancements-2026-10-11-codex.md`.

### 6. Abandonné

Le restyle de la page d'accueil du 11 octobre, refusé par Youssef. Conservé sur la branche `archive/accueil-restyle-2026-10-11` de `mojammaa-admin`.

## Commits

| Dépôt | Commit | Contenu |
|---|---|---|
| `mojammaa-sgs` | `f1f58ec` | Corrections E1 à E5, message parent |
| `mojammaa-sgs` | `718915b` | Règles et fonctions du personnel |
| `mojammaa-sgs` | `ff56a28` | Application mobile du personnel |
| `mojammaa-admin` | `3dcd6b0` | Site du personnel, Rapports |
| `mojammaa-admin` | `9ec5f1b` | Récupération d'accès, accueil, numéros WhatsApp |
| `mojammaa-admin` | `befff6e` | Message parent du site |
| `mojammaa-admin` | `b79477a` | Fusion |

## Vérifications faites

| Vérification | Résultat |
|---|---|
| Règles Firestore | 650 tests |
| `mojammaa-sgs` : tests, émulateur, export Android et iOS | 277 tests, 16 groupes, export réussi |
| `mojammaa-admin` : tests du site | 163 tests |
| Fonctions du back-office sur émulateur | 60 tests |
| Navigateur, vraies règles (avant fusion) | 14 scénarios |
| Rapport PDF mis en pages par le navigateur | français et arabe, 2 pages |

Non vérifié : aucun essai sur un téléphone ; aucun essai avec les données réelles pour les pages du personnel ; la fenêtre d'impression n'est pas cliquée par les tests.

## Essayer

- **Personnel, sans toucher l'établissement** : dans `~/mojammaa-admin`, `npm run demo:personnel`, puis `http://127.0.0.1:4175/login`, onglet « E-mail », mot de passe `Demo-2026!`. Comptes : `superadmin@demo.test`, `direction@demo.test`, `surveillant@demo.test`, `parents@demo.test`, `prof@demo.test`. Rapports et le dossier 360° n'y répondent pas (fonctions de l'autre dépôt).
- **Rapports, avec les vrais chiffres** : dans `~/mojammaa-admin`, `npm run dev`, se connecter avec son compte d'administration, ouvrir Rapports. Lecture seule.
- **Application** : seulement après le déploiement des règles et des fonctions, avec un compte de test du personnel.

## Mise en ligne — ordre obligatoire

1. Vérifier en lecture seule qu'aucun compte de production ne porte déjà `droits` ou `poste`.
2. Règles (depuis `mojammaa-sgs` uniquement).
3. Fonctions de `mojammaa-sgs`, puis de `mojammaa-admin`.
4. Site.
5. Application, et attendre qu'elle soit sur les téléphones avant de créer un compte du personnel.
6. Droits de Mme Habiba et de Kawtar (gestion des comptes, codes professeurs).
7. Compte de test : boîte « Administration », message à une classe entière.
8. Conversion du compte de Rachid, puis comptes de Khalid et de Fatima.

Les règles passent avant les fonctions : sous les règles actuelles, un admin pourrait s'écrire lui-même un droit que les nouvelles fonctions croiraient.

## Reste à faire

- Libellés arabes des droits, à corriger par Youssef.
- Compte `googleplay-review` : toujours admin complet.
