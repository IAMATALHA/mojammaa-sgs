# Android 1.0.17 — checklist de sortie

Version de consolidation : intègre au binaire les OTA publiées sur le runtime 1.0.16 depuis le 6 septembre (noms latins puis arabes, accueils parent et admin, alertes consultées, gestion des devoirs, motifs de comportement, activation parent traduite). Aucune nouvelle dépendance native prévue.

Point de départ : 1.0.16, versionCode 47, build `afbb3736-6fcf-4d49-8920-ba28c65ac116` (06/09). Politique `runtimeVersion: appVersion`, versionCode auto-incrémenté à distance.

## 0. Code — fait le 27/09

- [x] Travail non commité réparti en 10 commits par thème (`0ac7d57..171e125`), `tsc` vert sur chacun.
- [x] Tests au 27/09 sur cet arbre : 40 fichiers Node, 327 tests de règles, devoirs, prière, communications, reset, transport, Storage (émulateur JDK 21), `expo-doctor` 18/18, `verify:rules` en phase.
- [x] `/output/` exclu de git et de l'archive EAS.
- [x] Branche poussée le 27/09 (`0ac7d57..a1a3fd3`).
- [x] Correctifs client avant build (27/09, poussés) : `9b795a4` conflit de version des devoirs explicite + rechargement ; `679f40d` routes admin reportées retirées des types, moyenne de classe sans NaN.

- [x] Correctifs du 27/09 (après-midi) : notifications devoir modifié/annulé adressées aux parents (bug prod : 5 messages `no_recipient` depuis le 24/09) et création via `manageHomework` (`5434784`, `2505ce3`) ; pièces jointes validées par les règles à la création client (`eb88361`) ; libellés EN/AR, scripts, composant mort (`0aee4d5`) ; `npm audit fix` app et fonctions (`0e26969`, `1ab48bd`).

