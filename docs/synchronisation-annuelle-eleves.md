# Synchronisation annuelle des élèves

Les élèves ne doivent pas être saisis un par un chaque année. L’administration
exporte les listes officielles depuis MASSAR, puis le script synchronise la
collection `eleves` par code MASSAR.

## Ce que fait la synchronisation

- ajoute les nouveaux élèves ;
- met à jour la classe et les informations des élèves déjà connus ;
- réactive un élève qui revient ;
- archive les élèves absents des nouveaux exports ;
- conserve `parentUid`, les notes, absences, messages et autres historiques ;
- ne supprime aucun document et n’affiche aucune donnée personnelle dans le terminal.

Un ancien document sans champ `active` est considéré actif. Un élève archivé
porte `active: false` et disparaît des listes, effectifs, présences, messages
de classe et récapitulatifs courants.

## Procédure de rentrée

1. Placer tous les exports officiels `export_notesCC_*.xlsx` dans `data/`.
2. Vérifier localement le nombre d’élèves détectés :

   ```bash
   npm run db:import:eleves
   ```

3. Préparer la synchronisation avec l’année cible, sans écriture :

   ```bash
   npm run db:sync:eleves -- --academic-year=2026-2027
   ```

4. Comparer les totaux affichés avec ceux fournis par l’administration :
   élèves importés, nouveaux, réactivés et à archiver.
5. Seulement si les totaux sont corrects, confirmer exactement le nombre
   annoncé par le dry-run :

   ```bash
   npm run db:sync:eleves:commit -- \
     --academic-year=2026-2027 \
     --confirm-archive=NOMBRE_A_ARCHIVER
   ```

Si le nombre change entre les deux passages, le commit s’arrête. Il faut refaire
le dry-run et vérifier les fichiers. L’ancien mode destructif `--wipe` est
désactivé.

## Données nécessaires de l’administration

Demander un export complet pour toutes les classes, pas un échantillon :

- code MASSAR ;
- nom et prénom ;
- date de naissance si utilisée par l’école ;
- classe et niveau de la nouvelle année ;
- liste des transferts, départs et retours à confirmer.

Ne jamais envoyer ces fichiers par un canal public ni les joindre à un ticket.
Ils restent dans le dossier local prévu et ne doivent pas être commités dans Git.
