# Mojammaa SGS Design Notes

## Direction

The dashboard visual language now follows the Arabic poster inspiration through an iOS lens: warm cream canvas, navy structure, coral emphasis, and very small orange/yellow status points. The goal is school-friendly warmth without turning the app into a decorative poster.

## Color

**Source de vérité = `src/theme/designTokens.ts`** (et non ce document — réconcilié le 23/06/2026, la palette avait dérivé). Valeurs réelles : surface `#FAF8F5` (crème), texte/structure navy `#1D3557`, accent **orange `#FF8C42`** (l'« accent.primary » — c'est lui qui porte CTAs, icônes actives, dégradés), `success` vert `#15803D` (lisible en texte), `danger` `#E76F51`, gold `#FFD23F` réservé aux graphiques/réussites. Le navy porte le texte et la structure ; l'orange porte l'emphase/action ; le gold reste décoratif (jamais en texte sémantique).

> Note historique : les anciennes notes mentionnaient un coral `#E63946` et un canvas `#F5F1E8` distincts — ils n'existent plus comme tokens séparés (coral est aliasé sur l'orange). La règle « orange = points seulement » est donc caduque : l'orange EST la couleur d'accent. Pour un vrai point de statut discret, utiliser `status.warning`/`gold` en fond/pastille, pas en texte.

## Type And Shape

Poppins remains the app font as the closest loaded match to a San Francisco-style hierarchy. Weight does most of the work: 400 body, 500 secondary emphasis, 600 titles, 700/800 numbers and initials. Cards now sit closer to a consistent 12px radius with soft floating depth.

## Motion

Dashboard press states use Moti timing transitions at 200ms with a small `0.98` scale and light opacity change. Bottom tabs use a subtle navy/coral active capsule and orange/yellow dots as status accents.

## Dark Mode

`src/theme/designTokens.ts` now exposes semantic groups (`text`, `surface`, `separator`, `accent`, `status`) under `colors.light`. A dark theme can mirror that shape without changing the existing `Theme` interface.
