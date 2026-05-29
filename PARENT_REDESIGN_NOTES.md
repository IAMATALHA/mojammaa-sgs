# Parent Dashboard — Redesign Iteration 1 (Claude)

## Mood / inspiration

**"Matinée à l'école"** — le sentiment d'un parent qui ouvre l'app au
réveil et "retrouve" la journée de son enfant. Chaleur du papier, douceur
des pastels, signature manuscrite. L'écran respire la sérénité scolaire
plutôt que la dashboardisation corporate.

L'idée centrale : le dashboard **s'imprègne de la couleur d'avatar de
l'enfant sélectionné**. Quand Omar est actif, l'écran tire vers son
corail. Quand Laila est active, vers son orange. Chaque parent retrouve
visuellement l'identité de son enfant.

## Changements clés

### 1. Hero card de bienvenue (remplace DashboardHeader)
- LinearGradient tinté par `selectedChild.avatarColor` (~18% alpha) qui
  glisse vers le cream du fond
- Salutation **prénom en Great Vibes 32px navy** — moment émotionnel
- Avatar parent + bell intégrés dans le hero, plus la mini-strip "Mojammaa
  Al Maarifa / مجمع المعرفة الخصوصية" en bas
- Animation : fade-in + slide-down 500ms à l'arrivée

### 2. Enfants en carousel horizontal
- Avant : cartes empilées verticalement (1 enfant = 1 ligne ChildCard)
- Maintenant : `ScrollView horizontal` avec snap, chaque card = `screen_w - 80`
  (l'enfant suivant teasé à droite)
- Animation : stagger fade-in (50ms × index)
- Card active : bordure 2px tintée + scale 1.0 ; inactive : opacity 0.78
  + scale 0.96
- Top band gradient + grosse initiale ; body avec mini-stats "Présence" et "Moyenne"

### 3. Attendance card "tinted"
- L'`AttendanceRing` reprend `tint = child.avatarColor` comme couleur de
  progression au lieu d'un theme.accent figé
- Card avec bordure + shadow color également tintée — cohérence visuelle
  forte avec l'enfant sélectionné
- Petit gradient de bas en haut (top band coloré) pour effet "lever de soleil"

### 4. Ornements SVG décoratifs
- 3 nouveaux composants SVG inline : `StarOrnament`, `LeafOrnament`,
  `SunOrnament`
- Placés en `DividerOrnament` entre les grosses sections (Mes enfants →
  Présence → Devoirs → Annonces → Événements)
- Inspirés directement du poster "Semaine Culturelle" fourni en
  référence (étoiles, feuilles, soleil)

### 5. Animations Moti
- `AnimatedSection` wrapper avec fade-in + slide-up stagger 40ms à 280ms
- Press states sur toutes les Pressables : scale 0.95-0.97 avec timing 150ms

### 6. Modales : touche tinted
- La modale Homework reprend la couleur tint de l'enfant pour le CTA
  + l'icône header
- Garde le pattern "centered card sheet" introduit avant

## Ce qu'un dev doit savoir

### Architecture préservée
- ✅ `useParentData`, `useUpcomingEvents`, `useParentMessages` → utilisés
  comme avant. **Aucune signature de hook modifiée**.
- ✅ Les 3 modales (Homework/Announcement/Event) ont la même API
- ✅ Tous les `onPress` et navigation préservés
- ✅ Le brand strip avec logo + nom école toujours présent (intégré dans
  le HeroCard maintenant)

### Helpers nouveaux dans le fichier
- `hexWithAlpha(hex, alpha)` : convertit un #RRGGBB en `rgba(r,g,b,a)`
  — utilisé pour les gradients tintés
- `StarOrnament`, `LeafOrnament`, `SunOrnament` : SVG inline réutilisables
- `DividerOrnament` : combine ligne + icône centrée pour séparer les sections
- `HeroCard`, `ChildCarouselCard`, `AnimatedSection` : composants internes

### Pourquoi ces choix
- **Carousel** au lieu de verticale → l'écran reste compact même avec 3+
  enfants. Le parent peut survoler les enfants d'un swipe au lieu de
  scroller.
- **Tint dynamique** → identité visuelle par enfant sans avoir besoin de
  thèmes complets. Une seule variable `tint` propagée.
- **Ornements SVG** au lieu d'images → légers, scalables, pas de
  dépendance asset, ton illustré sans surcharge.
- **Great Vibes pour le prénom** → un seul moment de calligraphie par
  écran → précieux et pas répétitif.

### Limites assumées
- Le `homeworkForSelected` reste sur le mock `PARENT_RECENT_HOMEWORK`
  parce que la collection Firestore `homeworks` n'existe pas encore.
- `PARENT_ANNOUNCEMENTS` également sur mock (en attendant que
  `useParentMessages` soit câblé en remplacement — déjà fait dans une
  autre branche mais hors scope de cette itération).
- `PARENT_QUICK_ACTIONS` reste statique (config UI, pas data).

### Fichiers touchés
- `src/screens/student/ParentDashboardScreen.tsx` — réécriture complète
  avec la nouvelle structure
- `PARENT_REDESIGN_NOTES.md` — ce document

**Aucun autre fichier touché.** Hooks, services, theme, autres screens,
navigation : intacts.

## Test à faire avant merge

1. `npx tsc --noEmit` → doit passer ✅ (testé)
2. Login en parent test → vérifier que le carousel scrolle et que la
   couleur tint suit bien la sélection
3. Vérifier que les Pressables cliquent toujours (cards, sections, bell,
   avatar)
4. Vérifier que les 3 modales s'ouvrent et se ferment normalement
5. Pull-to-refresh fonctionne
6. Avec 0 enfant : empty state affiché (pas le carousel)

## Si tu n'aimes pas

```bash
git checkout main           # revient à l'état pre-redesign
git branch -D claude/iteration-1
```
