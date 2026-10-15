# Audit de Mojammaa Connect — 15 octobre 2026

Base examinée : commit `f9552bf`, dépôt propre au départ. Application Expo 54, version déclarée 1.0.18. **Sept défauts confirmés localement : un P1, cinq P2, un P3.** Aucun correctif applicatif ni déploiement effectué ; seuls ce rapport et les scripts de reproduction sont ajoutés.

Il s'agit d'une revue ciblée des 22 chapitres avec les tests du dépôt, des montages React et les émulateurs Firebase. Ce n'est pas une certification exhaustive : pas de téléphone connecté, pas d'essai des parcours sur appareil, pas de comparaison des règles déployées, pas de campagne de charge. Les services d'activation hébergés dans le dépôt voisin `mojammaa-admin` ne font pas l'objet d'un nouvel audit complet ici. Aucune donnée réelle d'élève ou de parent n'a été utilisée.

## Défauts confirmés, par priorité

### A07 — P1 — Écritures d'absence permettant de contourner les contrôles serveur

Localisation : [firestore.rules](../firestore.rules), lignes 591–598 ; comparaison avec [attendanceSubmission.js](../functions/attendanceSubmission.js), `validateLesson` et `submitAttendance`.

Les règles autorisent un professeur à créer une absence si l'élève appartient à sa classe, sans imposer les autres invariants de la fonction serveur. Un client authentifié peut donc écrire directement dans Firestore, sans passer par `submitAttendance`.

Reproduction sur émulateur : un professeur de la classe TEST écrit pour un élève de cette classe une absence datée du 15 octobre 2099, journée déclarée sans cours, avec séance `invented`, `justified: true` et `professorId: someone-else`. **Écriture acceptée.** Le même document écrit par un parent extérieur est refusé. Les contrôles de calendrier, date, séance, justification et auteur du serveur ne protègent donc pas cette voie d'accès.

Impact : intégrité des appels, des justificatifs et de l'attribution au professeur. Il faut un compte enseignant autorisé pour la classe, ou du personnel habilité ; aucune attaque anonyme ni exploitation réelle n'est démontrée.

Correction proposée : faire converger les écritures vers la fonction serveur et fermer les écritures directes non nécessaires. Si d'anciennes versions dépendent encore de ces écritures, préparer leur migration ou un contrat de règles strict avant fermeture. Vérifier les mises à jour, pas seulement les créations.

### A05 — P2 — Le personnel chargé des rendez-vous ne peut pas charger les enseignants

Localisation : [appointments-screen.tsx](../src/screens/shared/appointments-screen.tsx), lignes 35–41 ; [directoryService.ts](../src/services/directoryService.ts), `getStaffDirectory` ; [firestore.rules](../firestore.rules), ligne 1086.

Le rôle `staff` avec le droit `rendezvous` accède à `AdminAppointmentsScreen`, qui lit `directory/staff`. Les règles autorisent cette lecture aux administrateurs, enseignants et responsables d'enfant, mais pas au personnel sur la seule base de ce droit.

Reproduction : compte synthétique `staff` avec `droits: ['rendezvous']`, sans enfant lié : lecture refusée. Contrôle positif : même lecture autorisée à un administrateur.

Impact : erreur dans l'écran et liste des enseignants vide, empêchant de proposer un rendez-vous avec un professeur. Les opérations avec l'administration ne sont pas toutes bloquées. Un membre du personnel ayant aussi un enfant lié peut masquer le défaut grâce à son accès parent.

Correction proposée : exposer un annuaire limité au besoin du droit `rendezvous`, par règle précisément bornée ou fonction serveur ; ajouter le test du parcours staff sans enfant.

### A01 — P2 — Un vrai appui sur une notification ancienne est ignoré au démarrage

Localisation : [usePushTapNavigation.ts](../src/hooks/usePushTapNavigation.ts), lignes 109–116.

Le hook refuse les notifications âgées de plus de deux minutes au démarrage et durant les huit premières secondes. Il confond l'âge de la notification avec l'ancienneté de l'intention d'ouverture.

