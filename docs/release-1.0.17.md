# Android 1.0.17 — checklist de sortie

Version de consolidation : intègre au binaire les OTA publiées sur le runtime 1.0.16 depuis le 6 septembre (noms latins puis arabes, accueils parent et admin, alertes consultées, gestion des devoirs, motifs de comportement, activation parent traduite). Aucune nouvelle dépendance native prévue.

Point de départ : 1.0.16, versionCode 47, build `afbb3736-6fcf-4d49-8920-ba28c65ac116` (06/09). Politique `runtimeVersion: appVersion`, versionCode auto-incrémenté à distance.

## 0. Code — fait le 27/09

- [x] Travail non commité réparti en 10 commits par thème (`0ac7d57..171e125`), `tsc` vert sur chacun.
- [x] Tests au 27/09 sur cet arbre : 40 fichiers Node, 327 tests de règles, devoirs, prière, communications, reset, transport, Storage (émulateur JDK 21), `expo-doctor` 18/18, `verify:rules` en phase.
- [x] `/output/` exclu de git et de l'archive EAS.
- [ ] Pousser la branche : `git push origin config/coefficients-college`.

## 1. Vérifications juste avant le build

- [ ] `git status` propre, sur le commit qui sera buildé.
- [ ] `npm run typecheck` et `npm run test:stats`.
- [ ] `npm run test:rules` avec `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
- [ ] `npx expo-doctor` puis `npm run verify:rules`.
- [ ] `eas fingerprint:compare --build-id afbb3736-6fcf-4d49-8920-ba28c65ac116` : noter ce qui diffère côté natif.
- [ ] Quota de builds EAS du mois disponible (plan gratuit, remis à zéro chaque mois).

## 2. Dernière OTA sur le runtime 1.0.16 — avant de changer de version

Après le passage à 1.0.17, les installations 1.0.16 ne reçoivent plus rien. La dernière OTA (`b0ae77ef`, 26/09) ne porte pas de commit git : on republie depuis le commit exact pour que 1.0.16 et 1.0.17 exécutent le même code.

- [ ] `app.json` encore en `1.0.16`.
- [ ] `CI=1 eas update --branch production --platform android --message "1.0.16 finale — <commit>"`
- [ ] `CI=1 eas update --branch production --platform ios --message "1.0.16 finale — <commit>"` (les OTA précédentes couvraient aussi iOS).
- [ ] `git tag v1.0.16-final` sur ce commit.

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
- [ ] Professeur : créer, modifier (avec et sans « Prévenir les familles »), supprimer un devoir sans rendu, puis un devoir avec rendu (doit devenir « annulé ») ; le parent reçoit la notification.
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

- Horloge GMT dans les fonctions serveur (rendez-vous, appel, actions du tableau de bord, date du jour) : correctif serveur, indépendant de ce build.
- Écran « mise à jour obligatoire » : d'abord par OTA sur 1.0.16, activé seulement quand la 1.0.17 est disponible pour tous. Nécessite une modification des règles Firestore, donc un audit Lilith.
