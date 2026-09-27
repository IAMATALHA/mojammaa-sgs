# Vérification du site et du guide parent — 25 septembre 2026

Périmètre : changements publics de mojammaa.com réalisés dans cette conversation (menu Application mobile, lien d’activation, FAQ, coordonnées/Maps, guide vertical FR/AR, fond aquarelle, suppression des liens d’appel et de téléchargement dans le guide). Les fonctions internes de l’application et les données des familles ne sont pas concernées par cet audit.

## Résultat

378 contrôles automatisés réussis sur le site publié : 368 contrôles du parcours et 10 contrôles complémentaires. Aucun échec final, aucune erreur JavaScript non interceptée et aucune réponse HTTP >=400 observée pendant les parcours. TypeScript du projet admin : `tsc --noEmit -p tsconfig.app.json` réussi, y compris après correction.

Chromium headless, largeurs 320, 390, 768, 980, 1024, 1240 et 1440 px. Accueil testé en français et en arabe ; guide bilingue avec textes arabes RTL. Contrôles supplémentaires à 390 et 1440 px avec animations normales, en plus du parcours avec réduction des animations.

- Entrée Application mobile, fermeture du menu, défilement vers la bonne zone, bouton ouvrant la page HTML.
- Trois FAQ ouvertes et refermées, activation au clavier ; téléphone et recherche Google Maps de la section Contact.
- Cinq étapes, captures chargées à une taille lisible, liens d’agrandissement, retour à l’accueil, absence de débordement horizontal.
- Présentation continue : pas de bordure, d’ombre ni de panneau de fond sur les étapes ; nouvelle image aquarelle chargée.
- Absence des liens d’appel, du numéro affiché dans ce bouton et du téléchargement du poster dans le guide.
- Navigation clavier (FAQ et lien d’évitement), animations/défilement normaux.
- Intégrité SHA-256 des trois captures et du nouveau fond publiée identique aux fichiers locaux.
- HTTP 200 pour le guide, le fond et la fiche Google Play. Aucun appel téléphonique ni activation réelle de compte n’a été effectué.
- Inspection visuelle des captures du guide mobile, du formulaire, du pied du guide et de l’accueil FR/AR sur mobile, format intermédiaire et ordinateur.

## Correction trouvée et publiée

Le menu de bureau chevauchait le logo en français aux largeurs intermédiaires après ajout d’Application mobile. Il passe désormais en menu compact sous 1240 px, indépendamment de la mise en page du contenu. Aucun chevauchement lors du parcours final ; validation visuelle à 980 px et contrôle à la limite 1240 px.

Source : `../mojammaa-admin/src/pages/SchoolHome.tsx`, variable `compactNav`.

Production Vercel READY : `dpl_DVDKcge2kQSWfQhsWa5rT1j5PYKH`. Artefact courant : `/tmp/mojammaa-verified-nav-release`. Tous les parcours finaux ont été réalisés sur cette version publiée, pas seulement en local.

## Preuves et limites

Rapports : `output/site-verification/report.json`, `extra-checks.json`. Scripts reproductibles : `verify-site.cjs`, `verify-extra.cjs` dans le même dossier. Captures PNG par format et langue conservées dans ce dossier.

Le premier passage a également signalé des faux négatifs de synchronisation (position lue avant la fin du défilement, style lu avant chargement CSS) : les tests attendent désormais les états réels. Le problème de chevauchement du menu, lui, était réel et a été corrigé.

Limites : tests Chromium avec formats mobiles simulés, pas de Safari/iPhone ou appareil Android physique ; pas d’audit exhaustif WCAG, de test d’installation de l’application ni d’activation réelle. Les horaires officiels, le WhatsApp officiel et l’emplacement Maps précis restent à fournir. Le lien Maps actuel est une recherche au nom de l’école, pas un itinéraire vers un point confirmé.