Reproduction avec le vrai hook monté dans React 19.1 : une réponse de lancement portant un message et une notification vieille de cinq minutes ne produit aucune navigation ; une notification vieille de trente secondes ouvre bien les messages.

Impact : toucher plus tard une notification dans le centre de notifications peut ouvrir l'application sans ouvrir le message demandé. La reproduction contrôle la réponse native simulée ; le geste sur téléphone reste à vérifier.

Correction proposée : distinguer un nouvel appui d'un intent Android rejoué, sans exclure les notifications uniquement sur leur âge. Ajouter les tests « ancien message touché maintenant » et « reprise par l'icône sans nouvel appui ».

### A02 — P2 — Le compteur de retards parent reste à zéro

Localisation : [absencesService.ts](../src/services/absencesService.ts), `subscribeAbsenceHistoryForEleves` ; [useParentAbsences.ts](../src/hooks/useParentAbsences.ts), filtre et `toEntry` ; [ParentAbsencesScreen.tsx](../src/screens/student/ParentAbsencesScreen.tsx), calcul `stats.retards`.

L'écran présente un compteur « Retards », mais le service ne sélectionne que `statut == 'absent'`. Le hook filtre une deuxième fois les retards et convertit chaque ligne en `type: 'absence'`.

Reproduction React : le service simulé fournit une absence et un retard pour le même enfant ; seule l'absence est restituée et le compteur de lignes de type retard vaut zéro. Même élargir uniquement la requête ne suffirait pas.

Correction proposée : lire et convertir les deux statuts, vérifier les index, puis tester une famille ayant uniquement des retards et une famille avec absences et retards.

### A03 — P2 — Le taux de présence enseignant reste périmé après l'appel

Localisation : [useTeacherData.ts](../src/hooks/useTeacherData.ts), lignes 155–168 ; affichage dans [TeacherDashboardScreen.tsx](../src/screens/teacher/TeacherDashboardScreen.tsx), ligne 399.

Le calcul est relancé seulement si la liste des classes ou le nombre d'élèves change. Il n'écoute pas les nouvelles absences et n'est pas relancé par le tick d'horloge. L'accueil peut rester monté pendant qu'un professeur effectue l'appel.

Reproduction React : première lecture à 100 %, puis le résultat serveur simulé passe à 0 %. Un tick d'une minute et une nouvelle liste d'élèves de même taille ne déclenchent aucune nouvelle lecture : l'indicateur reste à 100 %.

Impact : le tableau de bord peut afficher une présence périmée après saisie. En complément, l'erreur de lecture retombe elle aussi sur 100 %, ce qui présente une indisponibilité comme une présence parfaite.

Correction proposée : actualiser à la reprise du focus et après enregistrement, ou souscrire à un agrégat borné ; représenter explicitement une mesure inconnue.

### A08 — P2 — Réessayer le profil ne rétablit pas son suivi en temps réel

Localisation : [AuthContext.tsx](../src/contexts/AuthContext.tsx), lignes 158–165 et 200–213.

Après une erreur terminale du listener Firestore, la référence est vidée. Le bouton Réessayer utilise `refresh`, qui ne fait qu'un `getDoc` et ne recrée pas `onSnapshot`.

Reproduction avec le vrai fournisseur React : authentification → erreur du listener → `profileError: true` → lecture ponctuelle réussie après `refresh` → rôle admin restauré, mais toujours une seule souscription créée, celle qui a échoué.

Impact : les modifications suivantes du profil, du rôle ou des droits ne sont plus suivies pendant cette session. Ce défaut ne démontre pas un contournement des permissions serveur ; il rend l'interface et la révocation locale périmées. Une simple déconnexion réseau transitoire n'est pas assimilée ici à une erreur terminale.

Correction proposée : partager une procédure de réabonnement entre connexion et récupération, et tester rétrogradation/suppression après la reprise.

### A06 — P3 — Un compte extérieur peut falsifier une vue de ressource

Localisation : [firestore.rules](../firestore.rules), lignes 817–823.

La branche qui autorise l'ajout de son UID à `viewedBy` ne vérifie pas que l'utilisateur appartient à l'audience de la ressource.

