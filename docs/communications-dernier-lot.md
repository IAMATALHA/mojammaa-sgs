# Communications — derniers lots (6 à 8)

Implémentation locale du 6 septembre 2026. Complète les premier et deuxième lots.
Aucun déploiement Firebase/EAS, aucune modification de données réelles et aucun
push réel pendant cette intervention.

## Accueils avec actions à traiter

- Parent : devoirs arrivés à échéance sans remise, absences non justifiées de
  l’année scolaire, messages non lus et créneaux à confirmer.
- Professeur : appels incomplets des séances déjà commencées, devoirs remis à
  corriger, messages non lus et prochain rendez-vous confirmé.
- Administration : incidents de notification et rendez-vous à organiser,
  reprogrammer ou clôturer. Les liens ouvrent les écrans concernés ; un appel
  ouvre sa séance et sa date, un incident ouvre l’onglet « À traiter ».
- Les compteurs viennent des données courantes. Un appel partiel reste à faire
  tant que chaque élève actif n’a pas de statut valide. Les jours sans cours
  et les séances futures sont exclus.
- Actualisation au retour sur l’écran, au retour au premier plan et chaque
  minute au premier plan. Les erreurs sont visibles, avec un bouton de reprise
  et l’heure du dernier contrôle réussi.

## Progression des mérites

L’espace parent présente la progression de chaque enfant, les six derniers mois,
la comparaison avec le mois précédent et le total de l’année scolaire. Le journal
professeur propose la progression de l’élève sélectionné. Les filtres couvrent
le mois, l’année scolaire et tout l’historique ; les parents disposent aussi
d’un filtre mérite/avertissement.

Un mérite actif vaut un point. Les avertissements sont comptés séparément, sans
retirer de points. Aucun classement entre enfants ni récompense automatique
n’a été ajouté. Les motifs les plus fréquents complètent le suivi.

Une erreur se corrige par une **annulation motivée** : le professeur peut annuler
ses propres entrées dans ses classes actuelles. Le serveur permet aussi cette
opération à l’administration. L’auteur, la date et le motif restent enregistrés ;
le point annulé sort des totaux, mais reste visible dans l’historique. Une
rectification parent est produite une seule fois si l’avis initial existe. Une
annulation antérieure au premier déclenchement ne crée pas un faux mérite.

Les modifications et suppressions directes de comportements sont désormais
refusées, y compris aux clients administrateurs.

## Rendez-vous organisés par l’administration

1. Le parent choisit son enfant, le sujet, ses disponibilités et éventuellement
   une précision privée à l’administration. Une seule demande ouverte par
   enfant et responsable est admise.
2. L’administration propose un créneau de 15, 30, 45 ou 60 minutes, un lieu et
   un interlocuteur : elle-même ou un professeur actuellement affecté à la classe.
3. Le parent confirme, demande un autre créneau ou annule. Une modification d’un
   rendez-vous confirmé demande une nouvelle confirmation.
4. Le professeur voit les rendez-vous confirmés qui le concernent. Les notes
   privées et disponibilités du parent ne lui sont pas transmises. L’administration
   assure les changements ; aucune messagerie parent → professeur n’est ouverte.
5. L’administration peut refuser avec un motif, annuler ou clôturer après la fin
   du rendez-vous. L’historique reste consultable et paginé.

Les heures utilisent le fuseau `Africa/Casablanca`, y compris pendant le Ramadan.
Les dates impossibles, passées, à plus de 180 jours et les créneaux traversant
minuit sont refusés. Les réservations du parent et de l’interlocuteur sont
atomiques : deux demandes simultanées ne réservent pas le même créneau. Les cours
du professeur sont contrôlés lors de la proposition puis de la confirmation.

Chaque opération possède un identifiant de reprise et une révision : une réponse
réseau perdue ne duplique pas la demande ; une décision ancienne n’écrase pas
une modification récente. Les liens parent/enfant et affectations professeur
sont revérifiés au serveur, même pour une reprise. Les écrans de rendez-vous
nécessitent une connexion ; ils ne constituent pas une file hors connexion.

Les avis passent par la file durable des communications, avec textes FR/AR/EN.
Le push ne contient pas les notes privées ni le nom de l’enfant. Le détail du
message ouvre l’écran des rendez-vous du rôle concerné. Les avis adressés à un
parent ouvrent son espace parent, même pour un compte ayant aussi un rôle salarié.

## Données et publication

Les nouvelles collections `appointments`, `appointmentOperations`,
`appointmentFamilies` et `appointmentBookings` sont privées. Les clients, même
administrateurs, passent par les fonctions appelables ; la vue professeur est
explicitement limitée aux champs nécessaires. Les messages ne peuvent pas
forger le type, l’identifiant ou le routage d’un avis de rendez-vous.

Fonctions nouvelles : `appointmentCommand`, `listAppointments`,
`getDashboardActions`, `cancelComportement`, `onBehaviorAlertWritten`.
Republier aussi `onBehaviorAlertCreated`, `onMessageCreated`,
`retryMessageDeliveries` et `retryMessageDelivery` avec les modules partagés.
Conserver le déclencheur de création existant : les deux déclencheurs de
comportement partagent la même réconciliation idempotente.

Avant une publication cumulée :

1. Examiner les autres modifications préexistantes du dépôt pour préparer le
   contenu exact de la livraison.
2. Déployer les index ajoutés et attendre leur disponibilité.
3. Appliquer la publication coordonnée des règles et fonctions décrite dans
   `communications-premier-lot.md`, avec toutes les fonctions du deuxième lot
   et celles ci-dessus.
4. Publier la version mobile compatible, puis actualiser les téléphones des
   professeurs avant de reprendre les saisies. Les anciens clients qui suppriment
   directement un mérite seront refusés par les nouvelles règles.
5. Vérifier avec des comptes de test les trois rôles, les changements de créneau,
   la confidentialité, les langues, la réception réelle et la lecture des avis.

Les tests locaux ne prouvent ni la disponibilité des index en production ni la
réception réelle sur téléphone. Les limites Expo et la coordination des deux
premiers lots restent applicables.

## Preuves de vérification

- `npm run typecheck` : réussi.
- `npm run test:rules` : **321** cas autorisés/refusés, aucun échec.
- `npm run test:communications` : **65** scénarios serveur, incluant les deux
  premiers lots, la réservation simultanée, les autorisations, la pagination,
  les transferts de responsable, le calendrier marocain et les rectifications.
- Tests mobiles : **12** scénarios de brouillons, **8** d’appareils et **5** de
  progression des mérites, tous réussis. Commandes `test:offline-attendance`,
  `test:notification-devices` et `test:merit-progress`.
- Total : **411 tests réussis**. Firestore émulé, API Expo et services mobiles
  simulés ; aucune donnée d’élève réelle utilisée.
- Un passage serveur avait échoué avec une transaction fermée lors de deux
  demandes simultanées. Les lectures initiales de la transaction rendez-vous
  ont été regroupées avec `tx.getAll`. La suite complète a ensuite réussi,
  y compris la reprise concurrente et la double réservation.
- Syntaxe Node et `git diff --check` : réussis.
- Exports Hermes iOS et Android Expo SDK 54 réussis :
  `/private/tmp/mojammaa-dernier-lot-final`.

La vérification visuelle des nouveaux écrans et la réception des notifications
sur de vrais appareils ne sont pas réalisées. Aucun déploiement n’est inclus
dans ces preuves.
