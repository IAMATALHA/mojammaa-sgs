# Audit et corrections — 11 octobre 2026

**Cinq défauts confirmés et corrigés localement.** La passe couvre les changements de `mojammaa-sgs` depuis `8f2b584` jusqu’à `12d3a00`, ainsi que les modifications locales présentes au démarrage. Relecture ciblée des formulaires, liens Android, navigation, écrans d’administration, invitations et réparation des parents orphelins. Les contrats des fonctions du dépôt voisin ont été consultés en lecture seule ; ce rapport n’est pas un nouvel audit complet du site.

Les modifications préexistantes du message parent, de `AGENTS.md` et des documents ont été conservées. Aucun déploiement, message envoyé, accès aux dossiers réels, suppression ou activation de compte de production pendant cette passe.

## Défauts corrigés

| Réf. | Priorité | Cas reproduit | Correction |
|---|---|---|---|
| E1 | P2 | Le script d’orphelin prépare une suppression, puis une autre opération corrige le téléphone, le nom ou l’e-mail parent. La transaction supprimait la nouvelle valeur à partir de l’ancien plan. | Comparaison des champs à retirer dans la transaction ; refus si l’un a changé. Les modifications d’autres champs, comme la classe, restent compatibles. |
| E2 | P2 | Le script pouvait supprimer le compte Auth d’un superadmin sans profil et sans claims. Il ignorait aussi les comptes ou rattachements apparus après le détachement. | Protection par `config/superadmins`, puis nouvelle lecture du profil, des élèves liés, des droits et du compte Auth avant suppression. En cas de changement, conservation du compte et signalement. |
| E3 | P2 | Un second lien parent remonte « Ajouter un enfant » pendant une requête ou une alerte de la première feuille. La réponse ou fermeture précédente pouvait perturber la nouvelle feuille. | Ignorer les réponses et alertes des composants démontés ; rattacher la fermeture au rang du lien concerné. |
| E4 | P2 | Le serveur crée le compte par e-mail après refus du téléphone, puis la connexion automatique échoue. L’app proposait encore le téléphone et ne mémorisait pas le mode utilisable. Au retour, Connexion ne relisait pas les préférences. | Mémoriser le mode accepté avant la connexion, afficher l’identifiant utilisable sans e-mail technique, relire les préférences au retour sur Connexion et préserver les choix saisis entre-temps. Textes FR/AR/EN. |
| E5 | P2 | Les liens WhatsApp utilisaient un numéro incomplet pour les numéros marocains sans zéro initial, les chiffres arabes ou certains préfixes internationaux. | Réutiliser la normalisation des numéros de connexion ; refuser les destinations invalides avant l’ouverture native. Le partage avec choix manuel du destinataire reste disponible. |

Fichiers principaux :

- E1/E2 : `scripts/lib/orphanParent.js`, `scripts/unlinkOrphanParent.js`.
- E3 : `src/components/add-child-sheet.tsx`, `src/hooks/use-activation-link.ts`.
- E4 : `src/screens/auth/ParentActivationScreen.tsx`, `src/screens/auth/LoginScreen.tsx`, `src/i18n/locales/{fr,ar,en}.ts`.
- E5 : `src/utils/admin-access.ts` ; le nouveau texte parent présent avant l’audit est préservé.

Améliorations complémentaires du script : rejet des identifiants multiples, des chemins de documents et des options contradictoires ; sauvegardes créées sans écrasement, avec permissions propriétaire uniquement (dossier `0700`, fichier `0600`).

## Preuves

Les tests utilisent des identités et invitations fictives. Les contrôles unitaires des accès simulent Firestore/Auth ; ils ne sont pas présentés comme des tests de règles sur émulateur.

| Vérification | Résultat |
|---|---|
| Suite Node avant modification | 249/249 |
| TypeScript et suite Node après corrections | Réussis ; 271/271 tests, aucun ignoré |
| Script orphelin | 19/19 ; les mêmes tests contre l’ancienne implémentation échouent sur 7 cas |
| Authentification et reprise | 8/8 ; 6 des 7 premiers scénarios échouaient avant correction |
| Cycle des liens d’activation, tests permanents | 4/4 |
| Composants React réels et routeurs, banc local | 24/24, dont 3 nouveaux scénarios de cycle des liens qui échouaient avant correction |
| Administration et WhatsApp | 26/26 ; les 2 nouveaux tests purs des numéros échouaient avant correction |
| Export JavaScript/Hermes Android et iOS | Réussi sur les sources finales ; deux bundles générés |
| `git diff --check` | Réussi |

Tests permanents ajoutés ou enrichis : `tests/services/authRecovery.test.mjs`, `activationLifecycle.test.mjs`, `adminAccess.test.mjs`, `adminScreens.test.mjs`, `tests/scripts/orphanParent.test.mjs`.

Commandes principales :

```sh
npm run typecheck
npm test
CI=1 EXPO_OFFLINE=1 npx expo export --platform android --platform ios --output-dir /tmp/mojammaa-audit-enhance-export
git diff --check
```

Journaux locaux : `/tmp/mojammaa-audit-tests-final.log`, `/tmp/mojammaa-audit-flows-final.log`, `/tmp/mojammaa-audit-enhance-export.log`, `/tmp/mojammaa-auth-recovery-before.log`, `/tmp/mojammaa-auth-recovery-after.log`, `/tmp/mojammaa-audit-whatsapp-before.log`, `/tmp/mojammaa-audit-whatsapp-after.log`.

## Limites et suite

- **`verification_blocked` — émulateurs Firestore/Storage :** le bac à sable refuse l’écoute sur localhost (`EPERM`). L’exécution avec élévation n’a pas été lancée : le contrôle automatique d’approbation a échoué à cause de la limite d’utilisation. Il n’a pas classé l’action comme dangereuse. Aucun contournement effectué. Rejouer `PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npm run test:emulator` dans un environnement autorisé.
- Auth et Firestore ne partagent pas une transaction. La relecture avant suppression réduit la fenêtre de concurrence, sans garantir l’atomicité entre services ; éviter une réparation pendant une restauration concurrente du même compte, ou utiliser `--keep-login` pour conserver Auth.
- L’export valide les bundles ; il ne remplace pas un build natif ni une recette sur téléphone. Aucun nouveau test visuel, essai iPhone ou parcours Firebase de production pendant cette passe.
- Le site voisin conserve sa propre normalisation WhatsApp. Son alignement et sa publication ne sont pas inclus dans cette modification du dépôt mobile.
- Modifications locales, non commitées et non publiées. La vérification de l’état en ligne reste distincte.

Documentation consultée : [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/), [cycle de `useFocusEffect`](https://reactnavigation.org/docs/use-focus-effect/) et [format des liens WhatsApp](https://faq.whatsapp.com/5913398998672934). La restauration des préférences suit le nettoyage au changement de focus documenté par React Navigation ; WhatsApp exige un numéro international complet.
