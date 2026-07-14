# Mojammaa SGS Design Notes

## Direction

The dashboard visual language follows the Mojammaa logo through an iOS lens: warm cream canvas, near-black ink for structure, a deeper interpretation of the logo red for primary actions, and gold/orange identity accents. The goal is school-friendly warmth without turning the app into a decorative poster.

## Color

**Source de vérité = `src/theme/designTokens.ts`** (et non ce document). Valeurs réelles : surface `#FFFBEB` (crème), texte/structure `#120E09`, primaire rouge profond `#A61B1B`, or lumineux `#FCCC06`, orange `#FD7302`, `success` vert `#15803D` et `danger` `#B42318`. Le rouge profond porte les CTA et l'onglet actif ; le rouge vif `#D00302` reste celui de l'image originale du logo. L'or et l'orange lumineux restent décoratifs ; pour du texte ou un fond avec texte blanc, utiliser leurs variantes accessibles `#8A5700` et `#B84F00`.

> Les alias historiques `navy` et `coral` sont conservés uniquement pour la compatibilité des composants existants. Tout nouveau code doit utiliser les tokens `brand*` ou sémantiques.

## Type And Shape

Poppins remains the app font as the closest loaded match to a San Francisco-style hierarchy. Weight does most of the work: 400 body, 500 secondary emphasis, 600 titles, 700/800 numbers and initials. Cards now sit closer to a consistent 12px radius with soft floating depth.

## Motion

Dashboard press states use Moti timing transitions at 200ms with a small `0.98` scale and light opacity change. Bottom tabs use a subtle red active capsule and gold/orange dots as identity accents.

## Dark Mode

`src/theme/designTokens.ts` now exposes semantic groups (`text`, `surface`, `separator`, `accent`, `status`) under `colors.light`. A dark theme can mirror that shape without changing the existing `Theme` interface.
