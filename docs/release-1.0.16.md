# Android 1.0.16 — 2026-09-06

- Expo SDK 54 conservé, avec les correctifs Expo 54.0.37, constants 18.0.14 et updates 29.0.20.
- Les modifications courantes, dont l’activation parent et le panneau enseignant « À traiter / Rendez-vous », sont intégrées au binaire.
- Runtime EAS : 1.0.16 (politique appVersion).

## Correction de l’archive

La tentative Android 46 a échoué : `.easignore` excluait `functions/lib/collegeEvaluationPolicy.json`, importé par `src/services/notesRules.ts`.
L’archive conserve désormais explicitement ce seul fichier partagé du dossier `functions`. Les fichiers serveur, secrets et sauvegardes restent exclus.

Vérifications : présence et identité du JSON dans une nouvelle archive EAS ; absence des fichiers `.secrets`, `data` et `backups` ; export Android depuis cette archive réussi (3 899 modules). Typecheck, Expo Doctor (18/18) et tests services (25/25) réussis avant la correction d’archive.

Build corrigé : `afbb3736-6fcf-4d49-8920-ba28c65ac116`, versionCode 47.
La compilation JavaScript sur EAS a également réussi (3 899 modules). La disponibilité Google Play doit être vérifiée séparément de la compilation.
