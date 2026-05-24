# Parent Dashboard Redesign — Iteration 1

## Mood / inspiration

Direction: carnet scolaire premium marocain, chaleureux mais plus institutionnel, avec une structure de dashboard parent claire. Le fond reste cream et papier, le navy porte la hiérarchie, puis le corail, l'orange et le jaune du logo rythment les actions et les statuts. Les lavis watercolor sont discrets et organiques, sans illustration figurative.

Le hero met le logo local au centre comme sceau principal et utilise `assets/icon.png` en watermark très subtil. Les rectangles internes ont été réduits: moins de cartes imbriquées, plus de respiration, des séparateurs fins et des surfaces plus premium.

## Ce qu'un dev doit savoir

- L'écran parent lit toujours `useParentData`, `useUpcomingEvents` et maintenant `useParentMessages`; les annonces live remplacent le mock quand elles existent.
- Les interactions existantes sont conservées: cards enfants, présence, devoirs, annonces, événements, quick actions et modales de détail.
- Les nouveaux tokens de marque sont ajoutés dans `src/theme/designTokens.ts` et exposés dans `ThemeContext.tsx` sans retirer l'ancien contrat.
- Aucun asset externe n'est utilisé; le header charge `assets/logo.png`.
- Validation effectuée: `npx tsc --noEmit`.
