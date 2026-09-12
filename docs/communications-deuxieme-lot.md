# Communications — deuxième lot

Implémenté et vérifié localement le 5 septembre 2026. Aucun déploiement Firebase
ou EAS, aucune donnée réelle modifiée, aucun push réel envoyé.

## Notifications sur plusieurs appareils

- Chaque installation possède un identifiant local stable. Un compte peut
  recevoir ses notifications sur plusieurs téléphones, chacun avec sa langue.
- Les réglages parent, professeur et administration indiquent la permission
  système et le dernier enregistrement confirmé du téléphone. Ils permettent
  de réessayer l’enregistrement et d’ouvrir les réglages système.
- Les alertes automatiques d’absence, rectification et mérite sont disponibles
  en français, arabe et anglais. Un message rédigé par l’école conserve sa langue
  d’origine lorsqu’aucune traduction n’a été fournie.
- La rotation du token et le retour au premier plan actualisent l’enregistrement.
  La recherche du token et les appels réseau ont un délai limite.
- La déconnexion désactive uniquement l’installation concernée. Elle nécessite
  une confirmation serveur ; en cas de coupure, un message demande de réessayer.
  Une révision persistante empêche une ancienne activation, même arrivée tard
  au serveur, d’annuler une déconnexion plus récente.
- Les destinataires des envois en attente sont revérifiés avant l’appel à Expo.
  Une installation passée à un autre compte ne reçoit plus les messages du
  compte précédent. Un token expiré ne désactive pas les autres téléphones.
- Le suivi distingue les appareils des personnes : deux téléphones notifiés
  pour un parent comptent comme un destinataire. La relance administrative
  préserve les appareils déjà acceptés et les reçus incertains, même après
  rotation de token.
- Le registre commun est également utilisé par les notifications de sortie
  scolaire et de transport, afin de maintenir ces notifications sur les nouveaux
  appareils.

Les collections privées `pushDevices` et `pushTokenOwners` contiennent les
installations et l’appartenance des tokens. Le champ historique
`users.expoPushToken` reste un secours pour les anciennes installations ; il ne
peut pas réactiver un token désactivé ou transféré par le nouveau registre.
Les tokens restent hors des messages et des compteurs publics.

## Appel hors connexion

1. Une première ouverture en ligne charge la liste de la séance et les versions
   actuelles des présences. Cette liste est conservée sur le téléphone.
2. Chaque choix enregistre un brouillon local. Le professeur doit appuyer sur
   **Sauvegarder** pour valider l’appel et autoriser son envoi.
3. Une validation sans réseau reste dans une file persistante. L’application
   réessaie au premier plan, puis toutes les vingt secondes tant qu’elle est
   active. Fermer l’application conserve la file ; la rouvrir reprend l’envoi.
4. L’accueil professeur présente les brouillons, appels en attente et appels
   nécessitant une vérification, avec leur date et leur séance d’origine.
5. Le serveur vérifie le rôle actuel, l’affectation, le créneau exact, la date,
   l’heure de début et la liste actuelle des élèves actifs. Il refuse les séances
   futures et les appels vieux de plus de sept jours.
6. L’appel entier est enregistré dans une transaction. Un identifiant stable
   rend une reprise après coupure idempotente. Une version devenue obsolète ou
   un changement d’effectif bloque toute l’opération : aucune correction récente
   n’est écrasée et aucun nouvel élève n’est marqué présent implicitement.
7. En cas de conflit, le professeur peut recharger la version serveur pour
   reprendre la saisie, ou supprimer le brouillon après confirmation. Un appel
   en cours de synchronisation ne peut pas être supprimé localement.

Les déclarations parent acceptées sont rapprochées de l’appel dans la même
transaction. Les avis aux parents sont déclenchés après réception par le serveur,
via le mécanisme du premier lot.

`attendanceOperations` conserve les empreintes et versions des opérations
terminées ; les clients ne peuvent pas lire ni modifier cette collection.
Les brouillons AsyncStorage sont séparés par UID. Un profil professeur minimal,
vérifié en ligne depuis moins de sept jours, permet de retrouver les brouillons
après un redémarrage hors connexion. Il n’accorde aucun droit serveur.
Les anciens caches synchronisés expirent ; le travail non envoyé n’est pas
supprimé automatiquement. Désinstaller l’application ou effacer ses données
supprime les brouillons locaux.

## Preuves de vérification

- `npm run typecheck` : réussi.
- `npm run test:rules` : **291** cas autorisés/refusés, aucun échec.
- `npm run test:communications` : **41** scénarios serveur, dont les régressions
  du premier lot, appareils multiples, transfert de compte, activation tardive,
  reçus incertains, autorisations et conflits d’appel.
- `npm run test:offline-attendance` : **12** scénarios de stockage et de reprise.
- `npm run test:notification-devices` : **8** scénarios du service mobile.
- Contrôles Node, test de créneaux existant et `git diff --check` : réussis.
- Exports Hermes iOS et Android avec Expo SDK 54 : réussis, dans
  `/private/tmp/mojammaa-deuxieme-lot-verified`.

Les tests serveur utilisent l’émulateur Firestore et une API Expo simulée.
Les tests mobiles simulent les permissions et le stockage. Ils ne remplacent
pas une vérification visuelle et une réception réelle sur iOS/Android.

## Publication à préparer

Ce lot dépend du premier lot. Déployer les fonctions avant la mise à jour mobile,
car l’enregistrement des appareils, la déconnexion et l’appel utilisent désormais
des fonctions appelables. Conserver la publication coordonnée et la mise à jour
des applications professeur décrites dans `communications-premier-lot.md`.

Fonctions nouvelles : `registerPushDevice`, `loadAttendance`, `submitAttendance`.
Fonctions à republier : `onMessageCreated`, `retryMessageDeliveries`,
`retryMessageDelivery`, `onAttendanceAlertWritten`, `onBehaviorAlertCreated`,
`onPickupRequestWritten`, `onTransportPassengerWritten`, `onTransportTripWritten`.
Conserver les règles du premier lot : leurs refus par défaut protègent les
nouvelles collections privées.

Après publication, vérifier sur deux téléphones de test : langues différentes,
déconnexion d’un seul téléphone, changement de compte, appel en mode avion,
fermeture/réouverture, retour réseau, puis conflit créé par une correction sur
un autre appareil. La réception réelle du push et la lecture dans l’application
doivent être vérifiées séparément.

Les limites de remise Expo décrites dans le premier lot demeurent : une remise
Apple/Google n’est pas une preuve de lecture ; un push déjà accepté ne peut pas
être retiré. Les autres modifications préexistantes du dépôt doivent être
examinées séparément avant toute publication.
