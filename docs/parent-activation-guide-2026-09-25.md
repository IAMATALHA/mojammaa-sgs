# Guide d’activation parent — 25 septembre 2026

Site publié : https://mojammaa-sgs.web.app

Accueil remplacé par un guide interactif français/arabe : téléchargement Google Play, installation et ouverture, bouton d’activation, six champs expliqués, validation. Illustrations HTML clairement identifiées, informations du parent, téléphone facultatif et mot de passe de huit caractères minimum. FAQ pour code manquant, erreur, compte existant et enfant non rattaché. Aucune donnée personnelle collectée sur le site. Installation Android uniquement ; pas de lien App Store inventé.

Libellés vérifiés dans LoginScreen, ParentActivationScreen et les traductions. Contrôles navigateur Chromium à 320, 390, 768 et 1440 px, dans les deux langues : navigation entre toutes les étapes, retour au début, FAQ, RTL, six champs et absence de débordement ; aucune erreur JavaScript. Captures bureau FR et mobile AR inspectées. Syntaxe JS et git diff --check validés.

Déploiement Firebase Hosting uniquement réussi ; règles, fonctions et application mobile inchangées. Fichiers : public/index.html, public/parents-guide.css, public/parents-guide.js. Confidentialité et réinitialisation de mot de passe conservées.

## Remplacement par les posters demandés

L’utilisateur a demandé des posters à fond parchemin beige, touches aquarelle, titres marine et accents corail/orange/jaune, avec ses vraies captures. Le guide interactif initial a été remplacé par un poster récapitulatif et cinq affiches détaillées FR/AR. Trois JPEG originaux sont conservés sans retouche dans `public/guide-parent/`. Flèches et encadrés sont des calques HTML. La capture du formulaire montre cinq champs ; le téléphone facultatif est seulement signalé dans la note de compatibilité.

Décor : `public/guide-parent/cadre-aquarelle.png`, outil intégré imagegen. Prompt : « Decorative background/layout ONLY for a Moroccan school parent onboarding poster. Landscape 3:2. Warm beige cream parchment texture, subtle watercolor speckles, soft vintage paper grain, organic tactile feel. Navy outlines, muted coral, orange and ochre highlights. Quiet blank header; five evenly spaced tall identical EMPTY ivory phone areas, generous blank caption band. No screenshots, UI, text, numbers, buttons, logos or watermark. School-inspired watercolor corner motifs. Text and original screenshots will be layered on the website afterwards. »

Poster final rendu depuis la page : `public/guide-parent/poster-activation.png`. Affichage mobile par étape, accès aux JPEG en grand et téléchargement du poster. Vérification Chromium : 320/390/768/1440 px, cinq étapes, cinq champs, cinq liens de captures, aucun débordement horizontal ni erreur JavaScript. Poster inspecté visuellement ; ajustements de lisibilité des titres et légendes.

## Simplification demandée : lien uniquement

Page-guide retirée de Firebase Hosting ; accueil d’origine restauré, poster PNG conservé. Sur le site principal `mojammaa.com` / `mojammaa-admin.vercel.app`, un seul lien FR/AR a été ajouté sous le paragraphe « L’école, simplement dans votre poche. » dans `mojammaa-admin/src/pages/SchoolHome.tsx`.

Publication ciblée Vercel `dpl_BjLhHPYYqb7PUSzNfadEdn9gRUcC`. Pour ne pas publier les nombreux travaux locaux non concernés, artefact isolé construit dans `/tmp/mojammaa-poster-link-release` depuis le dist existant : bundle accueil, entrée et CSS comparés identiques à la production avant modification ; insertion JSX compilée du seul lien, nouvelles références de modules pour invalider le cache, anciens modules conservés. Le fichier source TSX porte le même lien pour les prochains builds. Vérification navigateur : lien unique sous le titre demandé. Vérification HTTP : lien publié, poster PNG disponible et ancien guide retiré.

Le poster est désormais aussi hébergé sur le site principal : `https://mojammaa.com/guide-parent/poster-activation.png`. Le lien de SchoolHome est relatif (`/guide-parent/poster-activation.png`), le fichier est conservé dans `mojammaa-admin/public/guide-parent/`. Publication Vercel ciblée avec artefact isolé et modules suffixés `poster-domain`. Disponibilité et intégrité PNG vérifiées sur le domaine principal.

## Ajouts site — menu et aide parents (25 septembre 2026)

