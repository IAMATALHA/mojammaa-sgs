# Audit indépendant des modifications du 11 octobre 2026

**Verdict : les cinq défauts de la 1.0.18 sont corrigés dans les sources du build 51. Les ajouts du site fonctionnent dans les parcours ordinaires et leurs contrôles d’accès passent, mais deux défauts P2 restent à corriger.** Les deux ont été reproduits avec des données fictives. Aucune suppression ni activation sur les comptes de l’établissement.

Périmètre : `docs/modifications-2026-10-11.md`, application `66bc9ac`, site et fonctions `246a2dd` (diff depuis `50b582c`), avec relecture du plugin Android, des corrections F1–F5, des formulaires/mots de passe, des messages WhatsApp, du script de réparation et des suppressions/détachements. Le tag `v1.0.18-51` pointe sur `0436916` ; les changements suivants concernent uniquement le script de réparation, ses tests et les documents. Le code mobile audité est donc celui de ce tag.

## Défauts confirmés

### A1 — P2 — Une confirmation périmée peut détacher un autre parent

Sources : `mojammaa-admin/src/pages/ParentInvitations.tsx:30`, `functions/src/index.ts:625`, `functions/src/accountRemoval.ts:80`.

La fenêtre conserve l’élève et le parent sélectionnés à son ouverture, mais l’appel ne transmet que `studentId`. Le serveur retire ensuite le parent présent au moment de l’exécution, sans vérifier qu’il correspond à celui annoncé dans la confirmation.

Reproduction dans Chrome, avec la vraie page et les fonctions sur émulateurs :

1. Ouvrir « Détacher » pour l’élève fictif E2, lié au compte A. La fenêtre annonce A.
2. Pendant que la fenêtre reste ouverte, faire changer le rattachement vers le compte B, comme lors d’une correction concurrente par un autre opérateur.
3. La fenêtre annonce toujours A. Confirmer.
4. **B est détaché**, et E2 est également retiré de sa liste `children`.

Ce n’est pas un contournement des droits superadmin : c’est une action destructive appliquée à un lien différent de celui confirmé. Correction attendue : transmettre le `parentUid` attendu et le comparer dans la transaction ; en cas de changement, refuser et demander une nouvelle confirmation. Actualiser l’affichage seul ne supprime pas la course entre confirmation et écriture.

### A2 — P2 — L’étiquette « lié à un compte supprimé » peut manquer après le cache

Sources : `mojammaa-admin/src/data/schoolData.ts:32` et `src/pages/ParentInvitations.tsx:75`.

`liveQuery` transmet maintenant `snapshot.metadata.fromCache`, mais son écoute n’active pas `includeMetadataChanges`. Si les données sont déjà en cache et restent identiques sur le serveur, l’accusé de confirmation peut être un événement de métadonnées seul, que cette écoute ne reçoit pas. `usersLive.fromServer` reste alors absent ; `accountsKnown` reste faux et le compte manquant n’est pas reconnu comme supprimé.

Reproduction avec le vrai module `schoolData.ts`, le SDK Firebase installé et l’émulateur Firestore : cache rempli → réseau coupé → abonnement → retour du réseau, sans modification des comptes. Une écoute témoin avec `includeMetadataChanges: true` reçoit la confirmation serveur ; l’écoute du projet reste sans `fromServer`. Le bouton de détachement reste disponible au superadmin, mais le diagnostic affiché est faux (« déjà lié ») et peut rester ainsi jusqu’à une modification de données.

