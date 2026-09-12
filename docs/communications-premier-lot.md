# Communications — premier lot

Implémenté localement le 5 septembre 2026. Aucune règle, fonction ou mise à jour
mobile n’a été publiée pendant cette intervention.

## Comportement

- Les nouvelles demandes parent utilisent `toType: administration`, `toIds: []`.
  Tous les administrateurs les reçoivent dans leur boîte de réception et peuvent
  répondre depuis le détail. Une réponse parent directe vise un seul utilisateur
  dont le rôle administrateur est vérifié dans les règles.
- Les envois parent → professeur sont refusés par Firestore. Les messages
  professeur → parent restent disponibles. L’écran parent ne propose plus de
  destinataire professeur ni de réponse directe à ses messages.
- Le téléphone du professeur écrit uniquement l’appel ou le comportement.
  Les fonctions serveur produisent les messages automatiques. Les écritures
  client de messages `attendance` / `behavior` sont désormais refusées.
- Chaque transition d’absence est rapprochée de l’état courant dans une
  transaction. Réenregistrer le même état ne crée pas de nouvel avis. Le passage
  absent → présent/retard produit une rectification. Les anciens avis remplacés
  sont signalés comme tels et leurs tentatives encore en attente sont arrêtées.
- Le mérite dispose d’un identifiant d’opération conservé pendant les nouvelles
  tentatives dans le formulaire. La création et les rejouements du déclencheur
  ne produisent qu’un message pour cet enregistrement.
- L’administration consulte les incidents dans Messages → À traiter (100 maximum)
  et peut relancer les destinataires en échec après correction du compte, du
  téléphone ou des identifiants fournisseur. Les destinataires déjà acceptés par
  Expo ne sont pas renvoyés. Les alertes remplacées ne peuvent pas être relancées.

## Suivi et reprises

`messages.push` contient uniquement les états et compteurs publics. Les tokens,
identifiants de reçus et tentatives résident dans `messageDeliveryJobs`, inaccessible
aux clients, y compris administrateurs. `schoolAlertState` est également privé.
Les clients ne peuvent pas fabriquer ou modifier `push` et `automation`.

Les erreurs temporaires sont réessayées jusqu’à cinq tentatives, avec délai
croissant et verrou de traitement. Le planificateur examine les travaux chaque
minute. Les reçus sont demandés à partir de quinze minutes après acceptation.
Un reçu manquant après vingt-quatre heures produit un incident explicite.

« Acceptée » signifie acceptée par Expo ; « transmise » signifie remise au service
Apple/Google. La lecture dans l’application reste suivie séparément par `readBy`.
Les anciens messages sans suivi affichent « suivi de notification indisponible ».

Limite : Expo ne fournit pas de clé d’idempotence de bout en bout. Une coupure
après acceptation distante mais avant l’enregistrement du ticket peut occasionner
un doublon de push à la reprise. Les messages en base restent dédupliqués.
Une notification déjà acceptée ne peut pas être retirée du téléphone : la
rectification arrive sous forme d’un nouveau message.

## Vérifications effectuées

- `npm run typecheck` : réussi.
- `npm run test:rules` : 285 cas autorisés/refusés réussis sur l’émulateur.
- `npm run test:communications` : 18 scénarios réussis avec transactions Firestore
  réelles sur l’émulateur et API Expo simulée ; aucun push réel.
- Export Hermes iOS et Android réussi avec Expo SDK 54.
- Contrôles de syntaxe Node et `git diff --check` réussis.

L’émulateur installé exige Java 21. Pour cette session seulement, une distribution
Temurin JRE 21 a été extraite dans `/private/tmp/mojammaa-jre21` et utilisée via
les variables d’environnement de la commande. Le Java système n’a pas été modifié.
Il reste à vérifier visuellement sur téléphone et à confirmer une réception réelle
avec des comptes de test après publication coordonnée.

## Publication coordonnée

Ce lot doit être publié pendant une courte période sans saisie d’appel/mérite :
les anciennes applications tentent encore de créer les alertes elles-mêmes et
peuvent afficher une erreur après un enregistrement réussi. Mettre à jour les
applications des professeurs avant de reprendre les saisies.

Publier ensemble les règles et les fonctions concernées, puis la mise à jour
mobile compatible avec le runtime en production :

```sh
firebase deploy --only firestore:rules,functions:onMessageCreated,functions:onAttendanceAlertWritten,functions:onBehaviorAlertCreated,functions:retryMessageDeliveries,functions:retryMessageDelivery
```

Conserver `onAbsenceCreated` (périodes scolaires) et `checkPushReceipts` (reçus
historiques). Ne pas rejouer les anciennes collections pour initialiser ce lot.
Vérifier les mêmes cas avec des comptes de test : demande administration,
refus parent → professeur, absence, réenregistrement, rectification, mérite,
réception mobile et lecture. Le dépôt contient d’autres modifications antérieures :
préparer le contenu exact de la publication sans les inclure involontairement.
