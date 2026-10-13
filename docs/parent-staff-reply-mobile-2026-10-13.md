# Réponse parent aux messages du personnel — mobile, 13 octobre 2026

## Correctif

Le détail d’un message direct `staff` ne proposait aucune réponse au parent : la barre et le gestionnaire acceptaient uniquement `admin`. Ils utilisent désormais le même routage typé. Les réponses au personnel vont à la boîte commune (`toType: administration`, `toIds: []`), avec le libellé traduit déjà utilisé par le formulaire parent. Les réponses directes aux administrateurs restent inchangées. Les annonces et autres rôles ne deviennent pas répondables.

Aucune modification des règles, fonctions, dépendances ni configuration native. Compatibilité vérifiée avec `v1.0.18-51` pour package.json, package-lock.json, app.json, eas.json et plugins.

## Validation avant publication

- `npm run typecheck` : réussi.
- `npm test` : 280/280 réussis, dont trois tests du routage utilisé par l’écran.
- Émulateur Firestore avec le vrai `sendMessage` : 6/6 réussis. Réponse commune acceptée ; lecture permise au personnel avec `messages.boite`, refusée sans ce droit ; envoi direct au personnel refusé ; enfant d’un autre parent refusé ; réponse à un admin acceptée.
- Premier lancement du nouveau test refusé car le nom du parent fictif manquait dans sa fiche ; fixture corrigée pour respecter la règle anti-usurpation. Aucun changement des règles.
- Toutes les données de test sont fictives et restent dans l’émulateur.

## Publication prévue

OTA Android uniquement, projet EAS `6ff4e5d9-040f-45df-ac65-5cf941ad8627`, compte `youssefatalha`, canal et branche `production`, environnement `production`, runtime `1.0.18`.

Précédent groupe, référence de retour arrière : `98647c4a-7ccb-41de-b3b2-8dec03cca2ff`.

La livraison du manifeste sera vérifiée après publication. La réception et l’envoi sur un téléphone Android physique restent à confirmer ; les tests précédents sur Safari/iPhone valident le site, pas l’application Android.
