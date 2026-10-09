# Activation des professeurs — publication du 9 octobre 2026

Spécification : `mojammaa-admin/docs/activation-professeurs-app-web.md`. Code : `e9d2297` (app, ce dépôt) et `7314fd0` (site et fonctions, `mojammaa-admin`), branche `feat/parent-phone-login`. Ordre respecté : serveur, puis site, puis applications.

## Serveur (codebase `admin`, europe-west1)

Publié par Codex à 17 h 46 UTC : `activateTeacherAccount`, `createTeacherInvitation`, `createTeacherRecoveryLink`, `linkTeacherInvitation`, `listTeacherAccess`, `previewActivationCode`, `revokeTeacherInvitation` (créées) ; `createUserAccount`, `parentPhoneLogin`, `setTeacherLoginPhone` (mises à jour, ce dernier avec le verrou commun). Source publiée vérifiée identique à `7314fd0` (archive de déploiement téléchargée et comparée). Contrôles de refus après publication : 10/10 conformes. Aucune règle Firestore modifiée.

## Site

`dpl_CzBQbcco7J4aVAgZy1kUtZwK7zt8` basculé sur mojammaa.com par Youssef (`vercel promote`). Contrôle en lecture seule : `/activer` (iPhone, sans débordement ni erreur), lien mal formé, bouton « Connexion » de l’accueil, « Connexion par téléphone » ; aucune configuration d’émulateur dans le code publié. Retour arrière : `vercel promote dpl_HwktitraLBokckSJyyMiMtywHnsR`.

## Application (OTA, canal `production`)

| Runtime | Plateforme | Groupe publié | Mise à jour servie |
|---|---|---|---|
| 1.0.17 | android | `925acc11-e667-47a4-b633-ba7e5bea0410` | `01a121c8-8272-7226-b9ec-508586b8912d` |
| 1.0.17 | ios | `4ba7ca34-9c8b-468d-9a9f-a2bc00fc758f` | `01a121f5-19d4-732b-a1c2-5a611d761203` |
| 1.0.16 | android | `de5aa05d-e292-4e13-a37d-73df86d4b852` | `01a121f4-36ca-71d1-9ed8-775cb39fbba2` |
| 1.0.16 | ios | `b76d5aa1-524f-4ac6-bfe2-a82ada99646f` | `01a121f5-e9f9-77f0-8f0a-c8b9b829a2fd` |

- Android 1.0.17 publiée par Codex ; les trois autres par Claude après l’accord de Youssef (« continue »).
- 1.0.17 : ce dépôt, propre, à `e9d2297`. 1.0.16 : copie de `e9d2297` où seule la version d’`app.json` diffère (`src`, `package.json`, `package-lock.json`, `eas.json` identiques), même méthode que le 7 octobre ; publiée avec `EAS_NO_VCS=1` (copie hors git). TypeScript et export Expo Android + iOS de la copie : OK.
- Le service Expo Updates renvoie exactement ces 4 identifiants (requête par plateforme/runtime, canal production).
- Recette sur téléphone non effectuée ; Safari iPhone et appareils réels non testés. La première ouverture télécharge la mise à jour, une fermeture complète puis réouverture l’applique.
- L’installation 1.0.16 a été construite avec Expo 54.0.36 ; le JavaScript publié vient de dépendances 54.0.37, comme toutes les mises à jour 1.0.16 depuis le 7 octobre.

## Retour arrière

Republier les groupes précédents (« Ajouter un enfant aussi pour la direction ») avec `eas update:republish --group <groupe>` : android 1.0.17 `c763604d-65d5-4e70-b655-467c92d117ce`, ios 1.0.17 `814c27bd-383b-4b6a-854a-ad090c39095e`, android 1.0.16 `c5fe8178-5134-4d30-bdf0-7f734e990a31`, ios 1.0.16 `76735789-4265-4182-8ca9-ed3b4e1e9b4f`. Les fonctions sont rétrocompatibles : l’ancien écran parent continue de fonctionner.

## Espace administration : même thème que les autres rôles et nouvelles fonctions (soir)

