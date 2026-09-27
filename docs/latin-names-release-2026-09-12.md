# Publication des noms latins — 12 septembre 2026

## Site administration

- Production : https://www.mojammaa.com
- Vercel : `dpl_FecZVJ9FVTek5Y8Nzcp7jmTuZNux`, état READY.
- 11 fichiers intégrés de la préparation `/private/tmp/mojammaa-latin-wspx50lw` vers `/Users/atalhayoussef/mojammaa-admin` après revue des différences et contrôle des empreintes.
- Saisie : Élèves → Modifier → nom et prénom en caractères latins facultatifs.
- Import : Élèves → Importer les noms en latin → modèle Excel, correspondance par code Massar, aperçu avant confirmation.
- Les cellules Excel vides conservent les valeurs existantes. Les noms arabes sont conservés. Les champs `nomLatin`/`prenomLatin` et leurs anciens alias `nomFr`/`prenomFr` sont synchronisés lors d'une saisie explicite.
- Le dépôt web conserve ses modifications locales antérieures ; aucun commit global ni push web n'a été effectué pendant cette publication. Déploiement effectué depuis le dossier local intégré.

## Application

- Commit publié : `0ac7d575b6f99160b5285e81d537045f91080e2e`.
- Canal et branche EAS : `production` ; environnement : `production` ; runtime : `1.0.16`.
- Android : groupe `7415c2aa-8e35-491b-bbe7-3238881dc0fd`, mise à jour `01a097c6-e61f-7592-947a-0544bef0b633`.
- iOS : groupe `5945028e-bfbf-4546-b2c5-efcec0435bcc`, mise à jour `01a097c7-e17a-7244-b171-5fe120afae2b`.
- Message : « Noms latins harmonises, suivi des absences et communications ».
- Publications OTA, sans nouvelle soumission aux stores. Réservées aux installations compatibles avec le runtime 1.0.16.

## Vérifications

- Mobile : `npm run typecheck` et 35 tests ciblés réussis (noms latins, accès dossier, performance sans notes, appareils de notification, brouillons d'appel).
- Web : `npm run build`, `npm test`, 3 tests d'import latin et `git diff --check` réussis.
- Navigateur local avec données fictives : saisie manuelle par clic sur Enregistrer, import accepté après confirmation, codes inconnus/doublons refusés, affichage français et arabe sur petit écran.
- Production : alias Vercel vérifié READY, page de connexion visible sans erreur navigateur, nouveaux bundles HTTP 200 contenant l'import et les libellés latins. Aucune erreur retournée par la recherche de logs Vercel sur le déploiement.
- Pas de modification d'élève réel ni de notification envoyée pour les tests. Le parcours authentifié d'import en production et l'application sur téléphone physique n'ont pas été testés pendant cette publication.

## Particularité du déploiement mobile

`--platform all` essayait également d'exporter le web, dont les dépendances ne sont pas installées dans le projet mobile. Publication réussie séparément avec `--platform android` puis `--platform ios`, sans ajout de dépendance ni modification du runtime.
