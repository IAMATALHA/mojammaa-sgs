# Audit de la 1.0.18 — 11 octobre 2026

**Verdict : base technique solide, mais validation des nouveaux parcours insuffisante pour promouvoir le build 50 sans correction.** Cinq défauts fonctionnels reproduits avec le code réel et des interfaces natives/réseau simulées. Ils concernent surtout les reprises d'activation et les liens successifs ; aucun plantage général n'a été établi. Le flash sombre au lancement est un problème antérieur, dont le correctif local n'est pas dans le build 50.

Périmètre : les 18 fichiers modifiés entre `v1.0.17-49` (`a74eb90`) et `v1.0.18-50` (`d36a3d8`), puis le commit `afa727d` présent à HEAD. Relecture des parcours de connexion, activation parent/professeur, ajout d'enfant, partage WhatsApp, traductions et configuration native. Contrats serveur d'activation relus dans le dépôt `mojammaa-admin`, sans modification. La différence entre le build 50 et HEAD se limite à `android.backgroundColor`.

La vérification porte sur le dépôt et sur l'APK local signé par Google Play identifié par `aapt` comme version **1.0.18 / versionCode 50**. L'état actuel des pistes Play n'a pas été interrogé pendant cet audit. Aucun appel d'activation ou de rattachement n'a été effectué sur des comptes réels.

| Réf. | Priorité | Résultat observé | Déclencheur |
|---|---|---|---|
| F1 | P2 | Un lien valide ne rouvre plus l'activation/l'ajout d'enfant | Même lien retouché après arrêt du processus, compte toujours connecté |
| F2 | P2 | Un ancien code reste utilisable sous un nouveau lien sans code | Écran d'activation déjà ouvert, lien suivant incomplet ou sans fragment |
| F3 | P2 | Le formulaire ou la redirection correspond à l'ancienne invitation | Deux vérifications concurrentes, réponse ancienne reçue en dernier |
| F4 | P2 | Le lien de lancement remplace le lien touché plus récemment | Lecture initiale retardée, événement de lien reçu entre-temps |
| F5 | P2 | « J'ai déjà un compte » retourne à l'activation | Lien parent ouvert depuis l'écran « Activer mon compte » |

P2 signifie ici un défaut fonctionnel à corriger ; ce tableau ne prétend pas mesurer sa fréquence chez les utilisateurs. F3/F4 dépendent de l'ordre des réponses asynchrones, contrôlé dans les reproductions.

**F1 — L'anti-rejeu confond reprise automatique et nouvel appui volontaire.**

Dans [use-activation-link.ts](../src/hooks/use-activation-link.ts), lignes 64–67 et 90–91, l'empreinte du lien est mémorisée dès sa lecture, avant toute réussite de l'activation. Si un compte est connecté, toute ouverture à froid du même lien est ensuite ignorée, sans expiration ni distinction d'intention.

Reproduction : compte connecté → ouvrir un lien parent → fermer la feuille sans ajouter l'enfant → arrêter le processus → retoucher ce lien. La feuille ne revient pas. Un nouvel appui lorsque l'application est déjà ouverte fonctionne. Le même défaut affecte le lien professeur après avoir choisi « Rester connecté ». Deux montages React partageant le même stockage reproduisent les deux cas.

Correction attendue : distinguer le retour automatique à une tâche Android d'un nouveau lancement par lien ; ne pas traiter la seule égalité persistante de l'URL comme preuve d'absence d'intention. Préserver également le scénario Android de reprise depuis les applications récentes.

**F2 — Un lien sans code ne réinitialise pas le formulaire précédent.**

[ParentActivationScreen.tsx](../src/screens/auth/ParentActivationScreen.tsx), lignes 64–66, n'applique les nouveaux paramètres que si `linkCode` est non vide. Même garde dans [AccountActivationScreen.tsx](../src/screens/auth/AccountActivationScreen.tsx), lignes 111–116. Le parseur retourne pourtant explicitement `code: ''` pour un lien sans code entier.

Reproduction : ouvrir une invitation A, puis ouvrir le même chemin sans fragment ou avec un fragment incomplet. L'ancien code A reste affiché. Chez le professeur, le formulaire d'activation de A reste également actif. Le second lien n'a donc pas apporté de code valide, mais le formulaire permet encore une action sur l'invitation précédente. Aucun rattachement effectif n'a été réalisé pendant le test.

Correction attendue : à chaque nouvelle intention `linkAt`, appliquer aussi le code vide et revenir à la saisie ; invalider les opérations encore en cours sur l'ancien code. Vérifier le même comportement dans la feuille d'ajout d'enfant, qui comporte une garde similaire sur `initialCode`.

**F3 — Les vérifications d'invitation concurrentes ne sont pas invalidées.**

[AccountActivationScreen.tsx](../src/screens/auth/AccountActivationScreen.tsx), lignes 84–103 et 111–116 : chaque lien déclenche une vérification, mais toutes les réponses peuvent ensuite changer l'étape ou appeler `navigation.replace`, même si le code a changé.

