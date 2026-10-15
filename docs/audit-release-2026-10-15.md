# Audit du 15 octobre 2026 — mise en ligne

Contenu : corrections A01–A08 (Codex) et C01–C11 (contre-audit), plus la remarque du professeur par élève sur les devoirs. Détail : [audit-complet-2026-10-15.md](audit-complet-2026-10-15.md). Commits locaux `3c2e356` → `5b36f8d` (branche `feat/ressources-liens`, non poussée).

## Ordre suivi (lancé par Youssef)

1. **Règles** Firestore + Storage, 15/10 12:20 UTC : Firestore `600486a7`, Storage `67da5e64`. `npm run verify:rules` en phase. Avant : les rulesets de `f9552bf` (comparés au live avant déploiement).
2. **Fonctions** (codebase `default`, par nom, europe-west1) : `onAbsenceRequestWritten` et `getStatsStudentFile` mises à jour ; `onRessourceDeleted` et `onDevoirDeleted` créées. Journaux sans erreur juste après.
3. **OTA** (branche / canal / environnement `production`), source `5b36f8d` :

| Runtime | Plateforme | Groupe | Source |
|---|---|---|---|
| 1.0.18 | android | `fa1a8b1a-8ee8-44d1-917f-83273211d290` | dépôt |
| 1.0.17 | android | `0966ad92-e09d-4bbc-9140-5f9e777d262f` | copie `git archive`, seul `app.json` diffère, `EAS_NO_VCS=1` |
| 1.0.17 | ios | `d0c0bfdb-165c-4132-b0f6-1b7ea35825df` | idem |
| 1.0.16 | android | `ffa74403-508a-4b08-b20c-986f08099196` | idem |
| 1.0.16 | ios | `a2dd46cd-ed32-4b0a-85a0-951d5947b879` | idem |

Service Expo Updates contrôlé après publication (GET en lecture seule) : les 5 combinaisons servent ces mises à jour ; même bundle Android sur les trois runtimes (`uaoIwU-4…`), même bundle iOS sur 1.0.17 et 1.0.16 (`osm2_X_c…`). 1.0.18 iOS : aucune mise à jour, comme avant (aucun build iOS).

## Retour arrière

- App : `eas update:republish --group <groupe>` avec les groupes du 14/10 (`a568ceb`) : 1.0.18 android `b6bafed4-a009-4c62-9528-a136f738c2a5` ; 1.0.17 `03460a09-68ea-4e33-8be9-509ad0e4229d` ; 1.0.16 `380ff6b1-1ab5-4a84-aae8-bf072aefdfab`.
- Règles : redéployer `firestore.rules` / `storage.rules` de `f9552bf`. **Attention :** l'app publiée écrit des remarques (`teacherComment`, `teacherTags`). Revenir aux règles de `f9552bf` sans revenir aussi sur l'app ferait refuser ces écritures.

## Non fait

- Essai sur téléphone (remarque du professeur, retards côté parent, appui sur une ancienne notification).
- Site : la remarque n'y est ni affichée ni saisie. Le professeur y garde l'appel direct, désormais limité à J-7…aujourd'hui et refusé un jour « cours annulés ».