- Source : `../mojammaa-admin/src/pages/SchoolHome.tsx`.
- Menu FR/AR : Application mobile vers `#application` (bureau et mobile).
- Bouton visible « Activer mon compte parent » vers le poster relatif existant.
- FAQ native accessible (details/summary) : code, échec activation, enfant absent.
- Contact administration : téléphone cliquable conservé, horaires à demander par téléphone, recherche Google Maps au nom de l’école.
- Informations en attente de Youssef : horaires officiels, adresse/lien Maps précis, confirmation du WhatsApp officiel. Aucun numéro WhatsApp ni horaire inventé.
- Publication isolée depuis `/tmp/mojammaa-parent-help-release` pour préserver les autres changements locaux non publiés. Préparation reproductible : `/tmp/prepare-parent-help.cjs` + `/tmp/parent-help-component.tsx` ; sauvegarde source avant intervention : `/tmp/SchoolHome-before-parent-help.tsx`.
- Production Vercel READY : `dpl_Hcz98S1sN9BLZgC8F25iDJP8DT5L`, alias https://mojammaa.com.
- Contrôles limités à la transpilation TSX, syntaxe du module JS et présence de la version publiée sur le domaine ; vérifications détaillées reportées à la demande de l’utilisateur.

## Guide mobile vertical — 5 étapes

Demande utilisateur : remplacer l’ouverture du PNG illisible sur mobile par `https://mojammaa.com/guide-parent/poster-activation.html`, cinq étapes verticales, inspiration aquarelle identique au poster.

- Page HTML/CSS sans JavaScript, responsive, FR/AR, cinq cartes numérotées, captures originales avec repères CSS et liens vers les images en grand ; explications des champs, lien Google Play officiel, téléphone administration et téléchargement du poster conservé.
- Décor aquarelle existant réutilisé ; beige crème, marine, corail, orange et jaune. Aucune nouvelle capture inventée.
- Sources : `public/guide-parent/poster-activation.html` et `.css`, copiées dans `../mojammaa-admin/public/guide-parent/` avec les trois JPEG et le cadre aquarelle. Le lien de `SchoolHome.tsx` pointe désormais sur `.html`.
- Publication isolée : `/tmp/mojammaa-vertical-guide-release`, préparation `/tmp/prepare-vertical-guide.cjs`, modules `*-vertical-guide.js`. Préserve tous les autres travaux locaux non publiés.
- Vercel production READY : `dpl_2aC3Y23RLV1vcc3D4pNNKbZNoFYT`, alias https://mojammaa.com.
- Contrôles techniques : cinq étapes/captures et ressources locales présentes, syntaxe module valide, HTML publié identique au fichier source, accueil servant la nouvelle entrée. Vérifications visuelles détaillées reportées conformément à la préférence de l’utilisateur.

## Révision : guide continu et nouveau fond

À la demande de Youssef, suppression de l’aspect sections/cartes : une colonne continue, titres centrés, flèches entre étapes, aucun panneau de fond ni bordure autour des étapes. Nouveau fond généré par image_gen intégré : `public/guide-parent/fond-aquarelle-continu.png` (prompt et provenance : `docs/parent-guide-watercolor-background.md`). Les captures et les cinq étapes restent identiques.

Publication isolée `/tmp/mojammaa-flowing-guide-release` ; Vercel READY `dpl_HXoAR6NKftWryCEaUScNJQ1aU122`. HTML et CSS publiés comparés aux sources ; CSS versionné `?v=continuous-2`. Les contrôles visuels complets restent différés à la demande de l’utilisateur.

## Pied du guide simplifié

Liens « Appeler l’administration » (avec numéro et traduction arabe) et « Télécharger le poster » (FR/AR) supprimés du guide à la demande de Youssef. Retour au site conservé. Production READY `dpl_3n2WfB1mLHK7nkfuP9fEqhLDiGWs`, artefact courant `/tmp/mojammaa-guide-clean-footer-release`. HTML publié identique à la source ; absence des deux liens confirmée.

## Vérifications demandées effectuées

Voir `docs/site-verification-2026-09-25.md` : 378 contrôles réussis, 7 tailles, FR/AR, captures inspectées, clavier et animations, intégrité des ressources. Chevauchement du menu avec le logo corrigé par menu compact sous 1240 px. Nouvelle production : `dpl_DVDKcge2kQSWfQhsWa5rT1j5PYKH`, artefact courant `/tmp/mojammaa-verified-nav-release`.