Reproduction 1 : invitation A en attente ; ouvrir B ; B répond « compte existant » ; A répond ensuite « activation ». L'écran affiche le code B avec les champs de création de mot de passe décidés pour A. Reproduction 2 : A répond tardivement « parent » ; l'écran remplace alors l'invitation B par le formulaire parent prérempli avec A. Les deux cas ont été exécutés avec les vrais composants et des promesses contrôlées.

Correction attendue : associer chaque requête à un identifiant et ignorer ses réponses, erreurs et `finally` dès qu'une autre intention l'a remplacée ou que l'écran a été quitté.

**F4 — La lecture du lien initial peut écraser un événement plus récent.**

[use-activation-link.ts](../src/hooks/use-activation-link.ts), lignes 45–69 : le listener `url` et la lecture `getInitialURL`/AsyncStorage écrivent dans le même état sans règle de priorité.

Reproduction : suspendre la réponse du lien initial A ; émettre le lien B ; la feuille contient B ; terminer la lecture initiale ; la feuille contient désormais A. C'est une course distincte de F3 : elle précède les requêtes de vérification et touche aussi l'ajout d'enfant d'un utilisateur connecté.

Correction attendue : empêcher la lecture initiale de remplacer une intention reçue après son démarrage. Couvrir aussi les deux ordres de résolution dans un test.

**F5 — L'accès à la connexion dépend à tort de l'écran précédent.**

La nouvelle navigation [use-activation-link.ts](../src/hooks/use-activation-link.ts), lignes 83–85, ajoute l'écran parent à la pile existante. Or [ParentActivationScreen.tsx](../src/screens/auth/ParentActivationScreen.tsx), lignes 279–280, fait simplement `goBack()` pour « J'ai déjà un compte ». Le nouveau message de récupération après création sans session utilise le même mécanisme, ligne 114.

Reproduction avec le routeur installé `@react-navigation/routers` : `Login` → `AccountActivation` → ouverture d'un lien parent → `ParentActivation` → « J'ai déjà un compte » → `AccountActivation`. Le bouton ne mène pas à la connexion. L'hypothèse de l'ancien `goBack` était généralement satisfaite avant l'ajout des entrées par liens.

Correction attendue : cibler explicitement `Login` pour les actions promettant une connexion et garder le retour historique pour les vrais boutons « Retour ».

**Écart de livraison : le fond crème de démarrage n'est pas dans le build 50.**

Le tag `v1.0.18-50` pointe sur `d36a3d8`. Le correctif [app.json](../app.json), `android.backgroundColor: '#FFFBEB'`, appartient au commit suivant `afa727d`. Le message de ce commit précise que le flash sombre a été observé sur le build 50 et existait déjà en 1.0.17. La comparaison des commits confirme l'absence de ce réglage dans le build 50 ; le phénomène visuel n'a pas été reproduit sur appareil pendant cet audit. Ce changement natif exige un nouveau build : promouvoir le 50 ou envoyer seulement une OTA JavaScript ne l'inclut pas.

**Preuves et contrôles réussis.**

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | Réussi |
| `npm test` | 226/226 tests |
| `npm run test:emulator` avec JDK 21 | 12/12 fichiers ; dont 434 contrôles Firestore, cas autorisés/refusés et tests Storage |
| `npx expo-doctor` | 18/18 contrôles |
| `expo export --platform android --platform ios` | Deux bundles Hermes générés |
| `git diff --check v1.0.17-49..HEAD` | Aucun problème |
| APK signé Play | Version 1.0.18, code 50, signature vérifiée par `apksigner` |
| Manifeste de l'APK | `autoVerify`, `singleTask`, deux chemins HTTPS exacts, canal OTA `production` |
| `https://mojammaa.com/.well-known/assetlinks.json` | HTTP 200, JSON, package et empreinte SHA-256 identiques à l'APK |
| Reproductions React ajoutées pour l'audit | 11 scénarios exécutés : 8 reproductions des 5 défauts et 3 contrôles positifs |

Les trois contrôles positifs supplémentaires vérifient l'attente de la navigation/session avant l'ouverture initiale, le basculement de visibilité du champ mot de passe et ses libellés d'accessibilité, ainsi que le refus d'une confirmation de mot de passe différente avant tout appel serveur.

Les tests du lot livré couvrent le parseur et la configuration des liens, mais pas le hook de réception, les états successifs des écrans, ni ces courses. Cela explique pourquoi les 226 tests peuvent réussir malgré les défauts reproduits.

Le script de reproduction se trouve dans [output/audit-1.0.18/activation-flow.test.cjs](../output/audit-1.0.18/activation-flow.test.cjs), répertoire ignoré par Git et exclu des archives EAS. Il compile les sources actuelles sans les modifier, utilise React 19.1 et `react-test-renderer` installés uniquement dans `/private/tmp/mojammaa-audit-1018-harness`, et simule les interfaces natives/Firebase. **Ses assertions confirment le comportement défectueux actuel ; ses tests verts ne signifient pas que les défauts sont corrigés.** Commandes de reproduction dans l'en-tête du script. Journaux temporaires : `/private/tmp/mojammaa-audit-1018-*.log`.

