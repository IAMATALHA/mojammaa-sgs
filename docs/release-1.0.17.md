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

- [x] Revue Codex du 27/09 (soir) : la validation des pièces jointes dans les règles dépassait la limite Firestore de 1 000 expressions dès 10 pièces jointes → une seule expression régulière par pièce jointe ; 20 acceptées (limite), 21 et une URL externe en 20e position refusées ; marge mesurée au-delà de 60. Audit npm de l'app : 23 failles sur toutes les dépendances, 16 hors dev (0 critique, 3 élevées : `brace-expansion`, `image-size`, `postcss`), toutes dans l'outillage de build (Metro, CLI d'`expo-updates`, `@expo/metro-config`) et non embarquées ; `npm audit fix` n'a plus rien à appliquer (simulation) : il faudrait des `overrides` ou des versions majeures (Expo 57, firebase-admin 14), non appliqués.

## 0 bis. Ordre de déploiement — OBLIGATOIRE

L'app crée désormais les devoirs via `manageHomework` (action `create`). Publier l'app avant la fonction casserait la création de devoirs.

1. [ ] `firebase deploy --only functions,firestore:rules` depuis un arbre propre (accord explicite).
2. [ ] `npm run verify:rules` en phase ; `firebase functions:list` ; logs de `manageHomework` sans erreur.
3. [ ] Seulement ensuite : nouvelle OTA 1.0.16 (étape 2) et déplacement du tag `v1.0.16-final`, puis le build 1.0.17.

## 1. Vérifications juste avant le build

- [ ] `git status` propre, sur le commit qui sera buildé.
- [ ] `npm run typecheck` et `npm test` (41 fichiers, sans émulateur).
- [ ] `npm run test:emulator` (règles, devoirs, prière… ; `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`).
- [ ] `npx expo-doctor` puis `npm run verify:rules`.
- [ ] `eas fingerprint:compare --build-id afbb3736-6fcf-4d49-8920-ba28c65ac116` : noter ce qui diffère côté natif.
- [ ] Quota de builds EAS du mois disponible (plan gratuit, remis à zéro chaque mois).

## 2. Dernière OTA sur le runtime 1.0.16 — avant de changer de version

Après le passage à 1.0.17, `eas update` publie pour le runtime 1.0.17 : les installations 1.0.16 ne reçoivent plus que les OTA publiées explicitement sur le runtime 1.0.16 (voir l'étape 7). La dernière OTA (`b0ae77ef`, 26/09) ne porte pas de commit git : on republie depuis le commit exact pour que 1.0.16 et 1.0.17 exécutent le même code.

- [x] `app.json` encore en `1.0.16`.
- [x] `CI=1 eas update --branch production --environment production --platform android --message "1.0.16 finale — a1a3fd3 (consolidation avant 1.0.17)"` → groupe `e7106d5e-90ed-459f-9535-ec58009b9bd6`, mise à jour `01a0e2a8-8dec-727c-933f-e453406b46d8`.
- [x] Même commande en `--platform ios` → groupe `93b0da1a-516e-4025-ba25-f1afa84fe172`, mise à jour `01a0e2a9-919c-74e8-bf9b-afa8073d50dc`.
- [x] Publié le 27/09 depuis `a1a3fd3` (arbre propre) ; Expo Updates sert bien ces deux identifiants pour `production` / `1.0.16`.
- [x] Republié le 27/09 depuis `679f40d` après les correctifs client : Android groupe `34775bb0-71e3-4319-b3a1-3c4a6f4d1c03` (mise à jour `01a0e2b3-6950-761a-b800-b8cc8d8f0bbc`), iOS groupe `9ba36427-3c68-4086-af98-d1db0eacfc30` (mise à jour `01a0e2b4-3e25-73bf-8114-69b009a0df2e`) ; identifiants servis pour `production` / `1.0.16` au 27/09. Ce n'est plus la dernière : l'app crée désormais les devoirs via `manageHomework`, donc une nouvelle OTA suit le déploiement.
- [ ] Après l'étape 0 bis uniquement : nouvelle OTA 1.0.16 (Android + iOS) depuis un arbre propre, puis vérifier les identifiants servis.
- [ ] Tag `v1.0.16-final` (encore sur `a1a3fd3`) : le poser sur le commit de CETTE nouvelle OTA (push forcé du tag, à faire à la main).

## 3. Passage en 1.0.17

- [ ] `app.json` → `"version": "1.0.17"`, commit `chore(release): bump version 1.0.16 → 1.0.17`.
- [ ] Recommandé : dans `eas.json` → `submit.production.android`, ajouter `"releaseStatus": "draft"` pour que la version arrive en brouillon dans la Play Console au lieu d'être déployée à 100 % dès la validation Google.

## 4. Build et soumission

- [ ] `eas build -p android --profile production --auto-submit`
- [ ] Noter ici l'identifiant du build et le versionCode (48 si aucun build production depuis le 06/09).
- [ ] Contrôler l'archive : `functions/lib/collegeEvaluationPolicy.json` présent, `.secrets`, `data`, `backups` et `output` absents.

## 5. Recette sur téléphone — avant d'ouvrir le déploiement

APK signé sans nouveau build : Play Console → Explorateur d'app bundles → version 1.0.17 → Téléchargements → APK universel signé.

- [ ] Premier lancement : nouvelle interface visible immédiatement, sans attendre d'OTA.
- [ ] Connexion admin, professeur et parent ; activation parent avec un code de test ; interface en arabe (RTL).
- [ ] Parent : choix de l'enfant, résultats, devoirs et absences ; une alerte consultée disparaît et reste masquée après réouverture.
- [ ] Professeur : créer (le parent reçoit « 📚 Nouveau devoir » dans sa langue), modifier (avec et sans « Prévenir les familles »), supprimer un devoir sans rendu, puis un devoir avec rendu (doit devenir « annulé ») ; à chaque fois, push ET message dans la boîte du parent.
- [ ] Navigation complète (onglets, retours, liens des notifications) : `@react-navigation/core` passé de 7.17 à 7.22 via `npm audit fix`.
- [ ] Comportement : motif, observation suggérée et « Autre motif » avec précision ; notification parent.
- [ ] Appel d'une séance, messagerie, statistiques admin.

## 6. Publication Google Play

- [ ] Déploiement progressif : 20 %, puis 100 % après 48 h si Android vitals est stable.
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

## 8. Clôture

- [ ] `git tag v1.0.17` sur le commit buildé, puis `git push origin --tags`.
- [ ] Compléter ce fichier : identifiant du build, versionCode, date de mise en ligne, pourcentage de déploiement.
- [ ] Fusionner la branche dans `main` quand la version est stable.

## Hors build — à planifier

- [x] Horloge GMT des fonctions serveur (`2521fa3`) et durcissement de `manageHomework` : version à la milliseconde, pièces jointes limitées au bucket (`2fdf4f3`). Audit Lilith du 27/09 : une traversée `../` trouvée dans la première version et corrigée. Tests verts.
- [ ] Déployer fonctions + règles : voir l'étape 0 bis.
- [x] Création de devoir atomique via `manageHomework` (code, 27/09) ; les règles valident aussi les pièces jointes des anciennes installations.
- [ ] Plus tard, quand plus aucune installation ne crée par `addDoc` (vérifier qu'aucun nouveau devoir n'est sans `createdVia`) : interdire la création client dans les règles.
- Écran « mise à jour obligatoire » : d'abord par OTA sur 1.0.16, activé seulement quand la 1.0.17 est disponible pour tous. Nécessite une modification des règles Firestore, donc un audit Lilith.