- [x] Revue Codex du 27/09 (soir) : la validation des pièces jointes dans les règles dépassait la limite Firestore de 1 000 expressions dès 10 pièces jointes → une seule expression régulière par pièce jointe ; 20 acceptées (limite), 21 et une URL externe en 20e position refusées ; marge mesurée au-delà de 60. Audit npm de l'app : 23 failles sur toutes les dépendances, 16 hors dev (0 critique, 3 élevées : `brace-expansion`, `image-size`, `postcss`), toutes dans l'outillage de build (Metro, CLI d'`expo-updates`, `@expo/metro-config`) et non embarquées ; `npm audit fix` n'a plus rien à appliquer (simulation). `brace-expansion` (5.0.6, via `minimatch` ← `@expo/fingerprint`/`glob`) se corrigerait par un `overrides` DANS sa plage (5.0.12) ; `image-size` (Metro `^1.0.2`) et `postcss` (`~8.4.32`) exigent des versions hors plage (mise à jour d'Expo). Aucun `overrides` appliqué.
- [x] Revue Codex (2) : les règles acceptaient `mime: 42` ou un `name` objet → l'écran plante (`mime.startsWith`, texte). Double correction : (a) règles du pont (anciennes installations) : `name` et `mime` doivent être des textes, plafond ramené à 10 pièces jointes (budget mesuré : 19 max avec ces contrôles ; 10 acceptées testées) ; (b) app : `safeAttachments` écarte toute pièce jointe malformée à la lecture (devoirs, détail, calendrier admin, devoirs parent, formulaire prof, rendus parents). La fonction `manageHomework` garde 20 pièces jointes, tout vérifié. Risque résiduel : les pièces jointes des MESSAGES et des RESSOURCES suivent le même motif de lecture, non traité ici.

## 0 bis. Ordre de déploiement — OBLIGATOIRE

L'app crée désormais les devoirs via `manageHomework` (action `create`). Publier l'app avant la fonction casserait la création de devoirs.

1. [x] Déployé le 27/09 (13:20 UTC) depuis `462a76a` (arbre propre) : règles Firestore (ruleset `a7e063b3`) + les 43 fonctions de la codebase `default`, nommées une à une (`--only functions:default:<nom>,…`). **Pas de `--only functions` global** : 16 fonctions appartiennent à la codebase `admin` (repo mojammaa-admin), dont `getCoefficientSettings` et `saveLevelCoefficients`, AUSSI exportées par ce repo ; un déploiement global tenterait de se les réapproprier. 43/43 réussies, empreintes `admin` inchangées.
2. [x] `verify:rules` : en phase (`a7e063b3`). `functions:list` : 59 ACTIVE (43 default, 16 admin). Logs après déploiement : aucune erreur ni avertissement (tâches planifiées exécutées avec le nouveau code).
3. [x] Nouvelle OTA 1.0.16 publiée après le déploiement (étape 2). Tag `v1.0.16-final` → `9c988c2` fait. Reste : le build 1.0.17.

## 1. Vérifications juste avant le build

- [x] (27/09, avant le passage en 1.0.17, sur `54a84b2`) `git status` propre.
- [x] `npm run typecheck` et `npm test` : 141 tests OK.
- [x] `npm run test:emulator` : 8/8 fichiers OK (règles, devoirs, prière… ; `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`).
- [x] `npx expo-doctor` 18/18 puis `npm run verify:rules` en phase.
- [x] `eas fingerprint:compare --build-id afbb3736-6fcf-4d49-8920-ba28c65ac116` : seuls `.easignore`, `.gitignore` et les scripts de `package.json` diffèrent ; aucun module natif modifié.
- [ ] Quota de builds EAS du mois disponible (plan gratuit, remis à zéro chaque mois).

## 2. Dernière OTA sur le runtime 1.0.16 — avant de changer de version

Après le passage à 1.0.17, `eas update` publie pour le runtime 1.0.17 : les installations 1.0.16 ne reçoivent plus que les OTA publiées explicitement sur le runtime 1.0.16 (voir l'étape 7). La dernière OTA (`b0ae77ef`, 26/09) ne porte pas de commit git : on republie depuis le commit exact pour que 1.0.16 et 1.0.17 exécutent le même code.

- [x] `app.json` encore en `1.0.16`.
- [x] `CI=1 eas update --branch production --environment production --platform android --message "1.0.16 finale — a1a3fd3 (consolidation avant 1.0.17)"` → groupe `e7106d5e-90ed-459f-9535-ec58009b9bd6`, mise à jour `01a0e2a8-8dec-727c-933f-e453406b46d8`.
- [x] Même commande en `--platform ios` → groupe `93b0da1a-516e-4025-ba25-f1afa84fe172`, mise à jour `01a0e2a9-919c-74e8-bf9b-afa8073d50dc`.
- [x] Publié le 27/09 depuis `a1a3fd3` (arbre propre) ; Expo Updates sert bien ces deux identifiants pour `production` / `1.0.16`.
- [x] Republié le 27/09 depuis `679f40d` après les correctifs client : Android groupe `34775bb0-71e3-4319-b3a1-3c4a6f4d1c03` (mise à jour `01a0e2b3-6950-761a-b800-b8cc8d8f0bbc`), iOS groupe `9ba36427-3c68-4086-af98-d1db0eacfc30` (mise à jour `01a0e2b4-3e25-73bf-8114-69b009a0df2e`) ; identifiants servis pour `production` / `1.0.16` au 27/09. Ce n'est plus la dernière : l'app crée désormais les devoirs via `manageHomework`, donc une nouvelle OTA suit le déploiement.
- [x] Après l'étape 0 bis : OTA 1.0.16 publiée le 27/09 depuis `9c988c2` (arbre propre, création de devoirs via `manageHomework`, pièces jointes sécurisées). Android groupe `e70e7bde-9252-44e4-9b92-883b375ec84c` (mise à jour `01a0e30b-af7d-75f3-886b-fa825e9e8128`), iOS groupe `c396048a-65f2-4dfc-a979-06c91ae00af9` (mise à jour `01a0e30c-941c-76f6-a17e-68b0bd31a19b`) ; identifiants servis vérifiés pour `production` / `1.0.16`.
- [x] Tag `v1.0.16-final` déplacé sur `9c988c2` (commit de cette OTA), poussé le 27/09.

## 3. Passage en 1.0.17

- [x] `app.json` → `"version": "1.0.17"`, commit `chore(release): bump version 1.0.16 → 1.0.17`.
- [x] Recommandé : dans `eas.json` → `submit.production.android`, ajouter `"releaseStatus": "draft"` pour que la version arrive en brouillon dans la Play Console au lieu d'être déployée à 100 % dès la validation Google.

## 4. Build et soumission

- [x] `eas build -p android --profile production --auto-submit` (27/09, depuis `7c47027`).
- [x] Build `b7c2153d-d4ca-4c82-8b07-39f09182be4e`, versionCode **48**, terminé à 13:51 UTC. Soumission EAS `104238c4-db0a-4d72-b65d-202b29f1ff70` : FINISHED. Vérifié via l'API Google Play (lecture seule) : piste production = 1.0.17 (48) en **draft**, 1.0.16 (47) toujours `completed`.
- [ ] Contrôler l'archive : `functions/lib/collegeEvaluationPolicy.json` présent, `.secrets`, `data`, `backups` et `output` absents.

## 5. Recette sur téléphone — avant d'ouvrir le déploiement

> **Non faite** : décision de Youssef (27/09) de publier directement à 100 %. Risque accepté, atténué par : aucun module natif modifié depuis 1.0.16 ; le même JavaScript tournait déjà chez les utilisateurs 1.0.16 via l'OTA `9c988c2`. Les points ci-dessous restent à vérifier en conditions réelles.

APK signé sans nouveau build : Play Console → Explorateur d'app bundles → version 1.0.17 → Téléchargements → APK universel signé.

- [ ] Premier lancement : nouvelle interface visible immédiatement, sans attendre d'OTA.
- [ ] Connexion admin, professeur et parent ; activation parent avec un code de test ; interface en arabe (RTL).
- [ ] Parent : choix de l'enfant, résultats, devoirs et absences ; une alerte consultée disparaît et reste masquée après réouverture.
- [ ] Professeur : créer (le parent reçoit « 📚 Nouveau devoir » dans sa langue), modifier (avec et sans « Prévenir les familles »), supprimer un devoir sans rendu, puis un devoir avec rendu (doit devenir « annulé ») ; à chaque fois, push ET message dans la boîte du parent.
- [ ] Pièces jointes : un devoir avec plusieurs photos et un PDF s'ouvre chez le parent, le prof et l'admin (détail et calendrier).
- [ ] Navigation complète (onglets, retours, liens des notifications) : `@react-navigation/core` passé de 7.17 à 7.22 via `npm audit fix`.
- [ ] Comportement : motif, observation suggérée et « Autre motif » avec précision ; notification parent.
- [ ] Appel d'une séance, messagerie, statistiques admin.

## 6. Publication Google Play

- [x] Notes de version FR/AR/EN ajoutées et version passée de `draft` à `completed` (**100 %**, sans déploiement progressif, choix de Youssef) le 27/09 via l'API Google Play (édition validée puis publiée `13103155380886801420`, lancée par Youssef). Vérifié ensuite en lecture seule : production = 1.0.17 (48) `completed`, notes fr-FR/ar/en-US. Google examine la version avant sa mise en ligne effective (quelques heures à ~2 jours).
- [ ] Surveiller Android vitals (plantages, ANR) les premiers jours.

- [x] ~~Déploiement progressif~~ : publication directe à 100 % (voir ci-dessus).
- [ ] Notes de version (balises seules, sans libellé à l'intérieur) :

```
<fr-FR>
Nouvel accueil parent : résultats, devoirs et absences de chaque enfant en un coup d'œil. Les alertes disparaissent une fois consultées. Les enseignants peuvent modifier ou annuler un devoir, et les familles sont prévenues. Nouveaux motifs de comportement. Noms des enfants affichés en arabe. Écran d'activation parent traduit. Corrections et améliorations.
</fr-FR>
<ar>
واجهة رئيسية جديدة لأولياء الأمور: نتائج كل طفل وواجباته وغياباته في لمحة واحدة. تختفي التنبيهات بعد الاطلاع عليها. يمكن للأساتذة تعديل الواجب أو إلغاؤه مع إشعار الأسر. أسباب جديدة للملاحظات السلوكية. أسماء التلاميذ بالعربية. ترجمة صفحة تفعيل حساب ولي الأمر. إصلاحات وتحسينات.
</ar>
<en-US>
New parent home: each child's results, homework and absences at a glance. Alerts disappear once viewed. Teachers can edit or cancel homework, and families are notified. New behaviour reasons. Children's names shown in Arabic. Translated parent activation screen. Fixes and improvements.
</en-US>
```

## 7. Période de transition

Tant que des téléphones restent en 1.0.16, chaque correctif JavaScript est publié deux fois :

- [ ] runtime 1.0.17 : `eas update` normal depuis la branche ;
- [ ] runtime 1.0.16 : depuis un worktree sur `v1.0.16-final` (version 1.0.16), avec le correctif ajouté par cherry-pick, puis `eas update` Android et iOS.

### Correctif du 27/09 (soir) — cloison entre profs

- [x] Règles Firestore déployées (ruleset `e1ba974c`, `fe64d1c`) : un prof ne lit que SES devoirs, et seulement les annonces de l'administration parmi les messages tagués `classe`. Source live vérifiée identique au fichier avant/après.
- [x] Conséquence client : l'en-tête du dossier de classe prof affiche « 0 élèves · 0 devoirs » (requête `classeId` désormais refusée). Correctif `73588a1` (SES devoirs, `allSettled`).
- [x] OTA runtime 1.0.17 publiée le 27/09 depuis `16332c0` (arbre propre, contient `73588a1`) : groupe `a6fa988f-efd8-4a41-bc4b-ccdcd4a6a6f1`, Android `01a0e3b4-9f00-750a-b7a8-1989f9b9894a`, iOS `01a0e3b4-9f00-7123-b1d0-b1037933c7bc`.
- [x] OTA runtime 1.0.16 publiée le 27/09 depuis le worktree `~/mojammaa-sgs-ota-1016`, branche `hotfix/1.0.16-dossier-classe` (`c9fa1f4` = `9c988c2` + cherry-pick ; seul écart : lien `node_modules` non suivi) : groupe `56b89ac3-8b1a-48cb-82f5-cc71fc613d75`, Android `01a0e3b5-cded-77cc-9550-2950c9db34c0`, iOS `01a0e3b5-cded-7664-9b30-3c66b59c947e`.
- [x] Identifiants servis vérifiés pour `production` sur 1.0.16 et 1.0.17, Android et iOS.
- [x] Tag `v1.0.16-final` déplacé en local de `9c988c2` sur `c9fa1f4`. Reste : pousser le tag (`git push -f origin v1.0.16-final`) et la branche `hotfix/1.0.16-dossier-classe`.

### Connexion parent par mobile, activation sans e-mail (28/09)

- [x] Serveur (mojammaa-admin `12d57bd`, codebase `admin`, déployé par nom) : `redeemParentInvitation` et `linkParentInvitation` mises à jour, `parentPhoneLogin` et `createParentPasswordResetLink` créées (europe-west1).
- [x] Règles Firestore déployées (ruleset `5721f64e`, `60b8a01`) : `authPhoneE164` / `parentLoginEnabled` réservés au serveur et au superadmin. `verify:rules` : en phase.
- [x] Admin web (`vercel --prod`, alias mojammaa.com) : bouton lien WhatsApp dans Comptes, page de réinitialisation, tickets. Chunks servis vérifiés.
- [x] OTA runtime 1.0.17 publiée le 28/09 depuis `60b8a01` (branche `feat/parent-phone-login`, arbre propre) : groupe `723ce77a-e8db-4b61-9da8-dbc1e4ae3ef0`, Android `01a0e874-500b-70d3-998d-497c3b634c89`, iOS `01a0e874-500b-7dac-936a-fc92c1afbab6`. Une première tentative a échoué sans rien publier (« Asset processing timed out », deux envois simultanés) : publier les runtimes l'un après l'autre.
- [x] OTA runtime 1.0.16 publiée le 28/09 depuis `~/mojammaa-sgs-ota-1016`, `8dea223` (= `c9fa1f4` + cherry-pick de `60b8a01`, `tsc` et tests OK ; seul écart : lien `node_modules` non suivi) : groupe `ac939618-9ae3-449e-acec-20689981ef73`, Android `01a0e880-2494-731a-9898-26ab8e098eaf`, iOS `01a0e880-2494-747c-9aae-027f5396d60e`. Une tentative précédente est restée bloquée 8 min sur un appel réseau Expo avant l'export (0 % CPU) : arrêtée sans rien publier, puis relancée.
- [x] Identifiants servis vérifiés (`eas update:list`) : dernière mise à jour `production` = `723ce77a` sur 1.0.17 et `ac939618` sur 1.0.16, Android et iOS.
- [x] Tag `v1.0.16-final` déplacé en local de `c9fa1f4` sur `8dea223`. Reste : pousser le tag et la branche `hotfix/1.0.16-dossier-classe`.
- [ ] Recette avec un vrai numéro : activation sans e-mail, reconnexion par le numéro, lien WhatsApp depuis Comptes puis nouveau mot de passe (confirme que la production accepte l'identifiant `@parents.mojammaa.invalid` à la création).

### Numéros de connexion de tout pays (28/09, suite)

Les familles vivent aussi à l'étranger : tout numéro international est accepté (indicatif obligatoire hors Maroc ; sans indicatif, numéro marocain 05/06/07). Confirmation à l'activation au format international avec drapeau.

- [x] Serveur (mojammaa-admin `a248009`) : `redeemParentInvitation`, `parentPhoneLogin`, `createParentPasswordResetLink` redéployées par nom. Règles inchangées.
- [x] Admin web (`vercel --prod`, mojammaa.com) : affichage des indicatifs dans Comptes, tickets, `formatWaTel` corrigé pour les numéros « +… »/« 00… » (messagerie comprise). Chunks servis vérifiés.
- [x] OTA runtime 1.0.17 depuis `ec0cb3e` : groupe `d686c92b-f0e4-46e7-ad0c-af52956539cc`, Android `01a0e8c0-df17-7aed-80ac-af764688c065`, iOS `01a0e8c0-df17-7b6e-afa4-b303e4d3ff20`.
- [x] OTA runtime 1.0.16 depuis `~/mojammaa-sgs-ota-1016`, `b40e1db` (= `8dea223` + cherry-pick de `ec0cb3e`, `tsc` et tests OK) : groupe `b1518218-ace9-4038-ac3a-47abacc68e96`, Android `01a0e8c1-efe9-71b9-a784-fabee05214a4`, iOS `01a0e8c1-efe9-7197-aea2-f0edf358f341`.
- [x] Identifiants servis vérifiés (`eas update:list`) sur 1.0.16 et 1.0.17. Tag local `v1.0.16-final` déplacé sur `b40e1db`.
- [ ] Recette : ajouter un numéro étranger (ex. +32 ou +33) au scénario ci-dessus.
- [x] Admin web (mojammaa-admin `65ac82f`, `vercel --prod`) : page Codes parents — bouton WhatsApp sous chaque fiche générée (numéro de la fiche élève, message bilingue avec code, lien Play Store et étapes), copie si pas de numéro, repère « envoyé ». Chunk servi vérifié.

### Champ téléphone avec sélecteur de pays (28/09, soir)

- [x] App (`cfe13f1`) : `PhoneNumberField` (drapeau + indicatif, recherche FR/EN/AR, 40 pays + « Autre pays », mise en forme par pays, états focus/erreur/valide) sur l'activation et la connexion ; connexion « Téléphone | E-mail » mémorisée. Serveur inchangé (E.164 = point fixe de `normalizeLoginPhone`, testé pour chaque pays).
- [x] OTA runtime 1.0.17 depuis `cfe13f1` : groupe `6cc9a417-851f-48be-93be-e13ea741d67e`, Android `01a0e94f-100d-7b02-b1f2-2805a9cb6c58`, iOS `01a0e94f-100d-775a-921d-6349fadc244f`.
- [x] OTA runtime 1.0.16 depuis `ec64300` (= `b40e1db` + cherry-pick de `cfe13f1`, `tsc` et tests OK) : groupe `10741101-0d4e-44d4-9f87-8065b7c87441`, Android `01a0e950-24cf-7fa5-aecf-b7281eb4c06b`, iOS `01a0e950-24cf-7815-91f8-993aba1688f5`. Tag local `v1.0.16-final` → `ec64300`.
- [ ] **Publié sans rendu visuel vérifié** (pas de Xcode, émulateur Android bloqué : disque plein ; Expo Go iPhone en SDK 57). À contrôler en premier sur un vrai téléphone : écran de connexion (pastille, champ, sélecteur de pays) et activation.
- Retour arrière si l'écran de connexion pose problème — republier les groupes précédents :
  `eas update:republish --group d686c92b-f0e4-46e7-ad0c-af52956539cc` (1.0.17) puis, depuis `~/mojammaa-sgs-ota-1016`, `eas update:republish --group b1518218-ace9-4038-ac3a-47abacc68e96` (1.0.16).

### Audit du 28/09 — correctifs F1 à F11 (28/09, nuit)

Rapport : `docs/audit-2026-09-28.md`. Décision Youssef : un parent détaché perd l'accès à ses anciennes preuves (F8).

- [x] Correctifs : mojammaa-sgs `0238f66` (rapport et scripts de preuve `6a41d84`), mojammaa-admin `69a700f` (F1).
- [x] Tests : `tsc`, 162 tests Node, 10 fichiers émulateur (400 contrôles Firestore, Storage, transactions réelles F4, clé de libération F9, appel F10/F11), `expo-doctor` 18/18, exports Android et iOS, fonctions admin 65/65. Contre-épreuve : les nouveaux tests échouent sur l'ancien code ; les deux scripts d'audit affichent NOT REPRODUCED pour les 11 cas.
- [x] Fonctions déployées par nom : default `registerPushDevice`, `onEleveGuardianAccessWritten`, `loadAttendance`, `submitAttendance` (mises à jour), `reconcileGuardianAccess` (tous les jours 03:30) et `onAbsenceRequestWritten` (créées) ; admin `parentPhoneLogin`. Logs après déploiement : aucune erreur ni avertissement.
- [x] Règles Firestore `6199d811` et Storage `78e3257a` déployées ; `verify:rules` en phase.
- [x] `guardian-access:dry-run` (lecture seule) : 7 responsables liés, 7 documents, 0 écart — le premier passage nocturne ne change rien.
- Compatibilité : règles et fonctions acceptent les apps 1.0.16 et 1.0.17 actuelles (familles et profs ouvrent les fichiers par l'URL enregistrée ; seule l'affiche admin porte une pièce jointe de message ; aucune app ne modifie l'auteur ou la classe d'une ressource).
- [x] OTA runtime 1.0.17 publiée le 28/09 depuis `8c21d31` (arbre propre, contient `0238f66`) : groupe `6f81fc32-343d-493a-b524-46036473deb5`, Android `01a0e9ed-d52a-7295-9e5f-83ca2168c920`, iOS `01a0e9ed-d52a-7fed-b119-1ebaae606abc`.
- [x] OTA runtime 1.0.16 publiée ensuite depuis `~/mojammaa-sgs-ota-1016`, `bb23287` (= `ec64300` + cherry-pick de `0238f66`, sans conflit ; `tsc` OK, 162/162 tests avec `functions/node_modules` lié le temps du test — sans ce lien, 5 tests serveur échouent sur « Cannot find module firebase-functions », pas sur le code) : groupe `31337519-9958-4cbb-bfeb-226d1d8ae753`, Android `01a0e9ef-9685-77b0-b160-6564e7365808`, iOS `01a0e9ef-9685-7515-923e-788f1192b18f`. Tag local `v1.0.16-final` → `bb23287`.
- [x] Identifiants servis vérifiés (`eas update:list`) : dernière mise à jour `production` = `6f81fc32` sur 1.0.17 et `31337519` sur 1.0.16, Android et iOS.
- [ ] **Publié sur demande de Youssef sans recette téléphone.** À contrôler en premier sur un vrai Android et un iPhone : suppression d'un espace au milieu du numéro, activation (compte existant, numéro déjà pris), déconnexion en mode avion puis reconnexion, appel un jour marqué « cours annulés ».
- Retour arrière de l'app — republier les groupes précédents : `eas update:republish --group 6cc9a417-851f-48be-93be-e13ea741d67e` (1.0.17) puis, depuis `~/mojammaa-sgs-ota-1016`, `eas update:republish --group 10741101-0d4e-44d4-9f87-8065b7c87441` (1.0.16). Le serveur déjà déployé reste compatible avec ces versions.
- Retour arrière serveur : règles et fonctions nommées redéployées depuis `f5b919b` (mobile) et `65ac82f` (admin) ; supprimer `reconcileGuardianAccess` et `onAbsenceRequestWritten` si besoin.

### Boucle d'enregistrement push Android + site d'administration (29/09, nuit)

Constat dans Cloud Logging : `registerPushDevice` appelée ≈ 2 fois par seconde depuis un seul téléphone Android (521 appels en 25 min ; rafales de 100 à 400 par 10 min depuis au moins le 27/09). Cause : sur Android, chaque lecture du jeton émet aussi l'événement « nouveau jeton » (PushTokenModule.kt), que l'app traitait comme un changement.

- [x] Correctif app `4d38d8c` : seul un jeton réellement nouveau relance l'enregistrement ; envoi identique (compte, jeton, langue) répété au plus toutes les 10 min. Contre-épreuve : le test de boucle ne se termine jamais sur l'ancien code. `tsc`, 165 tests.
- [x] OTA runtime 1.0.17 depuis `4d38d8c` (arbre propre) : groupe `5d727455-7cee-489a-be14-b09030eeffc6`, Android `01a0ea56-3047-7009-851d-b8f29b2e968d`, iOS `01a0ea56-3047-7aed-82ef-ff16704f5d2e`.
- [x] OTA runtime 1.0.16 depuis `~/mojammaa-sgs-ota-1016`, `1a1ec57` (= `bb23287` + cherry-pick de `4d38d8c`, sans conflit ; `tsc` OK, 165/165 avec `functions/node_modules` lié le temps du test) : groupe `c765d3e8-46e7-4434-bf48-3d3a5c70cbc6`, Android `01a0ea57-975c-784a-b2cf-909c4c54b7d9`, iOS `01a0ea57-975c-7b0a-beeb-2a6107716977`. Tag local `v1.0.16-final` → `1a1ec57`.
- [x] Identifiants servis vérifiés (`eas update:list`) : `5d727455` sur 1.0.17, `c765d3e8` sur 1.0.16.
- [ ] Vérifier dans Cloud Logging, après redémarrage des apps Android, que les rafales de `registerPushDevice` ont disparu.
- Retour arrière de l'app : republier `6f81fc32` (1.0.17) et `31337519` (1.0.16).
- [x] Site d'administration (mojammaa-admin `0dd1012`, `vercel --prod` depuis un arbre propre du commit — le dossier de travail garde des modifications locales sans rapport) : chargement après connexion sans cascade (`9f05cdf`), élèves et comptes lus une fois par session (`f4713d7`), tableau de bord « Aujourd'hui » à base de comptages (`0dd1012`). Fichiers servis par mojammaa.com vérifiés identiques au build testé (`index-CCSE_sF7.js`, `Dashboard-Du6JMMe7.js`). Retour arrière : `vercel rollback` vers le déploiement précédent.

### Cache d'enregistrement push : régressions de `4d38d8c` (29/09, matin)

Revue Codex de `4d38d8c` : le cache de 10 min masquait deux cas (P2), plus un troisième relevé en seconde revue. (1) Déconnexion pendant l'appel serveur : la requête en cours réécrivait le cache vidé par la déconnexion, et le même compte reconnecté en moins de 10 min n'était pas réenregistré. (2) Échec (jeton ou serveur injoignable) : cache conservé, enregistrement ignoré au retour du réseau, état « non enregistré » affiché, bouton « Actualiser » compris. (3) Refus du serveur (`applied: false`) : un cache antérieur n'était pas vidé.

- [x] Correctif app `25c4156` : cache écrit seulement si le serveur a appliqué la demande sans déconnexion entre-temps, vidé sur tout échec ou refus ; « Actualiser » interroge toujours le serveur. Déduplication de l'écouteur (arrêt de la boucle) inchangée. Contre-épreuve : 4 des nouveaux tests échouent sur `4d38d8c`, le 5e (refus après succès) sur la première version du correctif. `tsc`, 170/170.
- [x] OTA runtime 1.0.17 depuis `25c4156` (arbre propre) : groupe `71711c18-00d8-414d-ade6-ad900e8756ac`, Android `01a0ec29-3fb6-72be-93b0-3af4fab97a6a`, iOS `01a0ec29-3fb6-7783-ad93-795412d386d8`.
- [x] OTA runtime 1.0.16 depuis `~/mojammaa-sgs-ota-1016`, `d7ecb14` (= `1a1ec57` + cherry-pick de `25c4156`, sans conflit ; `tsc` OK, 170/170 avec `functions/node_modules` lié le temps du test ; seul fichier non suivi : le lien `node_modules`, d'où l'astérisque sur le commit EAS) : groupe `c7f9e8d5-d4c5-48bb-8632-ea8e3c53d5a5`, Android `01a0ec2a-9652-7005-9393-39e3de1eb6ac`, iOS `01a0ec2a-9652-71fe-8736-9dfb729910f0`. Tag local `v1.0.16-final` → `d7ecb14`.
- [x] Identifiants servis vérifiés (`eas update:list`) : `71711c18` sur 1.0.17, `c7f9e8d5` sur 1.0.16.
- Retour arrière de l'app : republier `5d727455` (1.0.17) et, depuis `~/mojammaa-sgs-ota-1016`, `c765d3e8` (1.0.16).

## 8. Clôture

- [x] Tag `v1.0.17` sur `7c47027` (commit buildé), poussé.
- [x] Build `b7c2153d`, versionCode 48, publié à 100 % le 27/09 (en attente de l'examen Google).
- [ ] Fusionner la branche dans `main` quand la version est stable.

## Hors build — à planifier

- [x] Horloge GMT des fonctions serveur (`2521fa3`) et durcissement de `manageHomework` : version à la milliseconde, pièces jointes limitées au bucket (`2fdf4f3`). Audit Lilith du 27/09 : une traversée `../` trouvée dans la première version et corrigée. Tests verts.
- [ ] Déployer fonctions + règles : voir l'étape 0 bis.
- [x] Création de devoir atomique via `manageHomework` (code, 27/09) ; les règles valident aussi les pièces jointes des anciennes installations.
- [ ] Même nettoyage `safeAttachments` pour les pièces jointes des messages et des ressources (motif `mime?.startsWith` identique).
- [ ] Plus tard, quand plus aucune installation ne crée par `addDoc` (vérifier qu'aucun nouveau devoir n'est sans `createdVia`) : interdire la création client dans les règles.
- Écran « mise à jour obligatoire » : d'abord par OTA sur 1.0.16, activé seulement quand la 1.0.17 est disponible pour tous. Nécessite une modification des règles Firestore, donc un audit Lilith.