Limites : aucun appareil ni émulateur Android n'était connecté (`adb devices` vide). L'affichage réel, le clavier, le défilement, le rendu RTL et l'ouverture depuis WhatsApp sur téléphone restent donc à valider. Les exports sont des vérifications de bundling, pas de nouveaux binaires natifs. Les règles ont été testées localement ; leur état déployé n'a pas été comparé à la production. Les deux problèmes évoqués par Youssef n'ont pas été décrits pendant l'audit et ne sont pas supposés identiques à ceux-ci.

L'export initial `--platform all` a signalé l'absence de `react-native-web`, déjà absente avant ce lot ; les exports Android/iOS ciblés ont ensuite réussi. Les premières exécutions de l'émulateur et d'Expo Doctor ont été limitées par le bac à sable, puis ont réussi avec les permissions nécessaires. Ces contraintes d'environnement ne sont pas comptées comme défauts de la 1.0.18.

Aucun code applicatif, dépendance du projet, compte, règle déployée ou piste de publication n'a été modifié. L'ordre recommandé est de corriger ces parcours, vérifier les reprises sur Android avec des comptes de test, puis construire un binaire incluant le fond de démarrage si ce correctif doit faire partie de la livraison.

Références consultées : [SDK Expo 54](https://docs.expo.dev/versions/v54.0.0/), [réception des liens React Native 0.81](https://reactnative.dev/docs/0.81/linking#handling-deep-links), [vérification Android App Links](https://developer.android.com/training/app-links/verify-applinks). Les constats ci-dessus viennent du code, des tests et de l'APK ; ces documentations ont servi à contrôler les contrats de la plateforme.

---

**Suivi des corrections — 11 octobre 2026 (Claude), commit `a8e69c1`.**

Les cinq défauts sont confirmés et corrigés. Aucun n'est livré : le build 50 de la piste interne ne les contient pas, il faut un build 51 (qui portera aussi le fond de démarrage `afa727d`).

| Réf. | Correction | Où |
|---|---|---|
| F1 | Le filtre « lien déjà vu » est supprimé du JavaScript. L'activité Android retire le lien d'un lancement rejoué (état sauvegardé, ou tâche relancée depuis l'historique) ; tout lien qui arrive à React est donc une intention. | `plugins/with-launch-link-intent.js`, `use-activation-link.ts` |
| F2 | Chaque lien refait la pile de connexion en `Login` + un écran neuf, et remonte la feuille « Ajouter un enfant ». Un lien sans code ouvre une saisie vide. | `authRoutesForLink`, `NavigationRoot.tsx`, `add-child-sheet.tsx` |
| F3 | Seule la dernière vérification compte ; une réponse tardive ou reçue écran fermé ne change ni l'étape ni la navigation. Modifier le code périme la vérification en cours. | `latest-only.ts`, `AccountActivationScreen.tsx` |
| F4 | Un lien reçu pendant la lecture du lien de lancement périme cette lecture. | `use-activation-link.ts` |
| F5 | « J'ai déjà un compte » et « Aller à la connexion » font `popToTop()`. | les deux écrans d'activation |

Défaut supplémentaire trouvé en corrigeant F1, absent de l'audit : un lien touché alors que la tâche existe encore mais que le processus est arrêté était **perdu**. Android le remet par `onNewIntent` avant que l'application soit chargée, et `ReactActivityDelegateWrapper` d'Expo l'ignore dans ce cas ; `getInitialURL()` relisait alors l'ancien intent. Le plugin garde ce lien comme intent courant.

Preuves :

| Contrôle | Résultat |
|---|---|
| `npm run typecheck`, `npm test` | Réussi, 237/237 (11 tests ajoutés : garde « dernière demande », pile de connexion avec le routeur réel, plugin) |
| Montage React de l'audit, assertions inversées (comportement corrigé exigé) | 14/14 ; chaque correction retirée fait échouer son test (4 mutations) |
| `expo prebuild` dans une copie | `MainActivity.kt` relu, identique après un second passage |
| APK de test EAS `4e60b94a` (profil `preview`, sans la protection Play) sur émulateur Android 16, compte déconnecté, codes synthétiques | 11 scénarios réussis, détail ci-dessous |

Scénarios sur émulateur : démarrage à froid par un lien ; processus arrêté puis retour par l'icône, puis par les applications récentes (aucun rejeu) ; processus arrêté puis autre lien, puis même lien retouché (ouverts) ; tâche créée par l'icône, processus arrêté, lien touché (ouvert) ; lien reçu application ouverte ; lien suivant sans code (saisie vide) ; « J'ai déjà un compte » depuis deux piles différentes (connexion) ; lien professeur avec vérification automatique. En mode sombre, plus aucune image sombre entre l'écran de démarrage et la connexion.

Reste non vérifié : les parcours **compte ouvert** sur appareil (feuille « Ajouter un enfant », question de déconnexion) ne sont couverts que par le montage React ; l'ouverture depuis WhatsApp sur un vrai téléphone ; F3 sur appareil (course réseau, couverte par le montage seulement).

