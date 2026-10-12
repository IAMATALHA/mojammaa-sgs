# Mise en ligne du personnel administratif — journal (12 octobre 2026)

Ce document suit ce qui est déjà en production et ce qui reste. Il complète `personnel-et-rapports-2026-10-12.md` (contenu des changements).

## État

| Étape | Élément | État | Heure (UTC) |
|---|---|---|---|
| 0 | Contrôle lecture seule (`scripts/checkBeforeStaffRelease.js`) | ✅ voie libre : 0 fiche avec `droits`, `poste` ou rôle `staff` ; règles en ligne = commit `12d3a00` | 12 oct., matin |
| 1 | Règles Firestore (projet `mojammaa-sgs`) | ✅ en ligne, ruleset `035695f1` | 07:48 |
| 2 | Fonctions `mojammaa-sgs` (codebase `default`) | ✅ déployées | ~08:00 |
| 2 | Fonctions `mojammaa-admin` (codebase `admin`) | ✅ déployées | ~08:00 |
| 3 | Site (Vercel) | ✅ `b37475f`, déploiement `dpl_9o9SZnhHFbesfmFssrDvt3ffaSoe`, production READY | 08:15 |
| 4 | Application mobile | ✅ OTA Android 1.0.18 publiée ; manifeste servi vérifié ; réception sur téléphone à confirmer | 08:26 |
| 5 | Droits de Mme Habiba et Kawtar | ✅ Habiba superadmin vérifiée ; Kawtar : `comptes.gerer`, `codes.professeurs`, audit vérifié | 12 oct., après OTA |
| 6 | Compte de test du personnel | ⏳ après confirmation de la mise à jour sur le téléphone de recette | — |
| 7 | Conversion de Rachid, comptes de Khalid et Fatima | ⏳ après recette du compte test et mise à jour des téléphones concernés | — |

Le site public sert les nouveaux Rapports (direction), Personnel et droits (superadmins ou droit explicite), liens WhatsApp et message d'activation. Avant attribution : aucun compte du personnel, deux superadmins, aucun droit `comptes.gerer` explicitement attribué. Kawtar possède maintenant les deux droits prévus ; Mme Habiba possède déjà tous ces accès en tant que superadmin.

## Site — vérification après publication

- Source : `mojammaa-admin` au commit `b37475f`, exporté dans un dossier propre ; fichiers non suivis exclus selon le compte rendu de déploiement.
- Vercel : `mojammaa-admin-cz912y36a-youssefatalha-7142s-projects.vercel.app`, READY et production ; alias `mojammaa.com` confirmé par l'API.
- Routes `/`, `/login`, `/parents`, `/statistiques` : HTTP 200 sur le domaine public et l'alias Vercel. Navigateur anonyme : affichage et redirections de connexion corrects, aucune erreur JavaScript non interceptée.
- SHA-256 des fichiers JavaScript principal et Rapports : identiques à une compilation fraîche de `b37475f`.
- TypeScript, tests unitaires et 14/14 scénarios navigateur relancés sur le dépôt fusionné : OK (autorisations et refus sur émulateurs).
- Reste la recette connectée en production : exports Excel/PDF et accès du personnel.
- Retour arrière du site : `vercel rollback` depuis `~/mojammaa-admin` ; ne restaure pas les règles, fonctions ou comptes Firebase.

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

1. **Téléphone** : installer 1.0.18 (51) depuis Google Play, ouvrir l'application, laisser télécharger l'OTA, fermer complètement puis rouvrir ; réception à confirmer.
2. **Compte test** : créer/activer le compte sur le téléphone de recette à jour, vérifier accueil, pages autorisées et refus ; messages uniquement avec destinataires de test identifiés.
3. **Comptes réels** : Rachid (conversion), Khalid et Fatima après validation du test et de leurs téléphones.
4. **Site connecté** : vérifier les exports Excel et l'impression PDF avec la direction.

## OTA Android publiée

