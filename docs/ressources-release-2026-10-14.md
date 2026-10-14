# Ressources pédagogiques — publication du 14 octobre 2026

Demande de Youssef : améliorer les ressources des élèves (cours, fichiers, liens) — sur le site et dans l'app.

## Contenu

- **Site** (mojammaa-admin `f60d3d0`, branche `feat/ressources-cours`) : page « Ressources » des professeurs (publier dans plusieurs classes, modifier, supprimer, vues) et de la direction (toutes, sans publier) ; page « Ressources » de l'espace parents (recherche, filtres type et matière) et carte « Nouvelles ressources » sur l'accueil.
- **App** (ce dépôt `a568ceb`, branche `feat/ressources-liens`) : type, chapitre et liens à la publication ; affichage, recherche et filtre par type côté parent et élève.
- Format commun de `ressources` : champs facultatifs `type`, `chapitre`, `links: { url, label }[]`, `updatedAt`. Les documents plus anciens restent lisibles (type « autre »).
- Liens : https uniquement, vers youtube.com, youtu.be, drive.google.com, docs.google.com, geogebra.org, khanacademy.org, wikipedia.org, phet.colorado.edu, alloschool.com, men.gov.ma (et sous-domaines). Liste identique dans `src/utils/ressourceLinks.ts` (app) et `src/utils/ressourceData.ts` (site), vérifiée à l'écriture, à la lecture et à l'ouverture.
- **Aucune règle Firestore ni Storage modifiée.** Le bloc `ressources` des règles live a été comparé au fichier local (identique) ; le site a été testé contre les règles téléchargées de la production (mojammaa-admin `scripts/ressources.emulator.test.mjs`).

## Vérifications

- App : `tsc` OK, `npm test` 285/285 (dont `tests/services/ressourceLinks.test.mjs`), export Expo Android + iOS OK. JavaScript des copies 1.0.17/1.0.16 identique octet pour octet à celui du dépôt (export `--no-bytecode`).
- Site : 168/168 tests, build OK, parcours navigateur sur émulateurs (prof, parent, direction ; FR/AR ; ordinateur et téléphone).
- **Non fait : essai des écrans de l'app sur un appareil.**

## OTA publiées (canal / branche / environnement `production`)

Base servie avant publication sur les 5 combinaisons : `390ba5f`. Seul `a568ceb` s'ajoute.

| Runtime | Plateformes | Groupe publié | Source |
|---|---|---|---|
| 1.0.18 | android | `b6bafed4-a009-4c62-9528-a136f738c2a5` | dépôt propre, `a568ceb` |
| 1.0.17 | android, ios | `03460a09-68ea-4e33-8be9-509ad0e4229d` | copie de `a568ceb` (seul `app.json` diffère), `EAS_NO_VCS=1` |
| 1.0.16 | android, ios | `380ff6b1-1ab5-4a84-aae8-bf072aefdfab` | copie de `a568ceb` (seul `app.json` diffère), `EAS_NO_VCS=1` |

Service Expo Updates contrôlé après publication : les 5 combinaisons servent ces mises à jour (1.0.18 iOS : aucune, comme avant).

Piège rencontré : une copie dont `node_modules` est un **lien symbolique** produit des chemins d'images absolus (`/assets/_______Users/…`). Copier `node_modules` (clone APFS `cp -cR`) redonne `/assets/node_modules/…`.

## Retour arrière

App (`eas update:republish --group <groupe>`) — groupes `390ba5f` : 1.0.18 android `cfa22168-7b77-40a4-b558-20b7beeb0d61` ; 1.0.17 android `642dd259-2985-48a6-b406-990f645a77a7`, ios `05dbe3bd-6f06-4c5e-82cd-e4d90dfe36d0` ; 1.0.16 android `e5430598-0b4d-4bfe-823b-ab1592041a20`, ios `5318e07d-1230-4160-beff-62766481cfc9`.

Site : déploiement Vercel du 14 oct. (soir) depuis `51cf2fe` (inclut le retrait de la section d'aide « Ressources » de l'accueil public, ajoutée par erreur le matin).
