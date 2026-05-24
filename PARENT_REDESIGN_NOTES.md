# Parent Dashboard Redesign — Iteration 1

## Mood / inspiration

Direction: carnet scolaire premium marocain, chaleureux et child-friendly, avec une structure de dashboard parent claire. Le fond reste cream et papier, le navy porte la hiérarchie, puis le corail, l'orange et le jaune du logo rythment les actions et les statuts. Les pastels mint, sky et lilac servent uniquement de respirations visuelles.

Le hero garde le brand strip bilingue avec le logo local et ajoute une illustration SVG inline d'école. Les cartes utilisent des surfaces papier, des badges arrondis, des pictos lucide et des micro-animations Moti sobres.

## Ce qu'un dev doit savoir

- L'écran parent lit toujours `useParentData`, `useUpcomingEvents` et maintenant `useParentMessages`; les annonces live remplacent le mock quand elles existent.
- Les interactions existantes sont conservées: cards enfants, présence, devoirs, annonces, événements, quick actions et modales de détail.
- Les nouveaux tokens de marque sont ajoutés dans `src/theme/designTokens.ts` et exposés dans `ThemeContext.tsx` sans retirer l'ancien contrat.
- Aucun asset externe n'est utilisé; le header charge `assets/logo.png`.
- Validation effectuée: `npx tsc --noEmit`.
