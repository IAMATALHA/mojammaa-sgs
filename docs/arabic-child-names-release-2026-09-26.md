# Noms des enfants en arabe — 26 septembre 2026

Affichage des champs `prenom` / `nom`, avec repli sur `nomComplet` pour les anciens dossiers, indépendamment de la langue de l’interface. Aucun repli vers `prenomLatin`, `nomLatin`, `prenomFr` ou `nomFr`. Les valeurs stockées ne sont pas modifiées.

La règle partagée est utilisée par les données du tableau de bord parent, les devoirs, les sorties et les libellés de messagerie. Les travaux locaux préexistants sont conservés ; les publications EAS des 22–24 septembre ont été vérifiées avant publication. Aucun déploiement Firebase pendant cette tâche.

## Publication

- Projet : `6ff4e5d9-040f-45df-ac65-5cf941ad8627` ; canal/branche/environnement : `production` ; runtime : `1.0.16`.
- Groupe : `b0ae77ef-fa8f-401c-8edb-0aea6566dfa4`.
- Android : `01a0df63-84e4-71b1-8e2e-8032f70423b6`.
- iOS : `01a0df63-84e4-7a2b-b16b-fec70906fb9e`.
- [Publication EAS](https://expo.dev/accounts/youssefatalha/projects/mojammaa-sgs/updates/b0ae77ef-fa8f-401c-8edb-0aea6566dfa4).
- Première tentative interrompue par un délai de traitement des assets côté Expo ; seconde tentative réussie avec les mêmes bundles vérifiés.

## Vérification

- TypeScript : réussi ; 8 assertions sur les noms avec données fictives : réussies.
- 19 tests parent (accueil, statistiques, historique des alertes) : réussis. Correction du faux document Firestore dans le test de changement de jour pour implémenter `get`, utilisé par le filtrage des devoirs annulés.
- Exports Hermes Android et iOS : réussis ; contrôle du diff : réussi.
- Les requêtes HTTPS au service Expo Updates pour `production` / `1.0.16` servent les nouveaux identifiants ci-dessus sur les deux plateformes.
- Aucun contrôle sur téléphone physique ni consultation de dossier personnel réel.

## Consigne aux parents

Avec une installation compatible 1.0.16 et une connexion Internet : fermer complètement l’application, la rouvrir et laisser le téléchargement se terminer, puis fermer et rouvrir une seconde fois si nécessaire. Pas de réinstallation ni de changement de langue requis. Une installation plus ancienne incompatible doit d’abord être mise à jour depuis le store.