Reproduction : parent sans enfant lié, ressource d'une classe étrangère : lecture refusée, mais `arrayUnion` de son propre UID dans `viewedBy` accepté. L'identifiant de la ressource doit être connu ; cette preuve ne montre pas une possibilité d'en lire le contenu ni d'usurper l'UID d'un autre lecteur.

Impact : statistiques de consultation faussées et écriture hors périmètre.

Correction proposée : exiger l'appartenance à l'audience pour cette mise à jour, tout en conservant la contrainte d'ajout de son seul UID.

## Couverture des 22 chapitres

« Pas de nouveau défaut confirmé » signifie uniquement que les lectures ciblées et les tests exécutés n'en ont pas établi ; cela ne garantit pas l'absence de bugs.

| Nº | Chapitre | Contrôle et conclusion |
|---|---|---|
| 1 | Démarrage et stabilité | App, fournisseur Auth, ErrorBoundary, typecheck, Doctor et bundles. Exports réussis ; démarrage natif et erreurs de polices non validés sur appareil. |
| 2 | Connexion et sessions | AuthContext, LoginScreen, services d'accès, tests de récupération. A08 confirmé. Auth distante non exercée. |
| 3 | Activation | Hook des liens, activation parent, contrats clients, tests parseur/cycle/récupération. Pas de nouveau défaut confirmé ; serveur voisin et WhatsApp réel à vérifier. |
| 4 | Rôles et autorisations | NavigationRoot, StaffStack, espaces hybrides, règles et tests de droits. A05 et A08 ; frontières serveur testées avec comptes fictifs. |
| 5 | Sécurité Firebase | Règles Firestore/Storage, suite émulateurs, scénarios supplémentaires autorisés/refusés. A06 et A07. État déployé non comparé. |
| 6 | Navigation | Piles et réception des liens/push. A01. Navigation tactile, retour système et clavier à vérifier sur appareil. |
| 7 | Élèves, parents et classes | Services élèves, liens responsables, WorkspaceProvider, tests guardianAccess/import/année. Pas de nouveau défaut confirmé. |
| 8 | Tableaux de bord | Hooks parent/professeur, accueil admin, tests des résumés. A03. |
| 9 | Notes et évaluations | Lecture des notes, coefficients, bulletin, règles, tests barèmes/évaluation/progression/import. Pas de nouveau défaut confirmé. Pas d'import dans les données réelles. |
| 10 | Absences et appels | Service, hook parent, écran parent, serveur, brouillons, tests conflits/calendrier. A02 et A07. |
| 11 | Devoirs et remises | Hook parent, service de remises, écran de liste, validations et tests serveur/règles. Observation A04 ci-dessous, sans impact UI confirmé. |
| 12 | Comportement et mérite | Services, annulation serveur, journal professeur, hook parent, tests de progression/communications. Pas de nouveau défaut confirmé. |
| 13 | Emploi du temps et calendrier | Services calendrier, hooks de créneaux/cours, validations serveur, tests séances et fuseau marocain. Reprise de jour et appareil dans un autre fuseau restent à éprouver. |
| 14 | Messagerie | Service, normalisation, réponses, tests de pagination et règles. Pas de nouveau défaut confirmé ; pièces jointes réelles non ouvertes. |
| 15 | Notifications | Enregistrement/libération d'appareil, synchronisation, navigation et tests. A01 ; livraison FCM/APNs réelle non testée. |
| 16 | Ressources | Service et écran parent, liens, règles, tests URL. A06. Ouverture par les applications PDF/vidéo à vérifier sur appareil. |
| 17 | Rendez-vous | Serveur transactionnel, disponibilités, hook et écran, tests de communications. A05. |
| 18 | Transport et sortie | Transitions serveur, invariants passagers, espaces et tests émulateurs. Pas de nouveau défaut confirmé. Parcours chauffeur/parent réel non parcouru. |
| 19 | Prière | Service, transitions, permissions et tests de séance. Pas de nouveau défaut confirmé. |
| 20 | Administration et personnel | Pile staff, droits, accès comptes, annuaires, accueil et tests staff. A05. |
| 21 | Statistiques et rapports | Tests statistiques/invariants/coefficient/barème, lectures ciblées des hooks et écrans. A03. Concordance avec une base réelle non mesurée. |
| 22 | Qualité et livraison | TypeScript, tests, Expo Doctor, bundles Android/iOS, comparaison clés FR/AR/EN. Aucune clé FR absente en AR/EN. RTL global explicitement désactivé dans le code : limitation existante, pas une nouvelle régression prouvée. Performance, lisibilité et accessibilité visuelle non certifiées. |

