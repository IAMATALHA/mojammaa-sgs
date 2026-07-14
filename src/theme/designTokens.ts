/**
 * Design tokens dérivés du logo Mojammaa Al Maarifa.
 *
 * - rouge profond dérivé du logo pour les actions principales
 * - or et orange pour l'identité et les accents
 * - encre presque noire pour la lisibilité
 * - surfaces crème chaudes pour garder une interface calme
 */

import { Platform } from 'react-native'

export const colors = {
  light: {
    text: {
      primary: '#120E09',
      secondary: 'rgba(18, 14, 9, 0.84)',
      tertiary: 'rgba(18, 14, 9, 0.64)',
      inverse: '#FFFFFF',
    },
    surface: {
      primary: '#FFFBEB',
      secondary: '#FFFDF7',
      tertiary: '#FEF4DB',
      elevated: '#FFFFFF',
      grouped: '#FFF7E1',
    },
    separator: 'rgba(18, 14, 9, 0.10)',
    separatorStrong: 'rgba(18, 14, 9, 0.18)',
    primary: {
      value: '#A61B1B',
      pressed: '#831515',
      surface: 'rgba(166, 27, 27, 0.08)',
      surfaceStrong: 'rgba(166, 27, 27, 0.14)',
      border: 'rgba(166, 27, 27, 0.24)',
    },
    accent: {
      // Or assombri pour le texte et les boutons (6.1:1 sur blanc).
      primary: '#8A5700',
      pressed: '#704600',
      bright: '#FCCC06',
      surface: 'rgba(252, 204, 6, 0.18)',
      surfaceStrong: 'rgba(252, 204, 6, 0.28)',
      border: 'rgba(162, 104, 13, 0.28)',
    },
    status: {
      success: '#15803D',
      successSurface: 'rgba(21, 128, 61, 0.12)',
      warning: '#9A5700',
      warningSurface: 'rgba(253, 115, 2, 0.14)',
      danger: '#B42318',
      dangerSurface: 'rgba(180, 35, 24, 0.12)',
      info: '#92400E',
      infoSurface: 'rgba(253, 115, 2, 0.12)',
      // Or lumineux : décoration et surfaces uniquement, jamais texte blanc.
      gold: '#FCCC06',
      goldSurface: 'rgba(252, 204, 6, 0.18)',
    },
    pastel: {
      green: '#52B788',
      greenSoft: 'rgba(82, 183, 136, 0.16)',
      rose: '#A61B1B',
      roseSoft: 'rgba(166, 27, 27, 0.08)',
      violet: '#B84F00',
      violetSoft: 'rgba(253, 115, 2, 0.12)',
      cream: '#FFFBEB',
      watercolorA: 'rgba(252, 204, 6, 0.18)',
      watercolorB: 'rgba(166, 27, 27, 0.07)',
      watercolorC: 'rgba(253, 115, 2, 0.10)',
    },
  },
} as const

const light = colors.light

