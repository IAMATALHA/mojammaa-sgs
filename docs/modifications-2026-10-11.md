# Modifications du 11 octobre 2026

Tout ce qui a été changé ce jour-là dans l'application (`mojammaa-sgs`) et sur le site et ses fonctions (`mojammaa-admin`), ce qui est en ligne, et ce qui reste à décider.

## État à la fin de la journée

| Élément | État |
|---|---|
| Application, Google Play production | **1.0.18 (51)**, promue le soir à 100 % (voir section 12) ; en ligne après l'examen de Google |
| Application, piste de test interne | **1.0.18 (51)**, recette des liens réussie sur le téléphone de Youssef (tests A à J) |
| Site mojammaa.com | En ligne, déploiement `dpl_FUhqs1d9h8Mf9XxjmrBG3jSE9mY4` (voir section 11) |
| Fonctions serveur | `deleteUserAccount` et `unlinkStudentParent` en ligne (europe-west1) |
| Anciennes versions de l'application (1.0.17, 1.0.16) | Rien reçu : les nouveaux écrans n'y sont pas encore envoyés |
| Dépôts Git | Les deux branches `feat/parent-phone-login` sont poussées |

## 1. Mot de passe et activation

Codé le matin, commité et publié dans cette session.

**Application**

- Champ de mot de passe commun avec un œil (`src/components/PasswordField.tsx`), utilisé par la connexion et les deux écrans d'activation. Un seul œil affiche le mot de passe et sa confirmation. Sur la connexion, l'œil remplace le cadenas.
- Activation parent : confirmation du mot de passe, libellés au-dessus des champs, e-mail replié derrière « Ajouter un e-mail », un message par erreur avec le champ fautif encadré en rouge.
- Cas « compte créé mais session non ouverte » : le parent est renvoyé à la connexion, au lieu de lire « code déjà utilisé » au deuxième essai.
- Phrase d'aide sous les champs de code : « Collez votre code ou le message WhatsApp complet. »
- Messages WhatsApp parent et professeur : arabe puis français, lien d'activation en premier et seul sur sa ligne, code à la fin en secours (`src/utils/admin-access.ts`).

**Site**

- Activation parent : confirmation du mot de passe, erreurs précises, même cas « compte créé, session non ouverte ».
- Réinitialisation : 8 caractères au minimum (au lieu de 6).
- Espace parent : bandeau « Installez l'application Mojammaa Connect » sur Android, masquable.
- Messages WhatsApp identiques à ceux de l'application (`src/utils/accessMessages.ts`).

## 2. Le lien d'activation ouvre l'application (1.0.18)

Les liens `mojammaa.com/activer#CODE` et `mojammaa.com/parents/activer#CODE` ouvrent l'application avec le code déjà rempli. Les autres adresses du site restent dans le navigateur.

- **Configuration native** (`app.json`) : filtre d'intention vérifié sur ces deux chemins exacts ; version passée à 1.0.18.
- **Preuve de propriété du domaine** : `public/.well-known/assetlinks.json` sur le site, avec l'empreinte de la clé de signature Google Play (lue par l'API Google Play).
- **Comportement** (`src/hooks/use-activation-link.ts`, `src/utils/activation-link.ts`) :
  - compte fermé : écran d'activation, code rempli ; côté professeur la vérification part seule ;
  - compte ouvert et lien parent : feuille « Ajouter un enfant » avec le code, jamais envoyée d'office ;
  - compte ouvert et lien professeur : proposition de se déconnecter, puis l'activation s'ouvre.
- **Piste de test interne** : profil de soumission `internal` ajouté dans `eas.json`.

## 3. Écran sombre au lancement

Entre l'écran de démarrage d'Android et la première image de l'application, la fenêtre montrait le fond par défaut du thème, gris très sombre en mode sombre. Corrigé par `android.backgroundColor` = `#FFFBEB` dans `app.json`.