Demandé par Youssef : « le rôle admin même thème que les autres, avec plus de fonctionnalités », publication groupée.

- **Thème** : la variante ivoire / bleu nuit / cuivre de l’administration est supprimée (`ThemeProvider` unique, `adminPalette` et `admin-tab-bar` retirés). Barre d’onglets animée commune ; accueil « L’école aujourd’hui » dans le langage des accueils professeur et parent (fond aquarelle, carte blanche bordée d’ambre, ombre « argile »).
- **Invitations professeurs** et **mot de passe oublié** : écran Utilisateurs → bouton d’accès (superadmin, vérifié aussi par le serveur) : créer / remplacer / révoquer l’invitation, envoi préparé dans WhatsApp ou partage ; récupération accompagnée (identité vérifiée, numéro de connexion, lien 1 h) ; lien de réinitialisation pour un parent.
- **Codes parents** : nouvel écran (onglet École → Comptes et familles) : classe, élèves sans parent lié, génération, WhatsApp du parent ou partage. Message aligné sur le bouton « Première connexion ? Activer mon compte » (même texte que le site, corrigé et publié aussi sur le site avec l’affiche du guide).
- **Mérites et avertissements** : nouvel écran (onglet École) : mois / année scolaire / tout, totaux, par classe puis par élève, journal récent ; annulations visibles mais hors totaux.
- Aucun changement serveur ni règles : mêmes fonctions déjà publiées (`createParentInvitations`, `createParentPasswordResetLink`, invitations professeurs).
- Vérifié : TypeScript (dépôt et copie 1.0.16), `npm test` 200/200 (7 nouveaux tests), rendu des écrans en FR et AR sur un banc react-native-web avec données fictives (accueil, École, Utilisateurs + feuille d’accès, Codes parents, Mérites). Recette sur téléphone non faite.

| Runtime | Plateforme | Groupe publié | Mise à jour servie |
|---|---|---|---|
| 1.0.17 | android | `1cdd4ac5-663c-4cd5-aff3-2079fed0f8a1` | `01a1220f-ba73-78ba-ad48-980b1039bd58` |
| 1.0.17 | ios | `e9d9a66d-1490-4186-8fa8-3f43e7006660` | `01a12210-81ed-7561-9c8e-1feb3bc81806` |
| 1.0.16 | android | `3a986ddf-1821-436c-af8c-2edb38a9c3d6` | `01a12211-82d3-7837-b944-1e452d3606a2` |
| 1.0.16 | ios | `4be3fbdc-e952-4fe6-802e-336bdc02a7d9` | `01a12212-37e7-7919-8179-abfeef9d7ad8` |

Publié depuis l’arbre de travail (`e9d2297` + modifications non commitées). Site : `dpl_CHQKNiLX4bnMYe2dUy2Ko6Qk7Tm2` (retour : `vercel promote dpl_CzBQbcco7J4aVAgZy1kUtZwK7zt8`). Retour arrière app : republier les groupes de l’activation professeurs ci-dessus (`925acc11` / `4ba7ca34` pour 1.0.17, `de5aa05d` / `b76d5aa1` pour 1.0.16). Reste : la capture « connexion-2026-09.jpeg » de l’affiche montre encore l’ancien écran de connexion — à remplacer par une capture réelle après la mise à jour.

## Reprise de la revue interrompue — correctifs locaux, 9 octobre au soir

**Version : conserver 1.0.17. Aucun nouveau build nécessaire pour ce lot.** Vérification EAS en lecture seule : dernier build production Android terminé `b7c2153d-d4ca-4c82-8b07-39f09182be4e`, version 1.0.17 / versionCode 48, commit `7c47027`. `app.json`, `package.json`, `package-lock.json`, `eas.json` et configurations Babel/Metro sont identiques à ce commit ; aucun projet natif suivi dans git, aucun module natif ajouté par ce lot. Les modifications concernent JavaScript et l’interface.