export const palette = {
  brandInk: light.text.primary,
  brandRed: light.primary.value,
  brandRedDark: light.primary.pressed,
  brandRedSoft: light.primary.surface,
  brandRedBorder: light.primary.border,
  brandGold: light.accent.bright,
  brandGoldDark: light.accent.primary,
  brandGoldSoft: light.accent.surface,
  brandOrange: '#FD7302',
  brandOrangeDark: '#B84F00',
  brandOrangeSoft: 'rgba(253, 115, 2, 0.12)',

  // Alias historiques conservés pour les composants existants.
  navy: light.primary.value,
  navyDark: light.primary.pressed,
  navySoft: light.primary.surface,
  navyBorder: light.primary.border,

  coral: '#FD7302',
  coralDark: '#B84F00',
  coralSoft: 'rgba(253, 115, 2, 0.12)',

  orange: light.status.warning,
  orangeSoft: light.status.warningSurface,
  yellow: light.status.gold,
  yellowSoft: light.status.goldSurface,
  green: light.pastel.green,
  greenSoft: light.pastel.greenSoft,
  rose: light.pastel.rose,
  roseSoft: light.pastel.roseSoft,
  violet: light.pastel.violet,
  violetSoft: light.pastel.violetSoft,
  cream: light.pastel.cream,
  watercolorA: light.pastel.watercolorA,
  watercolorB: light.pastel.watercolorB,
  watercolorC: light.pastel.watercolorC,

  accent: light.accent.primary,
  accentDark: light.accent.pressed,
  accentBright: light.accent.bright,
  accentSoft: light.accent.surface,
  accentSoftStrong: light.accent.surfaceStrong,
  accentBorder: light.accent.border,

  white: '#FFFFFF',
  bg: light.surface.primary,
  surface: light.surface.secondary,
  surfaceAlt: light.surface.tertiary,
  elevated: light.surface.elevated,
  grouped: light.surface.grouped,
  border: light.separator,
  borderStrong: light.separatorStrong,

  text: light.text.primary,
  textSoft: light.text.secondary,
  textMuted: light.text.tertiary,
  textInverse: light.text.inverse,

  success: light.status.success,
  successSoft: light.status.successSurface,
  warning: light.status.warning,
  warningSoft: light.status.warningSurface,
  danger: light.status.danger,
  dangerSoft: light.status.dangerSurface,
  info: light.status.info,
  infoSoft: light.status.infoSurface,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  // Direction "clay" (2026-06) : surfaces très arrondies.
  xxl: 24,
  clay: 28,
  pill: 999,
} as const

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Poppins_800ExtraBold',

  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    web: 'Georgia, Times New Roman, serif',
    default: 'serif',
  }),

  script: 'GreatVibes_400Regular',
  arabic: 'Cairo_400Regular',
  arabicSemi: 'Cairo_600SemiBold',
  arabicBold: 'Cairo_700Bold',
} as const

export const fontSize = {
  caption: 11,
  small: 12,
  body: 15,
  bodyLg: 16,
  title: 18,
  h3: 22,
  h2: 28,
  h1: 34,
  display: 40,
} as const

// Ombre douce teintée avec l'encre du logo, identique sur les plateformes.
//  - iOS    : shadowColor/Opacity/Radius/Offset (rendu de référence).
//  - Android: `elevation` ignore shadowColor → ombre DURE et GRISE de l'OS
//             (halo gris autour des tuiles bento). On n'utilise donc PAS
//             elevation : sous la New Architecture (RN 0.81), `boxShadow`
//             rend une vraie ombre douce ET teintée, calquée sur iOS.
// `boxShadow` : offsetX offsetY blur color  (blur ≈ shadowRadius iOS).
const BRAND_INK_RGB = '18, 14, 9'
const softShadow = (radius: number, opacity: number, y = 2) =>
  Platform.select({
    ios: {
      shadowColor: palette.brandInk,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
    },
    android: {
      // Pas d'elevation (= gris dur). On utilise boxShadow (Fabric), MAIS Android
      // le rend plus dense/sombre qu'iOS → on allège : opacité ~moitié, flou
      // élargi et décalage réduit pour une ombre douce et discrète, non grise.
      boxShadow: `0px ${Math.round(y * 0.6)}px ${Math.round(radius * 1.3)}px rgba(${BRAND_INK_RGB}, ${+(opacity * 0.45).toFixed(3)})`,
    },
    default: {},
  }) as object

export const shadows = {
  none: {},
  xs: softShadow(10, 0.05, 2),
  sm: softShadow(16, 0.08, 6),
  md: softShadow(24, 0.10, 10),
  lg: softShadow(32, 0.14, 16),
  // Ombre "clay" : diffuse et décalée vers le bas pour un volume doux.
  clay: softShadow(18, 0.14, 9),
} as const

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 }
export const minTouch = 44

// Source de vérité unique pour le motion des états pressés (cf. DESIGN_NOTES :
// 200 ms, scale 0.98). Les écrans doivent consommer ces constantes plutôt que
// de redéfinir des scales/durées ad-hoc (0.8–0.95, 130–900 ms).
export const motion = {
  pressScale: 0.98,
  pressTransition: { type: 'timing' as const, duration: 200 },
  // Durée d'entrée standard (apparition de cartes/listes).
  enterDuration: 320,
} as const

export const chartColors = [
  palette.brandRed,
  palette.brandGoldDark,
  palette.brandOrangeDark,
  palette.success,
  palette.warning,
  palette.brandInk,
] as const

export const fontStack =
  Platform.select({
    web: '"Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    default: undefined,
  })
