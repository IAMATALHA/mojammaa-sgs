# Mérites, observations et gestion des devoirs — 24 septembre 2026

Implémentation locale, non déployée.

- Motifs supplémentaires FR/AR/EN : leçon non copiée, manque d’attention, bavardages, travail incomplet, interruptions, retard, travail soigné, progrès, respect, autonomie.
- Observations suggérées et aperçu avant envoi. « Autre motif » exige une précision ; correction orthographique du clavier activée, aucune correction IA.
- Modification depuis la liste professeur et le détail partagé professeur/admin : titre, consigne, type, date, pièces jointes. La classe et l’auteur restent fixes pour préserver les liens des rendus.
- Suppression confirmée : suppression réelle sans suivi ; annulation avec conservation dès qu’un document de suivi/rendu existe.
- Notification transactionnelle aux familles. Les corrections de texte peuvent être silencieuses ; date/type/pièces jointes et suppressions sont toujours signalés.
- Lecture en direct du détail ; rafraîchissement des listes au retour ; annulations exclues des compteurs, statistiques, calendrier, tâches parent et récapitulatif hebdomadaire.

## Sécurité et exploitation

`manageHomework` vérifie l’identité, le rôle, le propriétaire, la version et les rendus côté serveur. Les commandes sont idempotentes grâce à une collection privée `homeworkCommands`. Les règles interdisent les modifications/suppressions directes de devoirs ; la création est limitée à l’auteur et à ses classes (ou administration).

Déployer les fonctions modifiées et `firestore.rules` avec la nouvelle application. La fonction `manageHomework` doit être disponible avant de distribuer l’application ; les nouveaux libellés de notifications nécessitent aussi les fonctions de comportement mises à jour. Aucun déploiement ni envoi réel effectué pendant cette tâche.

## Vérification

- TypeScript sans erreur.
- Export Android Expo/Hermes réussi (ce n’est pas un build APK).
- Émulateur Firestore : 327 tests de règles et 8 scénarios de gestion des devoirs réussis, données fictives uniquement.
- Tests des statistiques devoirs, progression des mérites et libellés/notifications FR/AR/EN réussis.
- Parcours tactile sur appareil/simulateur et réception réelle des notifications non vérifiés.

Reproduire :

```sh
npm run typecheck
node tests/services/behavior-copy.test.mjs
npm run test:school-stats
npm run test:merit-progress
firebase emulators:exec --only firestore --project demo-mojammaa-rules "node tests/rules/firestore.rules.test.mjs && node tests/functions/homeworkManagement.test.mjs"
```

L’émulateur demande Java 21 ou supérieur ; Java 21 local : `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.

## Périmètre de déploiement proposé

Projet Firebase `mojammaa-sgs`, région `europe-west1` :

- Gestion et notifications : `manageHomework`, `getDashboardActions`, `onBehaviorAlertCreated`, `onBehaviorAlertWritten`, `weeklyDigest`.
- Exclusion des devoirs annulés des statistiques partagées : `aggregateSchoolStats`, `recomputeSchoolStats`, `getFilteredSchoolStats`, `getStatsStudents`, `getStatsAttendanceDetails`, `getStatsGradeDetails`, `getStatsStudentFile`, `getStatsHomework`.
- Règles : `firestore.rules`.
- EAS : Android et iOS, canal/branche/environnement `production`, runtime `1.0.16`, projet `6ff4e5d9-040f-45df-ac65-5cf941ad8627`.

Le fichier serveur `index.js` comporte aussi des changements antérieurs sur les filtres statistiques (année scolaire, niveaux et matières). Leur présence en production n’a pas été établie ; déployer ces fonctions peut également les publier. Les modifications antérieures de l’interface correspondent aux publications EAS documentées des 22–23 septembre.

La première commande de déploiement a été rejetée par le contrôle automatique avant son exécution : périmètre de production jugé trop large pour l’autorisation donnée. Aucun déploiement Firebase ni publication EAS de cette livraison à ce stade.

## Publication effectuée

Après autorisation explicite du périmètre complet : les 13 fonctions et règles Firestore sont déployées avec succès sur `mojammaa-sgs` le 24 septembre 2026.

EAS production Android/iOS, runtime `1.0.16` : groupe `022d23ca-b3dd-4077-ab4b-b36d4cce3e29`. Identifiants Android `01a0d4b1-5218-70bd-9b26-851c92f0c876`, iOS `01a0d4b1-5218-7a1b-8893-9fd4cb9eb2ba`. Les manifests HTTPS de production des deux plateformes ont été vérifiés et servent ces identifiants. Aucun parcours sur appareil réel effectué.