La politique `runtimeVersion: appVersion` lie les OTA à la version du binaire. Passer seulement `app.json` à 1.0.18 empêcherait les installations 1.0.17/1.0.16 de recevoir cette nouvelle OTA. Une 1.0.18 pourra servir plus tard à consolider les changements dans un nouveau binaire de boutique ; elle n’est pas nécessaire pour ces correctifs. Référence : [compatibilité des runtimes Expo](https://docs.expo.dev/eas-update/runtime-versions/), documentation SDK [54](https://docs.expo.dev/versions/v54.0.0/).

Historique EAS et **manifestes réellement servis** recontrôlés pour `production` : les quatre identifiants du tableau « Espace administration » ci-dessus sont toujours actifs. Cela confirme les publications de Claude ; **les correctifs de cette revue ne sont pas encore publiés**. La réserve historique sur le binaire 1.0.16 / Expo 54.0.36 reste celle documentée plus haut.

| Défaut confirmé | Correction locale |
|---|---|
| Codes parents : code Massar envoyé au serveur, qui lit `eleves/{ID Firestore}` ; contact WhatsApp également perdu quand les identifiants diffèrent | Priorité à l’ID du document pour la sélection, la callable et la recherche du contact. Cas historique reproduit avec des données fictives. |
| Sélection de plus de 100 élèves tronquée puis entièrement effacée ; doubles pressions capables de générer deux lots | Compte du bouton limité au lot réellement envoyé, sélection restante conservée, verrou immédiat contre la double soumission et sélection bloquée pendant la génération. |
| Partage annulé signalé « préparé » ; ancien état conservé après régénération ; erreurs de partage non gérées | État attaché au code effectivement partagé ; annulation respectée, erreurs WhatsApp/partage affichées dans les deux écrans. Sur Android, l’API native ne distingue pas toujours l’annulation : le libellé reste « Message préparé », jamais « envoyé ». |
| Liste d’élèves impossible à actualiser malgré le message « Actualisez » | Actualisation et reprise disponibles ; élèves liés entre-temps retirés des sélections et des codes affichés. |
| Fiche professeur : ancien numéro d’une invitation utilisée/révoquée/expirée prioritaire sur le numéro de connexion ; arrivée tardive des données ignorée | Numéro actif utilisé ; préremplissage tardif sans écraser la saisie ; opérations masquées tant que les données d’accès sont indisponibles, avec reprise. |
| Révocation immédiatement après remplacement visant encore l’ancienne invitation ; code devenu invalide restant partageable après changement du numéro | Révocation ciblant la nouvelle invitation dès sa création ; code et ancien message de récupération retirés après enregistrement du numéro ; opérations concurrentes bloquées. |
| Premier chargement des comportements en échec affichant des totaux à zéro | Distinction entre données inconnues et vrai bilan vide ; bouton Réessayer et conservation d’un bilan déjà chargé lors d’une erreur d’actualisation. |

### Preuves de cette revue

- `npm run typecheck` : réussi.
- `npm test` : **215/215**, dont **15 scénarios** dans `tests/services/adminScreens.test.mjs`. Les **9 premiers cas de régression** ajoutés avant correction échouaient tous sur l’état initial ; ils passent après correction. Handlers TSX réels, données et APIs natives simulées, sans Firebase réel.
- `npm run test:rules` avec JDK 21 et le projet fictif `demo-mojammaa-rules` : **434/434**, dont 13 nouveaux contrôles des requêtes des écrans admin. Lectures admin autorisées ; lectures globales et liste des superadmins refusées aux parents/professeurs/visiteurs ; auto-promotion admin refusée. Aucune règle modifiée.
- Export Expo de production avec Hermes **Android et iOS** réussi (`CI=1 npx expo export --platform android --platform ios`). Ce sont des bundles JavaScript, pas de nouveaux binaires natifs.
- **15 parcours d’aperçu React Native Web** (Accueil, École, Utilisateurs, Codes parents, Comportement × FR/AR/EN), génération et détail inclus : aucune erreur JavaScript ni débordement de texte/contrôle à 390 px ; captures inspectées. APIs simulées et données fictives. Réutilisation du banc local de Claude ; ce contrôle ne remplace pas une recette native.
- **148 clés** des parcours concernés présentes en FR/AR/EN ; `git diff --check` réussi.

Recette restante : téléphone réel, ouverture/annulation du partage natif, WhatsApp, chargement puis application d’une OTA corrective. Les assertions de sécurité ci-dessus portent sur les règles locales en émulateur ; les contrats des callables ont été relus dans `mojammaa-admin/functions`, sans appeler les opérations de comptes en production. Aucun déploiement, build cloud, message envoyé, ni lecture de dossiers d’élèves réels pendant cette revue. Coût Google Cloud : **0 $**.

## Complément de Claude (même soir) — bouton « Générer » et premier lancement

- **Corrigé (local, non publié)** : sur Codes parents, le bouton flottant « Générer » était placé à 24 px du bas sans tenir compte de la barre système. L’app est en bord à bord sur Android (`edgeToEdgeEnabled`) et l’écran n’a pas de barre d’onglets : sur un téléphone à 3 boutons (barre de 48 dp), la moitié basse du bouton passait sous la barre de navigation. Position désormais `max(marge basse, 12) + 12` (inchangée sans barre système), même règle que l’appel professeur. Test de régression ajouté à `tests/services/adminScreens.test.mjs` : il échoue avec l’ancienne position et passe avec la nouvelle. Commentaire du tri par élève aligné sur le code et son test (aucun changement de comportement).
- Vérifié : `npx tsc --noEmit` OK, `npm test` **216/216**, 202 clés FR/EN/AR présentes, `git diff --check` OK.
- **Nuance sur « aucun nouveau build »** : exact pour livrer ces correctifs aux installations existantes. Mais le binaire Play 1.0.17 (versionCode 48, `7c47027`, 27/09) précède la connexion par téléphone (`60b8a01`, 28/09) et le bouton « Première connexion ? Activer mon compte » (9/10). `expo-updates` étant réglé par défaut (vérification au lancement, délai 0), toute **nouvelle installation** affiche au premier lancement l’ancien écran (e-mail seul, lien d’activation parent) ; l’OTA ne s’applique qu’à la réouverture suivante. Les messages WhatsApp envoyés aux professeurs et aux parents décrivent pourtant le nouvel écran. Recommandation : reconstruire **sans changer la version** (1.0.17, versionCode 49 attribué par EAS) : même runtime, donc les OTA 1.0.17 continuent d’atteindre tout le monde, sans troisième runtime à alimenter. Ordre : commit → OTA 1.0.17 et 1.0.16 → build du même commit → brouillon Play → essai sur téléphone → publication.
- **Corrigé ensuite (local, non publié) — code collé depuis WhatsApp** : WhatsApp ne copie que le message entier. Collé dans « Activer mon compte », le champ gardait les dix premières lettres de « Bonjour… » (`BON-JOUR-…`), refusées par le serveur ; écran parent et « Ajouter un enfant » (dont le `maxLength={16}` tronquait le collage) idem. `invitationCodeFromText` (`parentAuthService.ts`) extrait le code `XXX-XXXX-XXX` de l’alphabet serveur s’il est unique dans le texte ; la saisie manuelle ne change pas. `tests/services/invitationCode.test.mjs` rejoue les vrais messages professeur et parent (4 tests).
- **Corrigé ensuite (local, non publié) — badge professeur** : un professeur qui se connecte par téléphone affichait « Révoquée » (rouge) dès que sa dernière invitation était révoquée, cas systématique après « Enregistrer le numéro » (le serveur révoque l’invitation en attente) ; sur le site, « Expirée » apparaissait même en vert. Règle désormais : connexion par téléphone affichée sauf invitation en attente. App : `teacherAccessBadge` + 3 cas de test (l’ancienne règle les fait échouer). Site : même règle dans `mojammaa-admin/src/pages/Parametres.tsx` (`tsc -b` OK ; l’erreur ESLint ligne 222 est antérieure), non déployé.
- Vérifié après ces ajouts : `npx tsc --noEmit` OK, `npm test` **220/220**, 202 clés FR/EN/AR, `git diff --check` OK.
