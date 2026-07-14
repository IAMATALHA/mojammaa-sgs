# Mojammaa SGS — Modèle de données Firestore

Source de vérité pour la structure de la base.
**À mettre à jour à chaque nouvelle collection ou champ.**

---

## Conventions

| Convention | Règle |
|---|---|
| Casse des collections | `lowercase` ou `camelCase`. Pas de pluriel/singulier mixte. |
| Casse des champs | `camelCase` (ex: `parentUid`, `createdAt`) |
| IDs | Soit auto-générés, soit clé naturelle (`codeMassar` pour `eleves`, `uid` pour `users`/`schedules`) |
| Dates | ISO string `YYYY-MM-DD` pour les dates seules, `Timestamp` Firestore pour les datetime |
| Liaisons | Toujours par UID (jamais par nom) |
| Soft delete | Champ `deletedAt?: Timestamp` plutôt que vraie suppression sur les docs sensibles |

---

## Collections

### `users` — comptes (parents, profs, admin, chauffeurs)

Document ID = `uid` Firebase Auth.

| Champ | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Égal à l'ID du doc |
| `email` | string | ✅ | Email Firebase Auth |
| `role` | `'parent' \| 'professeur' \| 'admin' \| 'chauffeur'` | ✅ | Espace principal ; un parent-chauffeur conserve `parent` |
| `nom` | string | ✅ | Nom de famille |
| `prenom` | string | ✅ | Prénom |
| `classes` | `string[]` | optionnel | Pour profs : classes enseignées (ex: `['1APIC-3','1APIC-4']`) |
| `classe` | string | legacy | Ancien champ singulier — conserver pour rétrocompat |
| `matiere` | string | optionnel | Pour profs : matière principale (ex: `'Mathématiques'`) |
| `children` | `string[]` | optionnel | Pour parents : codes MASSAR des enfants (denormalisé) |
| `telephone` | string | optionnel | Numéro de contact |
| `expoPushToken` | string | optionnel | Pour notifications push |
| `expoPushTokenUpdatedAt` | Timestamp | optionnel | Mise à jour token |
| `createdAt` | Timestamp | optionnel | À l'inscription |
| `updatedAt` | Timestamp | optionnel | Au profil edit |

**Relations** :
- `users.children[]` → `eleves.codeMassar` (parent → enfants, denormalisé)
- `users.classes[]` → utilisé pour filtrer `eleves.classe`

**Sécurité** :
- Read : self only (sauf admin = tous)
- Write : self pour `nom`/`prenom`/`telephone`/`expoPushToken`. **Pas pour `role`** (super-admin seulement).

---

### `eleves` — fiches élèves

Document ID = `codeMassar` (ex: `A171010188`).

| Champ | Type | Required | Description |
|---|---|---|---|
| `codeMassar` | string | ✅ | Égal à l'ID du doc |
| `nom` | string | ✅ | Nom famille (arabe) |
| `prenom` | string | ✅ | Prénom (arabe) |
| `nomLatin` | string | optionnel | Translittération latine |
| `prenomLatin` | string | optionnel | Translittération latine |
| `nomComplet` | string | optionnel | Nom complet MASSAR original |
| `classe` | string | ✅ | Classe actuelle (ex: `1APIC-3`) |
| `classes` | `string[]` | optionnel | Si l'élève est dans plusieurs classes |
| `niveau` | string | optionnel | Niveau (ex: `1APIC`) |
| `dateNaissance` | string ISO | optionnel | `YYYY-MM-DD` |
| `parentUid` | string | optionnel | UID du parent dans `users` |
| `updatedAt` | Timestamp | optionnel | Dernière modif |

