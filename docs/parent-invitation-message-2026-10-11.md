# Message d'activation parent — relais Claude — 11 octobre 2026

## Demande et choix de texte

Youssef trouvait l'ancien message WhatsApp trop long, mêlant arabe et français, et réservé aux utilisateurs Android. Le nouveau modèle garde un seul lien personnel, place tout l'arabe avant tout le français, et indique le parcours iPhone par le site dans Safari. Le code est déjà dans le lien : ne pas le répéter à la fin. Après activation sur le site, un bandeau propose l'application aux utilisateurs Android.

Modèle actuel (`[nom]`, `[classe]` et `[code]` sont des exemples, jamais des données réelles) :

```text
السلام عليكم ورحمة الله،
تفعيل حساب ولي أمر [nom] ([classe]):

https://mojammaa.com/parents/activer#[code]

افتحوا الرابط وأكملوا البيانات. أندرويد: ثبّتوا التطبيق بعد التفعيل. آيفون: تابعوا على الموقع عبر Safari. الرابط شخصي.

Bonjour, activez votre compte parent via le lien ci-dessus.
Android : installez l’application après activation. iPhone : continuez sur le site avec Safari. Lien personnel.
```

## Fichiers modifiés

- Application : `src/utils/admin-access.ts` (`parentCodeMessage`) et `tests/services/adminAccess.test.mjs`.
- Site voisin : `../mojammaa-admin/src/utils/accessMessages.ts` (`parentCodeMessage`) et `../mojammaa-admin/scripts/accessMessages.test.mjs`.
- Les invitations professeurs et les liens de réinitialisation n'ont pas changé. Le code de secours reste dans les invitations professeurs.

## Vérifications déjà faites

- 11 tests ciblés de l'application et 4 tests ciblés du site réussis.
- Vérifications TypeScript et `git diff --check` réussies dans les deux projets.
- Message parent identique dans les deux projets avec une entrée fictive ; 411 caractères contre 663 auparavant, soit environ 38 % de moins.
- Aucune activation avec un vrai compte parent ni essai sur iPhone n'a été effectué pour ce changement de texte.

## État de publication

Les modifications sont **locales et non publiées** au moment de cette note. Youssef a répondu « yes » à la proposition de publication, puis a demandé à voir le message et maintenant cette note. La publication a été interrompue avant toute commande de déploiement ou mise à jour OTA.

Le dépôt `mojammaa-admin` contient d'autres modifications locales sans rapport (`index.html`, `public/guide-parent/poster-activation.html`, `src/pages/SchoolHome.tsx` et des fichiers non suivis). Isoler seulement les deux fichiers du message si la publication reprend. Côté application, la production Android est en version 1.0.18 (51) et le canal EAS `production` ; ne pas attribuer le JavaScript actuel aux anciens runtimes 1.0.16/1.0.17. L'iPhone utilise l'espace parents du site, car l'application iOS n'est pas publiée.

Source du contexte de publication : `docs/modifications-2026-10-11.md`, section 12. Vérifier de nouveau l'état Git et les cibles en ligne avant toute publication.
