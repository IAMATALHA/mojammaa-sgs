# Coefficients par niveau et dossier élève — 12 septembre 2026

## Fonctionnement

- Administration web : entrée « Coefficients », route `/coefficients`, réservée aux administrateurs. Les réglages mobiles proposent un lien vers cet écran.
- Saisie avant toute note, ajout de niveaux/matières, modification ultérieure, valeurs positives jusqu’à 100. Une case vide conserve le repli global, puis 1. Ce réglage concerne les moyennes ordinaires, pas l’examen régional.
- Sauvegarde par niveau dans `settings/coefficients`, transaction avec révision pour refuser les écrasements concurrents. Les autres niveaux et métadonnées sont conservés. Les deux appellations collège AC/APIC sont synchronisées.
- Callables `getCoefficientSettings` et `saveLevelCoefficients` : rôle admin relu en base. Aucun renseignement nominatif dans les options du formulaire.
- Les bulletins web et parent mobile souscrivent aux changements de coefficients. Les statistiques déjà ouvertes nécessitent leur actualisation habituelle.

## Cause des absences invisibles

La requête web par élève sans contrainte de classe était refusée aux enseignants par les règles Firestore. L’erreur était masquée et rendue comme une absence de données. De plus, `getStatsStudentFile` était exclusivement admin.

- Web : ajout du filtre de classe pour l’enseignant, abonnement aux absences, séparation erreur/chargement/liste vide. L’administrateur conserve l’historique toutes classes.
- Dossier pédagogique : enseignant autorisé uniquement pour les élèves actifs de ses classes. Les notes et les métriques de notes restent limitées à sa matière. Les autres drill-downs restent admin.
- Mobile : ouverture du dossier depuis la liste des élèves d’une classe, avec jours d’absence et dernières séances sur la période annoncée.

## Vérifications effectuées

- Lecture Firebase ciblée : l’absence signalée existe. Anciennes requêtes refusées au rôle professeur ; nouvelle requête correctement bornée autorisée.
- Fonctions locales exécutées en lecture seule sur les mêmes données : un jour d’absence et une séance retrouvés pour admin et professeur autorisé.
- Tests : `npm run test:stats`, `node --test tests/functions/coefficientSettings.test.mjs tests/functions/studentFileAccess.test.mjs tests/services/teacherPerformance.test.mjs`.
- TypeScript mobile, compilation web et export Android.
- Formulaire vérifié avec données fictives dans le navigateur : français/arabe, ordinateur/390 px, zéro refusé, sauvegarde du seul niveau choisi, autre niveau conservé.

## Mise en service

Déployé le 12 septembre 2026, sur demande explicite de l’utilisateur :

- Firebase : `getCoefficientSettings`, `saveLevelCoefficients`, `getStatsStudentFile`, région `europe-west1`, déploiement réussi.
- Web : https://www.mojammaa.com/coefficients — Vercel `dpl_DBAjEvMVvJ9LpozTWLtu26dm1fmb`, READY puis promu en production. HTML et fichiers JavaScript Coefficients/Dossier identiques à la compilation testée ; en-têtes de sécurité conservés ; redirection connexion vérifiée dans le navigateur anonyme.
- Android : groupe EAS `8d35b5f8-7d0d-45a7-a574-b4cc087623a5`.
- iOS : groupe EAS `5e4b816d-5682-4f3c-bf46-d68abba81f5b`.
- Mobile : canal/branche `production`, runtime `1.0.16`. Publication séparée par plateforme après échec sans publication de `--platform all` (tentative d’export web, dépendance react-native-web absente). Aucun changement natif ajouté pour contourner cet échec.

Preuve en production : dossier HTTP 200 pour admin et professeur autorisé, un jour et une séance d’absence ; moyenne générale pour admin et matière uniquement pour professeur. Coefficients : lecture admin 200, sauvegarde vide refusée 400, lecture/écriture professeur refusées 403. Dossier anonyme refusé 401. Une première vérification immédiatement après création des endpoints a échoué sur une réponse non JSON ; après propagation, tous les contrôles ont réussi.

Aucune règle Firestore assouplie. Aucune note, absence ou grille de coefficients réelle modifiée. L’installation effective de l’OTA sur un téléphone n’a pas été observée ; fermer complètement puis rouvrir l’app, éventuellement deux fois, sur une installation 1.0.16.

Références de retour arrière : web `dpl_GDqdEds5phiwVF35J6xz38y43Wcj` ; Android `e66792b1-e437-43ae-a8bb-4b93cf267822` ; iOS `4509277f-eecb-43b4-9d25-4148037950bb`.

## Accès à l’historique administration

- Web : Présences → Historique → classe/date → Voir, puis ouvrir une séance.
- Mobile : Statistiques → période Année → tuile Assiduité → onglet Absences. L’écran opérationnel « Absences du jour » reste limité au jour courant.
- Notifications existantes : une alerte par séance marquée absente, déduplication des réenregistrements inchangés. La préférence utilisateur entre alerte par séance et alerte quotidienne a été demandée ; aucun changement de fréquence appliqué pendant ce déploiement.