## Observation non comptée comme bug utilisateur

**A04 :** `useParentDevoirs` fige `isPast` sur la date de création du listener. Une reproduction montre qu'il reste faux après minuit, même avec un nouveau snapshot. Cependant, la recherche des usages montre que cette propriété n'est pas consommée par l'écran actuel ; `DevoirDetailScreen` recalcule sa propre valeur. Ce défaut latent n'entre donc pas dans les sept bugs confirmés ayant un impact identifié. Le rafraîchissement réel du détail après une nuit reste à tester.

## Preuves et commandes

| Contrôle | Résultat de cette session |
|---|---|
| `npm run typecheck` | Réussi |
| `npm test` | 285 tests, 0 échec |
| `npm run test:emulator` avec JDK 21 | 18 fichiers de tests, 0 échec ; inclut les tests internes de règles et fonctions |
| `npx expo-doctor` | 18/18 contrôles |
| `CI=1 npx --no-install expo export --platform android --platform ios --output-dir /tmp/mojammaa-audit-20261015-bundle` | Deux bundles Hermes générés ; pas de nouveau binaire natif |
| Reproductions React ajoutées | 5 scénarios passés : A01, A02, A03, A04 latent, A08 |
| Reproductions Firestore ajoutées | A05, A06 et A07 reproduits, avec contrôles positifs/négatifs |
| Appareil Android | `adb devices` : aucun appareil connecté |

Scripts : [client React](../tests/audit/2026-10-15-client.cjs), [règles Firebase](../tests/audit/2026-10-15-rules.mjs). Les assertions de ces scripts décrivent délibérément les défauts actuels : **leur réussite confirme les reproductions, pas une correction**. Ils sont séparés du lanceur habituel `npm test`.

```sh
npm install --prefix /tmp/mojammaa-audit-20261015-react --no-audit --no-fund --ignore-scripts react@19.1.0 react-test-renderer@19.1.0
node --test tests/audit/2026-10-15-client.cjs
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home firebase emulators:exec --only firestore --project demo-mojammaa-audit-20261015 'node tests/audit/2026-10-15-rules.mjs'
```

Journaux locaux : `/tmp/mojammaa-audit-tests.log`, `/tmp/mojammaa-audit-emulator.log`, `/tmp/mojammaa-audit-repros.log`, `/tmp/mojammaa-audit-rules-repros.log`, `/tmp/mojammaa-audit-export.log`, `/tmp/mojammaa-audit-doctor.log`. Les dépendances React de reproduction sont uniquement dans `/tmp`, sans modification du manifeste ni du verrou du projet.

Les premières tentatives émulateur/ADB ont rencontré les restrictions réseau locales du sandbox ; les reprises autorisées ont permis les contrôles. Une tentative de connexion à l'émulateur après son arrêt a échoué ; la reproduction a ensuite réussi avec `emulators:exec`.

Documentation de plateforme consultée : [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/), [notifications Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/). Les constats proviennent du code et des exécutions locales.

## Suite et niveau de modèle

Ordre proposé : A07 → A05/A08 → A01/A02/A03 → A06. Transformer les reproductions en tests du comportement attendu lors des corrections, puis exécuter les parcours sur téléphone avec des comptes de test.

Aucun chapitre n'a nécessité un modèle ChatGPT plus puissant pour établir ces constats. Les limites restantes concernent l'accès à un appareil, les services du dépôt voisin et la vérification de la production. Une seconde revue indépendante des corrections de sécurité peut être utile ; elle ne remplace pas les tests d'accès autorisé/refusé.

## Contre-audit (Claude) — défauts non listés ci-dessus

