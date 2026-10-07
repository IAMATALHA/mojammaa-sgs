# Dashboard admin — publication du 7 octobre 2026

## Déploiement

Demandé explicitement par Youssef pour voir la refonte dans l’application sur téléphone. Projet `6ff4e5d9-040f-45df-ac65-5cf941ad8627`, canal / branche / environnement `production`. Publication OTA du JavaScript et des styles ; aucun changement natif.

| Runtime | Plateforme | Groupe publié | Mise à jour servie |
|---|---|---|---|
| 1.0.17 | android | `8f4d93cd-2bc7-4d8f-95e5-7432aa634fb7` | `01a1151d-3d1f-7c23-b7ce-f920b5b9f7a4` |
| 1.0.17 | ios | `e806e460-d946-4321-8915-5d67c7149143` | `01a1151e-498c-7830-9b21-ae2f41b671e3` |
| 1.0.16 | android | `de5914c7-18ad-48de-81d1-0eeaab4212c3` | `01a1151f-1e92-75fe-9a71-3b3a4805f99e` |
| 1.0.16 | ios | `87597508-23d2-4053-ab6c-764c698e5320` | `01a1151f-ed1b-7748-bbe1-ec78c744035a` |

## Source et vérification

- Refonte « L’école aujourd’hui » : ivoire, bleu nuit, cuivre ; onglets Accueil / École / Agenda / Messages / Analyses ; accès direct au dossier élève, classes et enseignants.
- 1.0.17 : base `9a8233d` avec les 14 fichiers de la refonte dans l’arbre de travail.
- 1.0.16 : copie isolée de `bbbac4d` avec les mêmes 14 fichiers. `src`, `package.json` et `package-lock.json` identiques entre les deux bases ; seule la version déclarée diffère dans app.json. Politique `runtimeVersion: appVersion` conservée.
- Empreintes SHA-256, diff et nouveaux fichiers conservés dans `output/admin-dashboard-release-2026-10-07/` (ignoré par Git et EAS).
- TypeScript application : OK, sur les deux versions. Export Expo Android et iOS : OK. Tests adminHomeSummary : 5/5 ; rendu des états FR/AR/EN : 36/36.
- Vérification finale du service Expo Updates : les 4 requêtes plateforme/runtime avec le canal production renvoient exactement les identifiants publiés. Preuve locale : `output/admin-dashboard-release-2026-10-07/published-and-served.json`.
- Typecheck global toujours bloqué par le `xconst` préexistant dans `functions/appointments.js:1`. Ce fichier est resté intact et aucun serveur Firebase n’a été déployé.
- Recette sur téléphone non effectuée par l’agent. Le premier lancement peut télécharger la mise à jour ; une fermeture complète puis réouverture l’applique.

## Retour arrière

Republier le groupe précédent correspondant, avec `eas update:republish --group <groupe>` :

- android 1.0.17 : `a9acb928-f4a5-4d0f-a107-dab075e18134`.
- ios 1.0.17 : `bebd07fd-4645-49ed-99ee-81c76434fb3b`.
- android 1.0.16 : `a2ccacb0-fb7d-49fc-96a0-bbc9c752c6a5`.
- ios 1.0.16 : `6089f83e-9a96-4f25-9526-7b4732b57038`.

## Retouches du même jour — accueil compact (Claude)

Demandé par Youssef. Publication OTA JavaScript uniquement, canal `production`.

| Runtime | Plateforme | Groupe publié | Mise à jour |
|---|---|---|---|
| 1.0.17 | android | `df889955-9495-4e99-958c-d5b28afb4f00` | `01a11541-388b-7836-85e1-64a439890f10` |
| 1.0.17 | ios | `23b54752-d584-4bef-bb6e-a41fa5a4d301` | `01a11542-0b22-75fe-a19b-71fa462a5cca` |
| 1.0.16 | android | `871faf80-2a8f-4aad-a108-fa6b76b7b4b0` | `01a11543-6825-7c0c-b5f3-99416328bd93` |
| 1.0.16 | ios | `43a8f648-9444-415a-a613-fcf32b1cdcf1` | `01a11544-49f2-74a4-aba2-c6669fc4354c` |

- En-tête sur une ligne (date + « L’école aujourd’hui » + profil) ; bloc MOJAMMAA / ADMINISTRATION retiré.
- « La journée en bref » en carte bleu nuit ; bandeau « En cours » (classes en cours, appels faits, fin de séance) via `summarizeCurrentLessons`.
- Absents : « sur N pointés ». Classes à vérifier affichées en puces → `AdminRollCalls { classe, missingOnly }`.
- « Votre école » remplacé par « Actions rapides » : Écrire un message (`AdminMessages { compose: true }`), Rendez-vous, Devoirs.
- `functions/appointments.js` : coquille `xconst` corrigée (fichier revenu à l’état du commit).
- Vérifié : tsc OK (les deux arbres), tests adminHomeSummary 6/6, export Android OK. 1.0.16 = `bbbac4d` + même `src` (diff identique hors .DS_Store). Recette téléphone non faite.
- Retour arrière : republier les groupes Codex ci-dessus (`8f4d93cd` / `e806e460` pour 1.0.17, `de5914c7` / `87597508` pour 1.0.16).