- Projet EAS `6ff4e5d9-040f-45df-ac65-5cf941ad8627`, compte `youssefatalha`, canal et branche `production`, environnement `production`.
- Source `2b69365da1c7ea3c554c4d3a955deaec559c369e`, runtime `1.0.18`, Android uniquement. Aucune modification des dépendances, plugins ou configurations natives depuis `v1.0.18-51`.
- TypeScript et 277/277 tests réussis avant publication ; export Android réussi.
- Groupe : `98647c4a-7ccb-41de-b3b2-8dec03cca2ff` ; mise à jour Android : `01a12f38-2c31-733a-a818-fe63dd8a8745`.
- Tableau de bord : https://expo.dev/accounts/youssefatalha/projects/mojammaa-sgs/updates/98647c4a-7ccb-41de-b3b2-8dec03cca2ff
- Serveur `u.expo.dev` interrogé avec plateforme Android, runtime 1.0.18 et canal production : manifeste contenant cet identifiant confirmé. Cela ne prouve pas encore son installation ni son fonctionnement sur un téléphone réel.
- Aucune OTA iOS ou 1.0.16/1.0.17 publiée dans cette opération.
- Retour arrière possible vers le code embarqué du build 51 : `eas update:roll-back-to-embedded --channel production --runtime-version 1.0.18 --platform android --message "Retour au build 51" --non-interactive` (commande vérifiée dans l'aide, non exécutée).

## Droits administratifs appliqués

- Habiba : superadmin confirmée via la liste de production ; aucune écriture nécessaire.
- Kawtar : deux droits explicites accordés via `setStaffRights` en production sous l'autorité de Youssef : `codes.professeurs` et `comptes.gerer`. Rôle `admin` conservé.
- Vérification : fiche relue, droits exacts, `listStaffAccess` confirme la gestion des comptes et entrée `staff.rights.set` dans `auditLog` avec l'acteur et les droits attendus.
- Preuve d'accès : `listStaffAccess` authentifié en superadmin → 200 ; sans connexion → 401. Les refus plus fins sont couverts par les 14 scénarios sur émulateurs.
- Aucun compte `staff` créé ou converti pendant cette étape.

## Application mobile — pas de nouveau build nécessaire

- Depuis le tag `v1.0.18-51`, les changements sont du code uniquement (aucune dépendance native, `app.json`, `eas.json`, plugins inchangés) : une mise à jour OTA suffit.
- Google Play vérifié dans la console le 12 octobre : **1.0.18 (51), Available on Google Play, Production, rollout 100 %**, publiée le 11 octobre à 18:18 selon l'heure affichée par la console ; disponible dans 178/178 pays/régions, aucune modification en attente. Cela confirme la disponibilité, pas l'installation sur chaque téléphone.
- Les téléphones restés en 1.0.17 ou 1.0.16 ne reçoivent pas ces changements ; aucun compte du personnel ne doit exister sur eux.
- Le personnel ne doit recevoir son compte qu'une fois la mise à jour installée (sinon il arrive dans l'interface parent).
- L'espace personnel de cette OTA n'a pas encore été essayé sur un téléphone : premier essai à faire avec un compte de test.

## Vérifications déjà faites

| Dépôt | Contrôle | Résultat |
|---|---|---|
| `mojammaa-sgs` | Règles Firestore | 650 tests OK |
| `mojammaa-sgs` | Tests et émulateur | 277 + 16 groupes OK ; export Android et iOS OK |
| `mojammaa-admin` | Tests du site | 163 OK |
| `mojammaa-admin` | Fonctions émulateur | 60 OK |
| `mojammaa-admin` | Recette navigateur sur le dépôt fusionné | 14/14 OK, relancée après publication |

## À ne pas oublier

- `scripts/checkBeforeStaffRelease.js` et la première version de ce journal sont commités dans `2b69365`.
- Le compte `googleplay-review` reste admin complet tant qu'il n'est pas retiré.
- Libellés arabes des droits : à corriger par Youssef (pas bloquant).