Ce correctif change la couleur, pas l'attente : la séquence logo, écran clair, logo animé existe toujours. La cause (le paquet `expo-splash-screen` n'est pas installé, et l'animation est forcée à 1,9 s) a été expliquée à Youssef, qui a répondu « pas encore ».

## 4. Corrections de l'audit de Codex

Rapport complet et suivi dans `docs/audit-1.0.18-2026-10-11.md`. Cinq défauts confirmés et corrigés, plus deux trouvés en route.

| Réf. | Défaut | Correction |
|---|---|---|
| F1 | Compte ouvert : le même lien retouché après l'arrêt de l'application n'ouvrait rien | Filtre « lien déjà vu » retiré du JavaScript ; c'est l'activité Android qui écarte un lancement rejoué (`plugins/with-launch-link-intent.js`) |
| F2 | Un lien sans code gardait le code précédent | Chaque lien ouvre un écran neuf ; la feuille « Ajouter un enfant » est remontée |
| F3 | Une réponse tardive du serveur changeait l'écran en cours | Seule la dernière vérification compte (`src/utils/latest-only.ts`) |
| F4 | Le lien de lancement pouvait écraser un lien plus récent | Le lien le plus récent l'emporte |
| F5 | « J'ai déjà un compte » revenait à l'activation | Retour à la connexion dans tous les cas |
| — | Lien touché alors que l'application est arrêtée en arrière-plan : perdu | Le plugin garde ce lien pour que l'application le lise |
| — | La question « Un compte est déjà ouvert » pouvait ne plus jamais s'afficher | Réarmée à la fermeture de session |

## 5. Élève resté lié à un compte supprimé

**Cause.** Rattacher un enfant écrit le lien sur la fiche de l'élève. « Supprimer » sur la page Comptes ne retirait que le profil : ni l'identifiant de connexion, ni ce lien. L'élève restait « déjà lié », sans nouveau code possible.

**Réparation immédiate.** `scripts/unlinkOrphanParent.js` (lecture seule par défaut, `--commit` pour un élève). Lancé par Youssef le 11 octobre : un élève concerné sur neuf élèves liés, lien retiré.

**Sur le site, pour le super-administrateur.**

- Page Comptes : « Supprimer » supprime le compte pour de bon. Profil et identifiant de connexion supprimés, enfants détachés ; la confirmation annonce combien d'élèves seront détachés.
- Page Codes d'activation parents : étiquette « lié à un compte supprimé » et bouton « Détacher » sur chaque élève lié. Le compte n'est pas supprimé.
- Un administrateur simple ne voit pas ces boutons, et le serveur le refuse.
- Côté serveur : `functions/src/accountRemoval.ts`, fonctions `deleteUserAccount` et `unlinkStudentParent`.
- Correction annexe : les listes partagées du site (`src/data/schoolData.ts`) ne signalaient jamais qu'une liste était confirmée par le serveur.

Limite connue : supprimer un professeur ne supprime pas son emploi du temps, comme avant.

## 6. Publications

| Quoi | Identifiant | Retour arrière |
|---|---|---|
| Site, matin (lot 1 + `assetlinks.json`) | `dpl_Ah3cXBSUSZ63Bchg54h7qdJVWWvA` | `vercel promote dpl_3DoEfnBceaFgqEgedoWHsPd8E3SE --yes` |
| Site, soir (suppression de compte, « Détacher ») | `dpl_G9daZ52jG3TG4w7XRoNTWRm67gpg` | `vercel promote dpl_Ah3cXBSUSZ63Bchg54h7qdJVWWvA --yes` |
| Fonctions `deleteUserAccount`, `unlinkStudentParent` | codebase `admin`, europe-west1 | Republier le site précédent suffit à ne plus les appeler |
| Build 1.0.18 (50), piste interne | EAS `61493aaa`, étiquette `v1.0.18-50` | Remplacé par le 51 ; ne pas le promouvoir |
| Build 1.0.18 (51), piste interne | EAS `9a8ac556`, étiquette `v1.0.18-51` | — |

