# Parent Dashboard Redesign Notes

## Mood & Inspiration
L'objectif de cette refonte était de créer un espace **chaleureux, moderne et rassurant**, tout en restant ancré dans le professionnalisme d'une institution éducative. L'inspiration puise dans l'apprentissage ludique :
- **Formes Organiques** : Les "blobs" d'arrière-plan et les cartes ont désormais des rayons de courbure beaucoup plus généreux (jusqu'à 32px pour certains composants), créant une sensation de douceur et de protection.
- **Micro-interactions** : Le recours systématique à `Moti` a été conservé et sublimé par l'augmentation de la taille des composants pressables pour un effet "squishy" satisfaisant et child-friendly.
- **Palette Aquarelle** : Le thème a été enrichi avec des tons `watercolorMint` et `watercolorPeach`. Les touches pastels viennent souligner l'interface sans surcharger l'œil, complétant parfaitement le `Cream` de fond et le `Navy` structurel.

## Changements Appliqués
1. **Design Tokens (`src/theme/designTokens.ts`)** : 
   - Ajout des tokens `watercolorMint` et `watercolorPeach`.
   - Augmentation générale des valeurs de l'objet `radius` (ex: `xl: 24`, `xxl: 32`) pour des coins beaucoup plus arrondis.
2. **Context (`src/contexts/ThemeContext.tsx`)** :
   - Mise à jour de l'interface `Theme` pour accepter les nouveaux tokens de couleurs afin que TypeScript soit strict.
3. **Composants (`src/components/dashboard/*.tsx`)** :
   - `Card.tsx` : Passage au `radius.xl`.
   - `ChildCard.tsx` : Amélioration du padding, utilisation du nouveau radius à `24` et application des nouveaux tons pastel pour les cercles de décoration.
   - `DashboardHeader.tsx` : Agrandissement des blobs de décoration et ajustement de leurs couleurs pour un effet "hero" plus impactant et ludique.
4. **Écran Principal (`src/screens/student/ParentDashboardScreen.tsx`)** :
   - Refonte de la couche d'arrière-plan avec un réseau de 5 formes organiques (`bgBlob`) distribuées tout au long de l'écran, enveloppant le contenu dans un "playground" visuel cohérent.
   - Augmentation du `marginTop` des sections pour aérer la lecture.

## Notes aux Développeurs
- **TypeScript** : La signature des hooks et les dépendances critiques (`AuthContext`, Navigation) n'ont pas été modifiées. Tout a été pensé de manière "plug-and-play" sur la couche présentationnelle.
- **Performance** : Les blobs d'arrière-plan sont positionnés de manière absolue et optimisés. Ils ne gêneront pas les re-renders de la ScrollView.
- **Thème** : Si de nouvelles pages souhaitent adopter ce style ultra-arrondi, n'hésitez pas à puiser dans `theme.radius.xxl` et `theme.watercolorMint`.