Correction attendue : recevoir les changements de métadonnées et couvrir ce parcours cache → serveur par un test d’intégration. Ce comportement par défaut des écouteurs est également décrit dans la [documentation Firebase](https://firebase.google.com/docs/firestore/query-data/listen#events_for_metadata_changes).

## Vérifications exécutées

| Contrôle | Résultat de cette passe |
|---|---|
| Application : TypeScript | Réussi |
| Application : suite Node, dont réparation des liens orphelins | 249/249 |
| Application : vrais composants React, navigation et écran racine | 21/21 ; scénarios F1–F5 et déconnexion relus |
| Site : tests | 150/150 |
| Site : TypeScript application/outillage et build Vite | Réussis dans une copie isolée |
| Fonctions : compilation et tests unitaires | 74/74 |
| Suppression/détachement : Auth + Firestore sur émulateurs | 9/9 |
| Chrome : suppression, détachement, refus administrateur simple | 3/3 |
| Contrôle supplémentaire : appels parent et sans session aux deux fonctions | Refusés ; comptes et liens fictifs inchangés |
| Reproduction A1 dans Chrome | Confirmée |
| Reproduction A2 avec le SDK Firebase | Confirmée |
| Site public : HTML `/reset-password` et 7 bundles/fichiers concernés | Octets identiques au build isolé audité |
| Fonctions en ligne, appels sans session | Les deux répondent `UNAUTHENTICATED` |

Les tests supplémentaires de reproduction **attendent le défaut** : leur réussite confirme A1/A2 et ne signifie pas que ces deux problèmes sont corrigés. Aucun correctif applicatif n’a été fait pendant cet audit.

La suppression ordinaire retire bien Auth, le profil et les liens enfants ; les coordonnées différentes de celles du compte sont conservées. Les refus sur soi-même, un autre superadmin, une opération verrouillée et la reprise après échec Auth sont couverts. Les tests navigateur vérifient aussi le contrôle serveur, au-delà des boutons masqués. Le script de réparation reste en lecture seule sans `--commit`, conserve une sauvegarde et refuse un profil encore existant ; il n’a pas été exécuté sur la production pendant cette passe.

Limites et détails de reproduction :

- Les pistes Google Play, l’APK 51 et le téléphone n’ont pas été réinterrogés pendant cette passe. Les tests A à J sur le téléphone et la recette Android native sont ceux rapportés par Claude/Youssef ; ils ne sont pas présentés comme de nouveaux essais de Codex. L’examen du tag et les tests JavaScript confirment les corrections dans les sources.
- Les règles Firestore/Storage sont inchangées dans ce lot ; leurs 434 contrôles de l’audit précédent n’ont pas été répétés. Les émulateurs web de cette passe vérifient les fonctions et leur autorisation, pas les règles déployées ni les déclencheurs mobiles dérivés.
- Pas de suppression/détachement ni d’activation complète avec une vraie famille. Les appels de production de cette passe sont limités à la lecture de fichiers publics et aux deux refus sans session.
- Première tentative du build isolé : cache TypeScript pointant via un lien symbolique vers le dépôt non inscriptible. Vérification terminée en plaçant les caches dans `/private/tmp`. Première tentative navigateur : révision Chromium demandée absente ; reprise réussie avec Chrome installé. Ce sont des contraintes locales, pas des défauts livrés.
- `git diff --check` signale seulement une ligne vide supplémentaire à la fin de l’ancien rapport mobile ; aucun défaut fonctionnel associé.
- Le fichier `mojammaa-admin/public/guide-parent/poster-activation.html` avait déjà des modifications locales, ainsi que des fichiers de configuration non suivis ; ils ont été laissés intacts.

Preuves conservées : `output/audit-2026-10-11/accountRemoval.browser.mjs` (recette initiale + contrôles supplémentaires, à exécuter dans `scripts/` d’une copie du site), `output/audit-2026-10-11/cache-confirmation.cjs` (`MOJAMMAA_ADMIN_REPO` doit viser cette copie), les montages mobiles sous `output/audit-1.0.18/`, et les journaux `/private/tmp/mojammaa-final-audit-*.log`. Copie isolée utilisée : `/private/tmp/mojammaa-final-audit-admin.R5d3eU` ; projet d’émulateur exclusivement `demo-mojammaa-final-audit`.

## Image jointe aux liens WhatsApp

La page publique `/reset-password`, interrogée **sans code personnel**, retourne les mêmes métadonnées communes que `mojammaa-admin/index.html`. `og:image` et `twitter:image` pointent actuellement vers `https://mojammaa-admin.vercel.app/og-college-real.jpg`. La photo de la capture vient de ce réglage du site. Le protocole [Open Graph](https://ogp.me/) définit `og:image` comme l’image représentant le lien.

Proposition créée avec le logo fourni, un fond crème et un livre discret : `output/link-preview/og-mojammaa-connect-v1.jpg`, **1200 × 630**, environ **127 Kio**, sans transparence. Source PNG et consigne de génération conservées à côté. Cette proposition n’a pas encore remplacé l’aperçu en ligne ; la demande antérieure « ne code rien » a été respectée. Les anciens messages déjà envoyés ne sont pas une preuve fiable du nouveau rendu : le contrôle après publication devra utiliser un nouvel aperçu de lien.

La pose du visuel demande seulement de copier l’image dans `public/` du site puis de remplacer ses deux URL de métadonnées. Aucun build Android ni déploiement de fonctions Firebase n’est nécessaire pour cette image. La publication du site reste distincte du présent audit.

---

**Suivi des corrections — 11 octobre 2026 (Claude), `mojammaa-admin` commit `6bf9fe3`.**

Les deux défauts sont confirmés et corrigés dans les sources. **Rien n'est republié** : le site et la fonction en ligne sont encore ceux du commit `246a2dd`, donc A1 et A2 existent toujours en production tant que Youssef n'a pas donné son accord.

| Réf. | Correction | Où |
|---|---|---|
| A1 | Le site envoie le compte annoncé (`expectedParentUid`) ; le serveur le compare dans la transaction et refuse (`changed`) s'il a changé. Le champ est obligatoire. La fenêtre se fige dès que le lien change pendant qu'elle est ouverte. | `functions/src/accountRemoval.ts`, `functions/src/index.ts`, `src/pages/ParentInvitations.tsx` |
| A2 | Les listes partagées écoutent les changements de métadonnées (`includeMetadataChanges`) ; un accusé qui ne change rien n'est pas republié aux pages. | `src/data/schoolData.ts`, `src/data/liveCollection.ts` |

Preuves :

| Contrôle | Résultat |
|---|---|
| Fonctions sur émulateurs Auth + Firestore | 34/34, dont « lien changé depuis la confirmation : refusé, le nouveau parent n'est pas détaché » |
| Navigateur sur émulateurs | 4/4 ; le scénario A1 vérifie la fenêtre figée, le refus du serveur avec l'ancien compte (`ABORTED`), le refus sans compte annoncé (`INVALID_ARGUMENT`), puis le détachement correct après réouverture |
| Parcours cache → réseau coupé → réseau rétabli, vrai SDK Firestore sur émulateur | Réussi (`npm run test:school-data-cache`) ; **échoue** quand on retire le correctif |
| Liste partagée, tests unitaires | 19/19 (3 ajoutés) |
| Site : TypeScript, 153 tests, build de production ; fonctions : 74 tests | Réussis |

Ordre de publication prévu : le site d'abord (il envoie le nouveau champ, que l'ancienne fonction ignore), puis `functions:admin:unlinkStudentParent`. L'ordre inverse ferait échouer « Détacher » pendant quelques minutes.

Image d'aperçu des liens : non intégrée, en attente de la décision de Youssef.