Relecture du même commit `f9552bf` : règles Firestore/Storage, fonctions des absences, du dossier élève et des ressources (branche `feat/ressources-liens`). **Onze défauts supplémentaires : un P1, trois P2, sept P3.** Aucun correctif ni déploiement. Reproductions émulateur : [2026-10-15-claude-rules.mjs](../tests/audit/2026-10-15-claude-rules.mjs) (C01, C03, C05 : réussite = défaut confirmé).

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home npx firebase emulators:exec --only firestore --project demo-mojammaa-claude-20261015 'node tests/audit/2026-10-15-claude-rules.mjs'
```

### C01 — P1 — Un professeur peut créer un élève rattaché à n'importe quel compte

Localisation : [firestore.rules](../firestore.rules), lignes 512–514 (`allow create` sur `eleves`).

La branche personnel impose `parentUid == ''`, mais pas la branche professeur : `teacherTeaches(classe)` suffit. Seule la **mise à jour** verrouille `parentUid` (lignes 521–525). Le trigger `onEleveGuardianAccessWritten` crée alors un `guardianAccess` actif pour le compte choisi.

Reproduction émulateur : le même professeur se voit refuser `updateDoc(eleves/child, { parentUid })`, mais `setDoc(eleves/fake1, { classe: 'TEST', parentUid: 'accomplice' })` est **accepté** (idem avec son propre uid). Avec le `guardianAccess` qu'en tire le trigger, le compte lit une diffusion `toType: 'parents'`.

Impact : n'importe quel professeur (ou un compte complice) obtient l'espace parent : toutes les diffusions « parents » de l'établissement, devoirs/ressources/statistiques de la classe, annuaire, et l'écriture à l'administration au nom d'un « enfant » fictif. Plus grave que A07 : aucun lien réel n'est nécessaire.

Correction proposée : ajouter `request.resource.data.get('parentUid', '') == ''` à la branche professeur (comme pour le personnel) ; test « prof crée un élève avec parentUid → refusé ».

### C02 — P2 — Approuver une déclaration après l'appel ne justifie jamais l'absence

Localisation : [absenceRequestsService.ts](../src/services/absenceRequestsService.ts), `decideAbsenceRequest` ; [staff-operations-screen.tsx](../src/screens/staff/staff-operations-screen.tsx), `StaffDeclarationsScreen` ; [index.js](../functions/index.js), `onAbsenceRequestWritten` ; [attendanceSubmission.js](../functions/attendanceSubmission.js), `submitAttendance`.

La justification n'est posée que **pendant** `submitAttendance`. Le trigger ne réagit qu'au passage à `declined`. Cas courant : le parent déclare le lendemain (« il était malade hier »), ou le personnel clique « Approuver » dans l'écran Déclarations : la demande passe à `approved`, mais l'absence déjà saisie reste **non justifiée**. Elle reste comptée dans « absences non justifiées » (`dashboardActions`) et chez le parent. Constaté à la lecture du code, pas exécuté.

Correction proposée : dans `onAbsenceRequestWritten`, au passage à `approved`, justifier les absences `statut == 'absent'` de cet élève à cette date (transaction, même champs que `submitAttendance`).

### C03 — P2 — Déclaration d'absence : classe, date et taille non contrôlées

Localisation : [firestore.rules](../firestore.rules), lignes 652–656.

La création vérifie le lien parent-enfant et `status == 'pending'`, mais pas `classe == eleves/{eleveId}.classe`, ni le format de `date`, ni la taille de `reason`, ni la liste des champs. `submitAttendance` cherche les déclarations **par classe** : une classe fausse (ou un élève changé de classe entre-temps) rend la déclaration invisible pour le bon professeur et rien n'est justifié.

Reproduction émulateur : le parent crée une déclaration `classe: 'OTHER'`, `date: 'not-a-date'`, `reason` de 50 000 caractères, `decidedBy: 'admin'` : **acceptée**. Le professeur de OTHER la lit et l'approuve ; le vrai professeur de l'enfant ne la voit pas.

Correction proposée : `classe` égal à la classe réelle de l'élève, `date` au format `AAAA-MM-JJ`, `reason` ≤ 500, `keys().hasOnly([...])`.

### C04 — P2 — Les avertissements annulés comptent encore dans le dossier élève du site

Localisation : [index.js](../functions/index.js), `getStatsStudentFile`, lignes 1934–1947 ; consommateur `mojammaa-admin/src/components/StudentFile360.tsx`, ligne 240.

La liste `behavior` renvoyée ne filtre pas `cancelledAt` et ne transmet aucun indicateur d'annulation. Le site compte `kind === 'avertissement'` : un avertissement annulé par `cancelComportement` reste affiché et compté comme actif dans le dossier 360°. L'écran parent et `behavior-overview` les excluent correctement. Constaté à la lecture du code.

Correction proposée : renvoyer `cancelled: true` (+ motif) et l'exclure des compteurs du site, ou le filtrer côté serveur.

### C05 — P3 — Journal de suivi : un professeur écrit hors de ses classes

Localisation : [firestore.rules](../firestore.rules), lignes 1012–1018.

`create` n'exige que `createdBy == uid` ; `update` de sa propre entrée peut changer `classe`/`eleveId`. Reproduction émulateur : un professeur crée un suivi `classe: 'OTHER'`, que le professeur de OTHER lit. Aucun lecteur en service aujourd'hui (le commentaire des règles le dit), d'où P3 ; à corriger avant de monter `SuiviEleve`.

### C06 — P3 — Tout compte connecté peut déposer des fichiers dans `notes-imports/`

Localisation : [storage.rules](../storage.rules), lignes 84–87. Contrairement à `devoirs/` et `ressources/`, pas de `isStaffUploader()` : un parent peut déposer des fichiers de 25 Mo sans limite de nombre dans son dossier (coût Storage). Ajouter `currentRole() in ['professeur','admin']`.

### C07 — P3 — Affiches d'annonces sans limite de taille ni de type

Localisation : [storage.rules](../storage.rules), lignes 101–106. Réservé aux admins, mais sans `isAllowedDoc()`, alors que le fichier est lisible par tous les comptes connectés. Ajouter une borne (images ≤ 10 Mo).

### C08 — P3 — Les fichiers supprimés restent en ligne indéfiniment

Aucun `deleteObject` dans `src/` ni `functions/`, et la règle `write` de `devoirs/`/`ressources/` appelle `isAllowedDoc()` sur `request.resource`, nul lors d'une suppression : un professeur ne **peut** donc pas effacer ses fichiers. Supprimer une ressource ou un devoir laisse le fichier accessible par son URL à jeton pour toujours (confidentialité + coût). Supprimer côté serveur (trigger `onDelete`) ou séparer `allow delete`.

### C09 — P3 — Pièces jointes `text/html` acceptées, y compris dans les preuves parent

Localisation : [storage.rules](../storage.rules), ligne 16 (`text/.*`). Un parent peut déposer une page HTML comme « preuve de devoir » ; le professeur l'ouvre depuis `firebasestorage.googleapis.com`, un domaine Google de confiance : vecteur d'hameçonnage. L'app ne propose que PDF/images : restreindre à `text/plain` et `text/csv`.

### C10 — P3 — Ressources (branche actuelle) : le lien tapé mais non ajouté échappe aux limites

Localisation : [TeacherRessourcesScreen.tsx](../src/screens/teacher/TeacherRessourcesScreen.tsx), `submit`. `addLink` borne le libellé à 80 caractères et le nombre à 5, mais le lien en attente ajouté par `submit` ne passe ni par l'un ni par l'autre : un 6ᵉ lien est enregistré puis disparaît silencieusement à la lecture (`safeLinks` coupe à 5). Appliquer les mêmes bornes, ou refuser au-delà de 5.

### C11 — P3 — La recherche des ressources ignore les chiffres arabes

Localisation : [ressourceLinks.ts](../src/utils/ressourceLinks.ts), `foldSearch`. La plage `U+064B–U+0670` censée retirer les voyelles contient aussi les chiffres arabes `٠–٩` (`U+0660–U+0669`) : `foldSearch('تمرين ٣')` donne `'تمرين '`. Chercher « ٣ » seul affiche tout. Vérifié avec Node. Remplacer par `[ً-ٰٟـ]`.

### Ordre proposé (avec ceux de Codex)

C01 → A07 → C02/C03 → A05/A08 → C04/A01/A02/A03 → A06/C05–C11. C01 et C03 tiennent chacun en une ligne de règle, à tester en refus et en accès autorisé avant tout déploiement des règles.

## Correctifs appliqués (15/10, non commités, non déployés)

Les 18 constats (A01–A08, C01–C11) sont corrigés dans le code. Les scripts `tests/audit/` vérifient désormais le comportement **corrigé**.

| Nº | Correctif | Où |
|---|---|---|
| A01 | Intent rejoué reconnu à l'identifiant de la notification (gardé sur le téléphone), plus à son âge | `usePushTapNavigation.ts` |
| A02 | Absences **et** retards lus (deux écoutes, même index) ; les retards ne comptent plus en « non justifiées » | `absencesService.ts`, `useParentAbsences.ts`, `ParentAbsencesScreen.tsx` |
| A03 | Taux de présence en temps réel (absents du jour) ; erreur = « — », plus 100 % | `absencesService.ts`, `useTeacherData.ts`, `TeacherDashboardScreen.tsx` |
| A04 | `isPast` recalculé à chaque rendu | `useParentDevoirs.ts` |
| A05 | `directory/staff` lisible avec le droit `rendezvous` | `firestore.rules` |
| A06 | `viewedBy` réservé au public de la ressource | `firestore.rules` |
| A07 | Écriture directe d'un appel par un professeur (site) : statut connu, auteur = soi, J-7…aujourd'hui, jour non annulé, aucune justification ; date/séance/justification gelées à l'update | `firestore.rules` |
| A08 | « Réessayer » recrée l'écoute du profil | `AuthContext.tsx` |
| C01 | `parentUid` interdit à la création par un professeur | `firestore.rules` |
| C02 | Déclaration approuvée après l'appel → absences justifiées (trigger) | `attendanceSubmission.js`, `index.js` |
| C03 | Déclaration : classe réelle de l'élève, date `AAAA-MM-JJ`, motif ≤ 500, champs fermés | `firestore.rules` |
| C04 | Entrées annulées exclues du dossier élève | `index.js` (`getStatsStudentFile`) |
| C05 | Suivi : professeur limité aux élèves de ses classes, entrée non déplaçable | `firestore.rules` |
| C06 | `notes-imports/` : enseignants et administration seulement | `storage.rules` |
| C07 | Affiches : image ou PDF, < 10 Mo | `storage.rules` |
| C08 | Suppression autorisée au propriétaire/admin ; triggers `onRessourceDeleted` / `onDevoirDeleted` effacent les fichiers orphelins (un fichier partagé par une autre classe est gardé) | `storage.rules`, `attachmentCleanup.js`, `index.js` |
| C09 | Texte limité à `text/plain` et `text/csv` | `storage.rules` |
| C10 | Lien en attente borné comme `addLink` | `TeacherRessourcesScreen.tsx` |
| C11 | Chiffres arabes conservés par la recherche (le site était déjà juste) | `ressourceLinks.ts` |

Vérifications : `npm run typecheck` OK ; `npm test` 288/288 ; `npm run test:emulator` 18/18 fichiers (dont 731 contrôles de règles et les nouveaux tests Storage) ; scripts `tests/audit/` OK ; export Hermes Android + iOS OK.

À déployer, avec accord à chaque étape : règles Firestore + Storage (depuis ce dépôt, puis `npm run verify:rules`) ; fonctions **par nom** `onAbsenceRequestWritten`, `getStatsStudentFile`, `onRessourceDeleted`, `onDevoirDeleted` (nouvelles) ; OTA sur 1.0.18/1.0.17/1.0.16. Le site n'a pas besoin de changer. Mais une fois les règles déployées, un professeur ne peut plus y saisir un appel de plus de 7 jours, ni un appel daté d'un jour « cours annulés ».