Chaque publication du site a été contrôlée sur mojammaa.com : `index.html` et les 162 fichiers identiques au build local, affiche d'activation inchangée.

## 7. Commits

**`mojammaa-sgs`**

| Commit | Contenu |
|---|---|
| `38de278` | Lien d'activation ouvert dans l'application, œil du mot de passe |
| `d36a3d8` | Version 1.0.18, profil de soumission `internal` |
| `afa727d` | Fond crème au lancement |
| `a8e69c1` | Corrections de l'audit (F1 à F5) |
| `9590f4c` | Rapport de Codex et suivi des corrections |
| `7aa54d2` | Question « déjà connecté » réarmée |
| `0436916` | Seconde vérification avant le build 51 |
| `336cd05` | Script pour détacher un élève d'un compte supprimé |

**`mojammaa-admin`**

| Commit | Contenu |
|---|---|
| `98f3a26` | Lot 1 côté site, `assetlinks.json` |
| `246a2dd` | Suppression de compte et « Détacher le parent » |

## 8. Fichiers touchés

**`mojammaa-sgs`** (24 fichiers)

- Configuration : `app.json`, `eas.json`, `plugins/with-launch-link-intent.js`
- Écrans : `src/screens/auth/LoginScreen.tsx`, `AccountActivationScreen.tsx`, `ParentActivationScreen.tsx`
- Composants et navigation : `src/components/PasswordField.tsx`, `add-child-sheet.tsx`, `src/navigation/NavigationRoot.tsx`, `types.ts`
- Logique : `src/hooks/use-activation-link.ts`, `src/utils/activation-link.ts`, `latest-only.ts`, `admin-access.ts`
- Textes : `src/i18n/locales/fr.ts`, `ar.ts`, `en.ts`
- Scripts : `scripts/unlinkOrphanParent.js`, `scripts/lib/orphanParent.js`
- Tests : `tests/services/activationLink.test.mjs`, `latestOnly.test.mjs`, `adminAccess.test.mjs`, `tests/scripts/orphanParent.test.mjs`
- Documents : `docs/audit-1.0.18-2026-10-11.md`

**`mojammaa-admin`** (19 fichiers)

- Fonctions : `functions/src/accountRemoval.ts`, `accountLocks.ts`, `index.ts`
- Pages : `src/pages/Comptes.tsx`, `ParentInvitations.tsx`, `ParentActivation.tsx`, `ResetPassword.tsx`, `parent/ParentHome.tsx`
- Logique : `src/data/schoolData.ts`, `src/services/parentAuth.ts`, `src/utils/accessMessages.ts`
- Textes : `src/i18n/fr.json`, `ar.json`
- Fichier public : `public/.well-known/assetlinks.json`
- Tests : `functions/src/accountRemoval.test.ts`, `accountRemoval.emulator.ts`, `scripts/accountRemoval.browser.mjs`, `scripts/accessMessages.test.mjs`
- `package.json` : commande `test:account-removal-browser`

## 9. Vérifications

**Faites**

- Application : compilation TypeScript, 249 tests, exports Android et iOS, `expo-doctor` 18/18.
- Liens, sur les vrais composants : 14 contrôles, 6 scénarios avec le vrai système de navigation, câblage de l'écran racine.
- Liens, sur émulateur Android 16 avec une version d'essai : 11 scénarios, dont l'absence de rejeu et l'ouverture après arrêt du processus.
- Liens, sur le téléphone de Youssef (build 51) : tests A à J réussis.
- Android : domaine `mojammaa.com` déclaré « verified » pour l'application.
- Site : compilation, build de production, 150 tests.
- Suppression de compte et détachement : 9 scénarios sur émulateurs, 3 parcours dans un vrai navigateur sur émulateurs.
- Fonctions en ligne : un appel sans connexion est refusé.

**Pas faites**

- Suppression de compte et « Détacher » sur la vraie base depuis le site : jamais essayées en production.
- Activation complète d'un parent avec un vrai code sur la 1.0.18.
- iPhone : le lien y ouvre toujours le site.

