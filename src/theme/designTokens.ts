/**
 * Storybook-inspired design tokens for Mojammaa SGS.
 *
 * The visual system is intentionally warm and educational:
 * - soft cream backgrounds
 * - navy typography for structure
 * - orange + gold accents for actions and achievements
 * - pastel green / rose / violet for friendly illustrated moments
 */

import { Platform } from 'react-native'

export const colors = {
  light: {
    text: {
      primary: '#1D3557',
      secondary: 'rgba(29, 53, 87, 0.92)',
      // Muted/caption text. The old olive at 48% sat around 1.8:1 on cream
      // (failed even 3:1). Bumped 23/06/2026 from 55% (~3.2:1, still failed AA
      // for normal text) to 65% (~4.5:1 on cream), keeping the de-emphasised
      // feel in the same hue family as primary text while clearing WCAG AA.
      tertiary: 'rgba(29, 53, 87, 0.65)',
      inverse: '#FFFFFF',
    },
    surface: {
      primary: '#FAF8F5',
      secondary: '#FFFDFC',
      tertiary: '#F3EEE7',
      elevated: '#FFFFFF',
      grouped: '#F6F1EA',
    },
    separator: 'rgba(29, 53, 87, 0.10)',
    separatorStrong: 'rgba(29, 53, 87, 0.18)',
    primary: {
      value: '#1D3557',
      pressed: '#16304F',
      surface: 'rgba(29, 53, 87, 0.10)',
      surfaceStrong: 'rgba(29, 53, 87, 0.16)',
      border: 'rgba(29, 53, 87, 0.18)',
    },
    accent: {
      primary: '#FF8C42',
      pressed: '#F07B2F',
      surface: 'rgba(255, 140, 66, 0.12)',
      surfaceStrong: 'rgba(250, 112, 27, 0.2)',
      border: 'rgba(255, 140, 66, 0.22)',
    },
    status: {
      // `success` must read as "good" and stay legible as text/icon on light
      // surfaces. Yellow (#FFD23F) failed both: it reads as caution and only
      // reached ~1.4:1 contrast. This green clears 4.5:1 on cream/white.
      success: '#15803D',
      successSurface: 'rgba(21, 128, 61, 0.12)',
      warning: '#FF8C42',
      warningSurface: 'rgba(255, 140, 66, 0.14)',
      danger: '#E76F51',
      dangerSurface: 'rgba(231, 111, 81, 0.14)',
      info: '#52B788',
      infoSurface: 'rgba(82, 183, 136, 0.16)',
      // The original warm gold — kept for charts and achievement moments,
      // never for semantic "success" text/icons.
      gold: '#FFD23F',
      goldSurface: 'rgba(255, 210, 63, 0.18)',
    },
    pastel: {
      green: '#52B788',
      greenSoft: 'rgba(82, 183, 136, 0.16)',
      rose: '#F2B5D4',
      roseSoft: 'rgba(242, 181, 212, 0.18)',
      violet: '#B8B5FF',
      violetSoft: 'rgba(184, 181, 255, 0.18)',
      cream: '#FAF8F5',
      watercolorA: 'rgba(255, 210, 63, 0.18)',
      watercolorB: 'rgba(242, 181, 212, 0.16)',
      watercolorC: 'rgba(184, 181, 255, 0.16)',
    },
  },
} as const

const light = colors.light

export const palette = {
  navy: light.primary.value,
  navyDark: light.primary.pressed,
  navySoft: light.primary.surface,
  navyBorder: light.primary.border,

  coral: light.accent.primary,
  coralDark: light.accent.pressed,
  coralSoft: light.accent.surface,

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

  brandRed: light.accent.primary,
  brandRedDark: light.accent.pressed,
  brandRedSoft: light.accent.surface,

  accent: light.accent.primary,
  accentDark: light.accent.pressed,
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

// Ombre douce et teintée navy, identique sur les deux plateformes.
//  - iOS    : shadowColor/Opacity/Radius/Offset (rendu de référence).
//  - Android: `elevation` ignore shadowColor → ombre DURE et GRISE de l'OS
//             (halo gris autour des tuiles bento). On n'utilise donc PAS
//             elevation : sous la New Architecture (RN 0.81), `boxShadow`
//             rend une vraie ombre douce ET teintée, calquée sur iOS.
// `boxShadow` : offsetX offsetY blur color  (blur ≈ shadowRadius iOS).
const NAVY = '29, 53, 87' // #1D3557 en RGB (pour rgba dans boxShadow)
const softShadow = (radius: number, opacity: number, y = 2) =>
  Platform.select({
    ios: {
      shadowColor: '#1D3557',
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
    },
    android: {
      // pas d'elevation : on s'appuie sur boxShadow (Fabric) pour éviter le gris.
      boxShadow: `0px ${y}px ${radius}px rgba(${NAVY}, ${opacity})`,
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
  palette.navy,
  palette.orange,
  palette.yellow,
  palette.green,
  palette.rose,
  palette.violet,
] as const

export const fontStack =
  Platform.select({
    web: '"Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    default: undefined,
  })