## Réglages — « Ajouter un enfant » (Claude, après-midi)

Demandé par Youssef après l’incident d’une professeure : en activant le code de son fils depuis l’écran « Activer un compte parent » avec son seul numéro, elle avait obtenu un second compte parent au lieu d’un rattachement à son compte professeur (données réparées le même jour, compte en double désactivé). Publication OTA JavaScript uniquement, canal `production`, lancée par Youssef (le garde-fou du mode auto bloque `eas update` pour l’agent).

| Runtime | Plateforme | Groupe publié | Mise à jour |
|---|---|---|---|
| 1.0.17 | android | `70734c81-9027-4f87-94d7-1f3359ec7bfe` | `01a1170a-77d0-7e92-ab30-91e9c3c52118` |
| 1.0.17 | ios | `743d0e5b-3aae-48cd-a58a-035caa651619` | `01a1170b-99a3-7e87-a84f-4cff021ca120` |
| 1.0.16 | android | `850ef05f-ce96-4dc0-954d-ba55d1853baf` | `01a1170c-8cfc-7669-9f3e-7c02e790fdce` |
| 1.0.16 | ios | `b9dde5e7-6e3e-4e78-ba33-1033005247aa` | `01a1170d-8dad-77f8-9391-4b1e527111de` |

- Réglages (parent, professeur, chauffeur ; pas la direction) : ligne « Ajouter un enfant » → feuille avec le code d’activation → `linkParentInvitation` (callable déjà déployée, codebase admin) sur le compte ouvert. Un professeur ou un chauffeur retrouve ensuite l’enfant dans « Espace parent ».
- Écran d’activation : encart « Déjà un compte ? Connectez-vous, puis Réglages → Ajouter un enfant » ; le message d’échec de rattachement renvoie aussi vers ce bouton.
- Fichiers : `src/components/add-child-sheet.tsx` (nouveau), `BasicSettingsScreen.tsx`, `services/parentAuthService.ts`, `screens/auth/ParentActivationScreen.tsx`, locales fr/ar/en. Aucun changement serveur ni règles.
- Vérifié : tsc OK (les deux arbres, `src` identiques), `npm test` 184/184. Le service Expo Updates renvoie exactement les 4 identifiants ci-dessus (requête par plateforme/runtime, canal production). Recette téléphone non faite.
- Premiers essais d’envoi : « Asset processing timed out » puis coupure DNS côté Mac ; rien n’avait été publié. Relancés un par un, les 4 sont passés.
- Retour arrière : republier les groupes « accueil compact » (`df889955` / `23b54752` pour 1.0.17, `871faf80` / `43a8f648` pour 1.0.16).

## « Ajouter un enfant » ouvert à la direction (soir)

Demandé par Youssef. Ordre respecté : serveur d’abord, puis OTA.

- Serveur : `linkParentInvitation` (codebase `admin`, `~/mojammaa-admin/functions/src/index.ts`) accepte désormais le rôle `admin` ; le rôle reste « admin », l’enfant s’ouvre dans « Espace parent ». Déployé par nom (`firebase deploy --only functions:admin:linkParentInvitation`), révision `linkparentinvitation-00005-hic`, ACTIVE, 100 % du trafic, journaux propres. Build + 69 tests OK. Modification NON commitée dans mojammaa-admin.
- App : ligne + feuille regroupées dans `src/components/AddChildSettingsGroup.tsx`, utilisé par `BasicSettingsScreen` et `AdminSettingsScreen` ; encart de l’écran d’activation mentionne la direction. tsc OK (les deux arbres, `src` identiques), 184/184.

| Runtime | Plateforme | Groupe publié | Mise à jour |
|---|---|---|---|
| 1.0.17 | android | `c763604d-65d5-4e70-b655-467c92d117ce` | `01a117be-be46-7f1d-bd38-76ffa08d2da3` |
| 1.0.17 | ios | `814c27bd-383b-4b6a-854a-ad090c39095e` | `01a117c0-5ce1-71aa-8c70-23cd9c81d945` |
| 1.0.16 | android | `c5fe8178-5134-4d30-bdf0-7f734e990a31` | `01a117c2-c26c-7f1a-b171-cb17febf05c7` |
| 1.0.16 | ios | `76735789-4265-4182-8ca9-ed3b4e1e9b4f` | `01a117c4-4fd2-756b-bf51-de4551574196` |

- Vérifié : le service Expo Updates renvoie exactement ces 4 identifiants. Recette téléphone non faite.
- Retour arrière app : republier les groupes de l’après-midi (`70734c81` / `743d0e5b` pour 1.0.17, `850ef05f` / `b9dde5e7` pour 1.0.16). Le changement serveur est rétrocompatible (il n’ajoute qu’un rôle autorisé).