## 10. Reste à décider

- ~~Promouvoir le build 51 en production~~ : fait le soir (section 12). Reste à envoyer les nouveaux écrans aux versions 1.0.17 et 1.0.16.
- Écran de lancement (logo, écran clair, logo animé) et changement de langue un peu lent : options présentées, pas de décision.
- Utiliser un élève de test dédié pour les essais, au lieu d'un vrai élève.
- Page Paramètres du site : affiche encore « 6 caractères ».

## 11. Second audit de Codex (soir)

Rapport et suivi : `docs/audit-modifications-2026-10-11-codex.md`. Deux défauts confirmés sur la partie site, corrigés dans `mojammaa-admin` (commit `6bf9fe3`) et publiés le soir même :

- **A1** : si le parent lié à un élève changeait pendant que la fenêtre « Détacher » restait ouverte, c'était le nouveau parent qui était détaché. Le serveur vérifie maintenant que le compte détaché est bien celui annoncé.
- **A2** : l'étiquette « lié à un compte supprimé » pouvait manquer quand la liste des comptes venait du cache du navigateur.

Codex a aussi proposé une image d'aperçu pour les liens partagés dans WhatsApp (logo sur fond crème). Youssef l'a retenue : elle est en ligne à `https://mojammaa.com/og-mojammaa-connect-v1.jpg` (commit `e44ce39`). Le titre de l'aperçu, « École privée à Tétouan », n'a pas été changé.

Publication du soir : site `dpl_FUhqs1d9h8Mf9XxjmrBG3jSE9mY4` (retour arrière : `vercel promote dpl_G9daZ52jG3TG4w7XRoNTWRm67gpg --yes`), puis fonction `unlinkStudentParent` mise à jour.


## 12. Promotion de la 1.0.18 en production (soir)

Demandée par Youssef. Le build 51 de la piste de test interne est passé sur la piste de production, à 100 %, sans déploiement progressif (comme la 1.0.17).

- Avant : production = 1.0.17 (49), test interne = 1.0.18 (51). Build 51 = EAS `9a8ac556`, commit `0436916`, étiquette `v1.0.18-51`. Depuis cette étiquette, seuls des scripts, des tests et des documents ont changé : rien qui entre dans l'application.
- Aucune mise à jour OTA n'existe pour la version 1.0.18 : l'application installée exécute le code du build.
- Publication par l'API Google Play : édition validée à blanc par Google, puis publiée (`11339571477451300427`).
- Relu ensuite en lecture seule : production = 1.0.18 (51) `completed`, notes de version fr-FR, ar et en-US.
- Google examine la version avant sa mise en ligne (quelques heures à environ deux jours). D'ici là, le Play Store sert encore la 1.0.17.
- Retour arrière : impossible de revenir à la 1.0.17 sur Google Play. Un défaut de l'interface se corrige par OTA sur la version 1.0.18 ; un défaut natif demande un nouveau build (52).

Notes de version publiées :

```
<fr-FR>
Le lien d’activation reçu par WhatsApp ouvre directement l’application, avec le code déjà rempli. Nouveau bouton pour afficher le mot de passe. Confirmation du mot de passe à l’activation et messages d’erreur plus clairs. Corrections et améliorations.
</fr-FR>
<ar>
رابط التفعيل المرسل عبر واتساب يفتح التطبيق مباشرة، ورمز التفعيل مكتوب مسبقاً. زر جديد لإظهار كلمة المرور. تأكيد كلمة المرور عند التفعيل ورسائل خطأ أوضح. إصلاحات وتحسينات.
</ar>
<en-US>
The activation link sent by WhatsApp now opens the app directly, with the code already filled in. New button to show your password. Password confirmation on activation and clearer error messages. Fixes and improvements.
</en-US>
```

Pas fait : l'envoi des nouveaux écrans aux versions 1.0.17 et 1.0.16 (OTA), et la surveillance des plantages (Android vitals) les premiers jours.
