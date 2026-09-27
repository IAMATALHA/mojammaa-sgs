# Smart Dashboard Parent — 22 septembre 2026

Accueil Parent adapté au style Teacher : carte principale compacte, choix explicite de l’enfant, indicateurs et priorités ouvrant le bon dossier. Français, arabe et anglais ; nombres conservés dans le bon ordre en arabe.

- Résultats pondérés du semestre, sur le barème de l’enfant ; compétences pour le préscolaire.
- Devoirs à venir, échéances du jour et progression des travaux remis/corrigés/excusés. Les devoirs passés restent dans leur historique.
- Jours d’absence du mois, dédupliqués par date ; priorité aux jours avec une séance non justifiée.
- Chargement, erreur avec nouvelle tentative, état vide et contenu distingués. Réponses isolées par parent, enfant et période ; abonnements précédents nettoyés.
- L’accueil désactive les anciens abonnements aux indicateurs de toute la famille et ne charge que ceux de l’enfant choisi. Les autres écrans conservent leur comportement par défaut.

## Publication

- Projet EAS : `6ff4e5d9-040f-45df-ac65-5cf941ad8627`.
- Canal/branche/environnement : `production`. Runtime : `1.0.16`.
- Groupe : `3f16eaba-4add-475c-95bd-39c8cbf6cf23`.
- Android : `01a0cb53-3547-7863-a680-2b813bed916e`.
- iOS : `01a0cb53-3547-7aa7-9c46-087d3a2e6afa`.
- [Publication EAS](https://expo.dev/accounts/youssefatalha/projects/mojammaa-sgs/updates/3f16eaba-4add-475c-95bd-39c8cbf6cf23).
- Publication des deux bundles natifs préalablement exportés, sans nouvelle dépendance native, changement de runtime ou soumission aux stores. Aucune fonction ni règle Firebase déployée.
- Dépôt initialement modifié : changements antérieurs conservés. L’historique EAS confirme les publications précédentes des accueils Admin/Parent et des corrections d’activation/noms. Aucun commit global créé.

## Vérifications

- `npm run typecheck` : réussi.
- `node --test tests/services/parentHomeSummary.test.mjs tests/services/parentStatistics.test.mjs tests/services/adminHomeSummary.test.mjs tests/services/presenceRate.test.mjs` : 18 tests réussis.
- Export final Android et iOS : réussi. `git diff --check` : réussi.
- Vérification HTTPS du service Expo Updates : les requêtes `production` / `1.0.16` servent les nouveaux identifiants Android et iOS ci-dessus.
- Aperçu du composant réel avec React Native Web, thème/polices réels, icônes Lucide web équivalentes et données fictives : FR/AR/EN, largeurs 320/390/768, contenu, chargement, vide, erreur/reprise et compétences. Absence de débordement horizontal contrôlée à 320/390 ; aucune erreur navigateur. Le contrôle arabe a détecté puis permis de corriger l’ordre moyenne/barème.
- Les callbacks de navigation du composant et le bouton Réessayer ont été exercés. Les changements d’enfant/compte et callbacks tardifs ont été vérifiés par tests déterministes du hook réel.
- Limite : pas de parcours authentifié sur téléphone physique pendant cette livraison. Le contrôle web porte sur le composant du dashboard, pas sur toute la navigation native.

Les installations compatibles peuvent télécharger la mise à jour au lancement puis l’appliquer au lancement suivant : fermer complètement et rouvrir l’application, éventuellement deux fois.

## Ajustement des réglages Parent

À la demande de Youssef, retrait du bloc « Notifications sur ce téléphone » des réglages Parent, avec ses diagnostics et boutons. La réception des notifications et les réglages des autres rôles sont conservés.

- Fichiers : `BasicSettingsScreen.tsx`, `ParentSettingsScreen.tsx`.
- Typecheck, contrôle du diff et exports Android/iOS réussis.
- Groupe EAS production : `4509e0bd-1795-45ea-b1aa-cc96362e668f`, runtime `1.0.16`.
- Android : `01a0cb5e-9874-7b2f-a6d5-c9707fc33ac6` ; iOS : `01a0cb5e-9874-7b01-8ccc-7a9c70891107`.
- Les manifests de production Android/iOS ont été vérifiés et servent ces identifiants.
