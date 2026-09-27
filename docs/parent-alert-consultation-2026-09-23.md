# Alertes Parent consultées — 23 septembre 2026

Demande : faire disparaître une alerte de « À votre attention » après consultation.

## Comportement

- Un appui sur une alerte ouvre son détail et la masque immédiatement.
- La consultation est mémorisée sur le téléphone, par compte parent et enfant, y compris après réouverture. Elle n’est pas synchronisée entre appareils.
- Une nouvelle absence, un nouveau devoir, une modification du devoir, son passage à l’échéance du jour ou de nouveaux résultats permettent à l’alerte correspondante de réapparaître. Une diminution du nombre d’éléments ne suffit pas à réafficher les éléments déjà consultés.
- Lorsque toutes les alertes présentes sont consultées, la section disparaît. Cela ne déclare aucun devoir terminé ni aucune absence justifiée ; les indicateurs et les accès aux détails restent disponibles.
- Les préférences sont chargées avant d’afficher les alertes, pour éviter leur réapparition fugitive au démarrage. Les réponses tardives d’un ancien compte/enfant sont ignorées.
- Stockage local borné à 512 identifiants opaques par compte/enfant, sans noms, notes ou contenus de documents en clair. Ces identifiants sont des empreintes de préférences, pas un mécanisme de sécurité.
- Les écritures sont sérialisées pour préserver deux consultations rapides. Un échec de stockage conserve le masquage pendant la session ; une relance peut réafficher l’alerte si elle n’a pas pu être enregistrée.

## Vérification

- TypeScript et `git diff --check` réussis.
- 19 tests ciblés réussis : `parentAlertHistory.test.mjs`, `parentHomeSummary.test.mjs`, `parentStatistics.test.mjs`.
- Tests du hook réel, du stockage et des handlers du composant réel avec primitives d’affichage simulées : consultation, navigation, persistance, changement de compte/enfant, réponses tardives, écriture simultanée, erreurs de stockage et nouvelles informations à nombre d’éléments identique.
- Aucun test de cette modification sur téléphone physique connecté à un compte réel.

## Portée

Les modifications précédemment publiées du dashboard et des réglages sont conservées. Aucun changement de dépendance native, de runtime, de règles Firebase ou de fonction serveur.

## Publication vérifiée

- Exports natifs Android et iOS réussis ; sources identiques à celles vérifiées avant publication.
- EAS projet `6ff4e5d9-040f-45df-ac65-5cf941ad8627`, canal/branche/environnement `production`, runtime `1.0.16`.
- Groupe : `14e160e8-72fe-44d5-ba41-772ce5bf5a0e`.
- Android : `01a0cd30-2444-7638-88ba-e19970386932`.
- iOS : `01a0cd30-2444-79ff-8795-ef86bc1c3606`.
- Vérification HTTPS du service Expo Updates : les manifests de production des deux plateformes servent ces nouveaux identifiants.