**Relations** :
- `eleves.parentUid` → `users.uid` (l'unique parent référent)
- `eleves.classe` → matché contre `users.classes[]` pour identifier les profs

**Indexes nécessaires** :
- `parentUid ASC` (pour `subscribeChildrenOfParent`)
- `classe ASC` (pour lister par classe)
- `(classe ASC, nom ASC)` (pour la liste triée par classe + nom)

**Sécurité** :
- Read : parent (where `parentUid == request.auth.uid`), prof (where `classe in user.classes`), admin
- Write : admin seulement

---

### `pickupRequests` — file de sortie Smart Pickup

Document ID = `${serviceDate}_${eleveId}` pour garantir une seule demande par élève et par jour.

| Champ | Type | Required | Description |
|---|---|---|---|
| `parentUid` | string | ✅ | Parent ayant annoncé l'arrivée |
| `eleveId` | string | ✅ | ID MASSAR, égal à l'élève réellement lié au parent |
| `serviceDate` | string ISO | ✅ | Journée de sortie |
| `status` | `waiting \| called \| ready \| completed \| cancelled` | ✅ | État de remise |
| `vehicleDescription` | string ≤ 80 | optionnel | Repère visuel minimal, sans téléphone/position |
| `queueNumber` | number | optionnel | Numéro attribué par l'administration |
| `zone` | string | optionnel | Zone de remise |
| `managedByUid` | string | optionnel | Admin ayant traité l'étape |
| `arrivedAt`, `calledAt`, `readyAt`, `completedAt`, `cancelledAt`, `updatedAt` | Timestamp | selon état | Traçabilité |

**Sécurité** : le parent crée/lit sa demande uniquement pour son propre enfant et ne peut qu'annuler l'état `waiting`. L'admin lit la file du jour et fait avancer les états. Aucun chauffeur n'accède à cette collection.

---

### `pickupSessions` — fenêtre d'ouverture Smart Pickup

Document déterministe `pickupSessions/{YYYY-MM-DD}` avec `isOpen`, `opensAt`, `closesAt`, `openedByUid` et les champs de fermeture. Seul l'admin ouvre ou ferme une session, pour une durée maximale de 6 heures. Les règles refusent toute création ou ré-annonce parent hors de cette fenêtre, y compris une date future forgée.

---

### `driverProfiles` — capacité chauffeur additive

Document ID = `uid`. Cette collection active l'espace chauffeur sans remplacer le rôle `parent` dans `users`.

| Champ | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Égal à l'ID du doc |
| `active` | boolean | ✅ | Accès opérationnel actif |
| `routeIds` | string[] | optionnel | Circuits autorisés |
| `vehicleId` | string | optionnel | Véhicule habituel |
| `createdAt`, `updatedAt` | Timestamp | optionnel | Audit |

**Sécurité** : lecture par le chauffeur lui-même et l'admin ; écriture admin uniquement. Aucun client ne peut s'auto-promouvoir chauffeur.

---

### `transportTrips` — tournées scolaires

| Champ | Type | Required | Description |
|---|---|---|---|
| `driverUid` | string | ✅ | Chauffeur assigné |
| `serviceDate` | string ISO | ✅ | Date de la tournée |
| `direction` | `to_school \| from_school` | ✅ | Matin ou soir |
| `routeId`, `routeLabel` | string | ✅ | Circuit |
| `vehicleLabel`, `scheduledTime` | string | ✅ | Véhicule et heure |
| `status` | `scheduled \| boarding \| in_transit \| arrived \| completed \| cancelled` | ✅ | État opérationnel ; le retard reste un attribut séparé |
| `stops`, `stopIds` | `TransportStop[]`, `string[]` | ✅ | Arrêts ordonnés et IDs autorisés |
| `etaMinutes`, `delayMinutes`, `delayReason` | number/string | optionnel | Information de retard |
| `boardingAt`, `startedAt`, `arrivedAt`, `completedAt`, `cancelledAt`, `updatedAt` | Timestamp | optionnel | Audit posé uniquement par la callable transactionnelle |

Sous-collection `transportTrips/{tripId}/passengers/{eleveId}` : identité minimale de l'élève, classe, `stopId`/`stopLabel`, état `scheduled | boarded | dropped_off | absent | cancelled`, horodatage de transition correspondant et projection parent-safe `delayMinutes`. Chaque passager doit être affecté à un arrêt déclaré avant le départ. Aucun téléphone, note, absence scolaire ou liste d'UID parents n'est dupliqué.

**Sécurité** : l'admin crée/assigne ; un chauffeur actif ne lit et ne met à jour que sa tournée et ses passagers ; un parent ne lit que le document passager de son propre enfant, jamais le trajet parent ni les autres passagers. Les transitions passent par `updateTransportTripStatus` ; les retards par `reportTransportTripDelay`. Ces callables dérivent l'identité de l'auth et garantissent transactions, révisions monotones, horodatages serveur et invariants passagers.

Provisionnement MVP : `npm run setup:driver -- ...` active la capacité additive ; `npm run setup:transport-trip -- <email> <date> <route> <ids> --stops-file=...` crée une tournée et affecte chaque élève à un arrêt. Le format est illustré dans `scripts/transport-stops.example.json`.

---

### `schedules` — emploi du temps des profs

Document ID = `uid` du prof.

| Champ | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Égal à l'ID du doc |
| `teacherUid` | string | ✅ | Duplique `uid` pour les queries |
| `weeklySlots` | `WeeklySlot[]` | ✅ | Voir sous-type |
| `updatedAt` | Timestamp | optionnel | |

```typescript
WeeklySlot = {
  day:         'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
  startTime:   'HH:MM'
  endTime:     'HH:MM'
  durationMin: number
  classe:      string
  room?:       string
  subject?:    string
}
```

**Sécurité** :
- Read : prof concerné + admin (extension future : parents des enfants de cette classe)
- Write : admin seulement (le prof ne touche pas son EDT lui-même)

---

### `evenements` — événements école

Document ID auto-généré.

| Champ | Type | Required | Description |
|---|---|---|---|
| `titre` | string | ✅ | Titre événement |
| `description` | string | optionnel | Détails |
| `dateDebut` | Timestamp | ✅ | Début |
| `dateFin` | Timestamp | optionnel | Fin (si event multi-jours) |
| `type` | `'meeting' \| 'exam' \| 'event' \| 'holiday'` | ✅ | Catégorie |
| `audience` | `'all' \| 'parents' \| 'teachers' \| 'class:<classe>'` | optionnel | Cible |
| `location` | string | optionnel | Lieu |
| `createdBy` | string | optionnel | UID auteur |
| `createdAt` | Timestamp | ✅ | |

**Sécurité** :
- Read : tous les rôles authentifiés (filter par audience côté client)
- Write : admin (et prof pour ses classes — extension)

---

### `messages` — annonces / communications

Document ID auto-généré.

| Champ | Type | Required | Description |
|---|---|---|---|
| `subject` | string | ✅ | Sujet |
| `body` | string | ✅ | Corps message |
| `subjectAr` | string | optionnel | Version arabe |
| `bodyAr` | string | optionnel | Version arabe |
| `fromId` | string | ✅ | UID expéditeur |
| `fromNom` | string | optionnel | Nom expéditeur (denormalisé pour affichage rapide) |
| `toType` | `'all' \| 'role:parent' \| 'role:professeur' \| 'class' \| 'user'` | ✅ | Type de destinataire |
| `toIds` | `string[]` | optionnel | UIDs/classes ciblés selon `toType` |
| `urgent` | boolean | optionnel | Marquer urgent |
| `templateId` | string | optionnel | Si généré depuis un template |
| `templateVariables` | object | optionnel | Variables substitution |
| `createdAt` | Timestamp | ✅ | |
| `academicYear` | string | ✅ | Année scolaire, ex. `2025-2026` |
| `semestre` | `'S1' \| 'S2'` | ✅ | Semestre scolaire de création |
| `monthKey` | string | ✅ | Mois actif, ex. `2026-07` |
| `readBy` | `string[]` | optionnel | UIDs ayant lu |

**Indexes nécessaires** :
- `(toType ASC, createdAt DESC)` pour inbox
- `(fromId ASC, createdAt DESC)` pour outbox

**Sécurité** :
- Read : expéditeur, destinataires (selon toType), admin
- Write : tout user authentifié (création) ; admin pour broadcast all

---

### `notes` — notes individuelles élèves

Document ID auto-généré.

| Champ | Type | Required | Description |
|---|---|---|---|
| `eleveId` | string | ✅ | `codeMassar` |
| `eleveNom` | string | optionnel | Denormalisé pour affichage |
| `elevePrenom` | string | optionnel | Denormalisé |
| `classe` | string | ✅ | Classe à la date de la note |
| `matiere` | string | ✅ | Sujet (ex: `math`) |
| `matiereLabel` | string | optionnel | Label affichage (ex: `Mathématiques`) |
| `academicYear` | string | ✅ | Année scolaire, ex. `2025-2026` |
| `semestre` | `'S1' \| 'S2'` | ✅ | Semestre |
| `note` | number | ✅ | Note 0-20 (ou moyenne des `controles`) |
| `coef` | number | optionnel | Coefficient |
| `professorId` | string | ✅ | UID du prof qui a saisi |
| `commentaire` | string | optionnel | Annotation |
| `createdAt` | Timestamp | ✅ | |

**Indexes nécessaires** :
- `(eleveId ASC, academicYear ASC, semestre ASC)` pour bulletin
- `(classe ASC, academicYear ASC, semestre ASC, matiere ASC)` pour stats classe

**Sécurité** :
- Read : prof concerné, parent de l'élève (where `eleveId == eleve.codeMassar AND eleve.parentUid == request.auth.uid`), admin
- Write : prof concerné, admin

---

## Collections à créer (pour les features prof manquantes)

### `attendances` — présences par séance

Document ID = `{classe}_{date}_{startTime}` (ex: `1APIC-3_2026-05-25_08-30`).

| Champ | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Égal à l'ID du doc |
| `classe` | string | ✅ | |
| `date` | string ISO | ✅ | `YYYY-MM-DD` |
| `startTime` | string | ✅ | `HH:MM` du créneau |
| `endTime` | string | optionnel | |
| `subject` | string | optionnel | Matière du créneau |
| `teacherUid` | string | ✅ | Prof qui a saisi |
| `absents` | `string[]` | optionnel | codeMassar des absents |
| `retards` | `string[]` | optionnel | codeMassar des retardataires |
| `justifies` | `{ codeMassar: string; reason: string }[]` | optionnel | |
| `createdAt` | Timestamp | ✅ | |
| `updatedAt` | Timestamp | optionnel | |

**Indexes** :
- `(date ASC, classe ASC)` pour le journal d'une journée
- `(classe ASC, date DESC)` pour historique d'une classe

**Sécurité** :
- Read : prof de la classe, parent (sur ses enfants only), admin
- Write : prof de la classe, admin

---

### `homeworks` — devoirs assignés

Document ID auto-généré.

| Champ | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | |
| `classe` | string | ✅ | Classe ciblée |
| `subject` | string | ✅ | Matière |
| `title` | string | ✅ | Intitulé |
| `body` | string | optionnel | Description détaillée |
| `dueDate` | Timestamp | ✅ | Date de rendu |
| `teacherUid` | string | ✅ | |
| `attachments` | `Attachment[]` | optionnel | Upload Firebase Storage |
| `createdAt` | Timestamp | ✅ | |
| `updatedAt` | Timestamp | optionnel | |

**Indexes** :
- `(classe ASC, dueDate ASC)` pour "devoirs à venir d'une classe"
- `(teacherUid ASC, createdAt DESC)` pour "mes devoirs"

**Sécurité** :
- Read : prof concerné, parent (où enfant.classe == homework.classe), admin
- Write : prof concerné, admin

---

### `homeworkSubmissions` — statut rendu par élève

Document ID = `{homeworkId}_{codeMassar}`.

| Champ | Type | Required |
|---|---|---|
| `homeworkId` | string | ✅ |
| `eleveCodeMassar` | string | ✅ |
| `status` | `'pending' \| 'submitted' \| 'graded'` | ✅ |
| `submittedAt` | Timestamp | optionnel |
| `grade` | number | optionnel |
| `comment` | string | optionnel |

**Sécurité** :
- Read : prof concerné, parent de l'élève, admin
- Write : prof concerné, admin

---

### `bulletins` — bulletins trimestriels (agrégat de `notes`)

Document ID = `{codeMassar}_{annee}_{trimestre}` (ex: `A171010188_2025-2026_2`).

| Champ | Type | Required |
|---|---|---|
| `eleveCodeMassar` | string | ✅ |
| `annee` | string | ✅ |
| `trimestre` | `1 \| 2 \| 3` | ✅ |
| `generalAvg` | number | ✅ |
| `rank` | string | optionnel |
| `honor` | `'felicitations' \| 'encouragements' \| 'avertissement'` | optionnel |
| `subjects` | `SubjectGrade[]` | ✅ |
| `publishedAt` | Timestamp | optionnel | Mise à dispo aux parents |

**Sécurité** :
- Read : parent (de cet élève), admin. Pas le prof (sauf admin) — c'est calculé.
- Write : admin seulement (script de génération)

---

## Vue d'ensemble des relations

```
users (rôle principal) ── uid ──► eleves.parentUid
          │                          │
          │ professeur/chauffeur    ├──► notes / absences / comportements
          │ reste inchangé          ├──► pickup / transport
          │                          └──► guardianAccess/{uid}
          │                                     │ classes exactes
          ▼                                     ▼
 schedules/{uid}                         devoirs / ressources
```

### `guardianAccess` — capacité parent additive matérialisée

Document ID = UID du responsable. Ce document est calculé exclusivement par
la Cloud Function `onEleveGuardianAccessWritten` à partir des liens vivants
`eleves.parentUid`; aucun client ne peut l'écrire.

| Champ | Type | Required | Description |
|---|---|---|---|
| `uid` | string | ✅ | Identique à l'ID du document |
| `childIds` | string[] | ✅ | IDs Firestore des enfants liés |
| `classes` | string[] | ✅ | Classes distinctes de ces enfants |
| `updatedAt` | Timestamp | ✅ | Horodatage serveur |

Le document est supprimé lorsque le dernier enfant est délié. Il permet aux
règles de prouver les accès non nominatifs de classe (`devoirs`, `ressources`)
sans transformer le rôle principal en `parent`. Backfill :
`npm run guardian-access:backfill`.

---

## Migration nécessaire (état actuel → cible)

| À faire | Comment |
|---|---|
| Créer collection `attendances` | Au 1er enregistrement de présence par le prof |
| Créer collection `homeworks` | Au 1er devoir créé par le prof |
| Créer collection `bulletins` | Quand un script de génération de bulletin sera écrit |
| Ajouter `users.matiere` aux profs existants | Script ponctuel : `node scripts/setMatiere.js <uid> "Mathématiques"` |
| Ajouter `parentUid` aux 60 élèves | Au fur et à mesure que les parents sont créés via `setupParent.js` |
| Matérialiser les capacités parent existantes | `npm run guardian-access:backfill` avant le déploiement des règles multi-espace |

---

## Indexes à déclarer dans `firestore.indexes.json`

```json
[
  { "collectionGroup": "eleves",       "fields": [{"fieldPath":"parentUid","order":"ASCENDING"}] },
  { "collectionGroup": "eleves",       "fields": [{"fieldPath":"classe","order":"ASCENDING"},{"fieldPath":"nom","order":"ASCENDING"}] },
  { "collectionGroup": "attendances",  "fields": [{"fieldPath":"date","order":"ASCENDING"},{"fieldPath":"classe","order":"ASCENDING"}] },
  { "collectionGroup": "attendances",  "fields": [{"fieldPath":"classe","order":"ASCENDING"},{"fieldPath":"date","order":"DESCENDING"}] },
  { "collectionGroup": "homeworks",    "fields": [{"fieldPath":"classe","order":"ASCENDING"},{"fieldPath":"dueDate","order":"ASCENDING"}] },
  { "collectionGroup": "homeworks",    "fields": [{"fieldPath":"teacherUid","order":"ASCENDING"},{"fieldPath":"createdAt","order":"DESCENDING"}] },
  { "collectionGroup": "notes",        "fields": [{"fieldPath":"eleveId","order":"ASCENDING"},{"fieldPath":"trimestre","order":"ASCENDING"},{"fieldPath":"matiere","order":"ASCENDING"}] },
  { "collectionGroup": "messages",     "fields": [{"fieldPath":"toType","order":"ASCENDING"},{"fieldPath":"createdAt","order":"DESCENDING"}] }
]
```

---

## Règles de validation (à appliquer dans security rules + scripts)

| Collection | Règle |
|---|---|
| `users` | `role` ∈ {'parent','professeur','admin','chauffeur'} ; `email` non vide |
| `eleves` | `codeMassar` matche `/^A\d{6,}$/` ; `classe` non vide |
| `pickupRequests` | enfant lié au parent ; `vehicleDescription` ≤ 80 ; transitions d'état bornées |
| `driverProfiles` | ID = `uid` ; écriture admin uniquement |
| `guardianAccess` | ID = `uid` ; lecture propre uniquement ; écriture client interdite |
| `transportTrips` | chauffeur actif/assigné ; champs d'identité immuables pendant les updates opérationnels |
| `notes` | `valeur` ∈ [0, 20] ; `trimestre` ∈ {1,2,3} |
| `attendances` | `date` au format ISO ; `absents` ne contient pas de codeMassar dupliqué |
| `homeworks` | `dueDate` > `createdAt` ; `title` non vide |

---

*Dernière maj : 2026-07-14*
