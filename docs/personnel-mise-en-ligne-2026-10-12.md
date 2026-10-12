# Mise en ligne du personnel administratif — journal (12 octobre 2026)

Ce document suit ce qui est déjà en production et ce qui reste. Il complète `personnel-et-rapports-2026-10-12.md` (contenu des changements).

## État

| Étape | Élément | État | Heure (UTC) |
|---|---|---|---|
| 0 | Contrôle lecture seule (`scripts/checkBeforeStaffRelease.js`) | ✅ voie libre : 0 fiche avec `droits`, `poste` ou rôle `staff` ; règles en ligne = commit `12d3a00` | 12 oct., matin |
| 1 | Règles Firestore (projet `mojammaa-sgs`) | ✅ en ligne, ruleset `035695f1` | 07:48 |
| 2 | Fonctions `mojammaa-sgs` (codebase `default`) | ✅ déployées | ~08:00 |
| 2 | Fonctions `mojammaa-admin` (codebase `admin`) | ✅ déployées | ~08:00 |
| 3 | Site (Vercel) | ⏳ pas encore | — |
| 4 | Application mobile | ⏳ pas encore (mise à jour OTA, voir ci-dessous) | — |
| 5 | Droits de Mme Habiba et Kawtar | ⏳ | — |
| 6 | Compte de test du personnel | ⏳ | — |
| 7 | Conversion de Rachid, comptes de Khalid et Fatima | ⏳ | — |

Ce qui est visible par les utilisateurs aujourd'hui : **rien**. Les règles et les fonctions acceptent encore les mêmes comptes qu'avant ; aucun compte du personnel n'existe.

## Règles Firestore

- Déployées depuis `~/mojammaa-sgs` uniquement, à partir de `firestore.rules` (650 tests de règles OK avant déploiement).
- Vérification après déploiement : `node scripts/verifyRulesLive.js` → Firestore « EN PHASE », Storage inchangé (`78e3257a`, 28 septembre).
- Effet : nul ne peut plus écrire `poste` ni `droits` sur sa propre fiche ; les droits du personnel existent dans les règles.
- Retour arrière : redéployer `firestore.rules` depuis le commit `12d3a00`, puis relancer `verifyRulesLive.js`.

## Fonctions

Déployées par `firebase deploy --only functions --non-interactive` (sans l'option qui supprime les fonctions absentes du code).

Nouvelles, confirmées par la liste des fonctions du projet :

- `mojammaa-sgs` : `getStaffClasses`, `getStaffAttendanceLessons`.
- `mojammaa-admin` : `createStaffAccount`, `createStaffInvitation`, `createStaffRecoveryLink`, `convertAdminToStaff`, `saveStaffPoste`, `deleteStaffPoste`, `setStaffRights`, `listStaffAccess`, `revokeStaffInvitation`.

Mises à jour (même nom, nouveau code) : `getDashboardActions`, `loadAttendance`, `submitAttendance`, `onMessageCreated`, `getStatsStudentFile`, et les autres fonctions des fichiers modifiés (appointments, behaviorCancellation, prayerClassSessions, schoolAlerts, studentFileAccess, attendanceSubmission). La sortie de déploiement a été filtrée ; la mise à jour de chacune n'a pas été confirmée une par une, seule l'absence d'erreur l'a été.

Vérification : lecture des journaux récents (`firebase functions:log`), aucune erreur trouvée. Les fonctions qui servent le personnel ne sont appelées que par un compte du personnel, donc elles n'ont pas encore été exercées en production.

Retour arrière : redéployer les fonctions depuis le commit précédent de chaque dépôt (`f1f58ec` pour `mojammaa-sgs`, `e44ce39` pour `mojammaa-admin`).

## Ce qui reste, dans l'ordre

1. **Site** (depuis `~/mojammaa-admin`) : lancer la recette navigateur sur le dépôt fusionné, puis `vercel deploy --prod --yes`. Retour arrière : `vercel rollback`. Voir `docs/personnel-site-2026-10-12.md`.
2. **Application** : voir la section suivante.
3. **Comptes** : droits de Mme Habiba et Kawtar, compte de test, puis Rachid (conversion), Khalid et Fatima.

## Application mobile — pas de nouveau build nécessaire

- Depuis le tag `v1.0.18-51`, les changements sont du code uniquement (aucune dépendance native, `app.json`, `eas.json`, plugins inchangés) : une mise à jour OTA suffit.
- Préalable : 1.0.18 (51) doit être disponible sur Google Play pour tous. À vérifier avant : la promotion faite le 11 octobre peut encore attendre l'examen Google.
- Les téléphones restés en 1.0.17 ou 1.0.16 ne reçoivent pas ces changements ; aucun compte du personnel ne doit exister sur eux.
- Le personnel ne doit recevoir son compte qu'une fois la mise à jour installée (sinon il arrive dans l'interface parent).
- L'application n'a jamais été essayée sur un téléphone pour l'espace du personnel : premier essai avec un compte de test.

## Vérifications déjà faites

| Dépôt | Contrôle | Résultat |
|---|---|---|
| `mojammaa-sgs` | Règles Firestore | 650 tests OK |
| `mojammaa-sgs` | Tests et émulateur | 277 + 16 groupes OK ; export Android et iOS OK |
| `mojammaa-admin` | Tests du site | 163 OK |
| `mojammaa-admin` | Fonctions émulateur | 60 OK |
| `mojammaa-admin` | Recette navigateur (avant fusion) | 14 scénarios OK |

## À ne pas oublier

- `scripts/checkBeforeStaffRelease.js` n'est pas encore commité : à commiter avec ce journal.
- Le compte `googleplay-review` reste admin complet tant qu'il n'est pas retiré.
- Libellés arabes des droits : à corriger par Youssef (pas bloquant).
