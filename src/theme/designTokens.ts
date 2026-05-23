/**
 * Apple-style design tokens for Mojammaa SGS.
 *
 * The light theme blends the school poster inspiration with an iOS system:
 * warm cream surfaces, navy structure, coral accents, and orange/yellow
 * status indicators. The shape below is semantic so dark mode can mirror it.
 */

import { Platform } from 'react-native'

export const colors = {
  light: {
    // Texte : warm-dark plutôt que navy (le navy n'existe pas dans le logo)
    text: {
      primary:   '#2A1F1A',                        // warm dark — lisible sur cream
      secondary: 'rgba(42, 31, 26, 0.72)',
      tertiary:  'rgba(42, 31, 26, 0.45)',
      inverse:   '#FFFFFF',
    },
    surface: {
      primary:   '#F5F1E8',                        // cream du logo
      secondary: 'rgba(255, 252, 247, 0.80)',
      tertiary:  'rgba(42, 31, 26, 0.06)',
      elevated:  '#FFFFFF',
      grouped:   '#EFE8DA',
    },
    separator:       'rgba(42, 31, 26, 0.08)',
    separatorStrong: 'rgba(42, 31, 26, 0.18)',
    // PRIMARY = corail #E63946 (le M rouge du logo)
    primary: {
      value:         '#E63946',
      pressed:       '#C92F3B',
      surface:       'rgba(230, 57, 70, 0.10)',
      surfaceStrong: 'rgba(230, 57, 70, 0.16)',
      border:        'rgba(230, 57, 70, 0.26)',
    },
    // ACCENT = orange #F77F00 (la fleur orange du logo)
    accent: {
      primary:       '#F77F00',
      pressed:       '#D86E00',
      surface:       'rgba(247, 127, 0, 0.10)',
      surfaceStrong: 'rgba(247, 127, 0, 0.16)',
      border:        'rgba(247, 127, 0, 0.26)',
    },
    status: {
      success:        '#FCBF49',                   // jaune (M jaune du logo)
      successSurface: 'rgba(252, 191, 73, 0.18)',
      warning:        '#F77F00',                   // orange
      warningSurface: 'rgba(247, 127, 0, 0.14)',
      danger:         '#E63946',                   // corail = primary
      dangerSurface:  'rgba(230, 57, 70, 0.10)',
      info:           '#457B9D',                   // bleu seul rescapé (info neutre)
      infoSurface:    'rgba(69, 123, 157, 0.12)',
    },
  },
} as const

const light = colors.light

// Flat aliases preserve the current app contract while the semantic tokens
// above become the source of truth for new work.
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
  yellow: light.status.success,
  yellowSoft: light.status.successSurface,

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
  sm: 10,
  md: 12,
  lg: 12,
  xl: 18,
  pill: 999,
} as const

export const fonts = {
  regular:  'Poppins_400Regular',
  medium:   'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold:     'Poppins_700Bold',
  black:    'Poppins_800ExtraBold',

  // Brand calligraphy — pour le nom de l'école et grandes signatures
  script:   'GreatVibes_400Regular',

  // Arabe propre — pour les textes en arabe (le système trouve mal le
  // bon glyphe avec Poppins, Cairo est conçu pour l'arabe).
  arabic:   'Cairo_400Regular',
  arabicSemi:'Cairo_600SemiBold',
  arabicBold:'Cairo_700Bold',
} as const

export const fontSize = {
  caption: 11,
  small: 12,
  body: 14,
  bodyLg: 15,
  title: 17,
  h3: 20,
  h2: 24,
  h1: 28,
  display: 34,
} as const

const iosShadow = (shadowRadius: number, opacity: number, y = 2) => ({
  shadowColor: '#000000',
  shadowOpacity: opacity,
  shadowRadius,
  shadowOffset: { width: 0, height: y },
})

export const shadows = {
  none: { ...iosShadow(0, 0, 0), elevation: 0 },
  xs: { ...iosShadow(8, 0.06, 2), elevation: 1 },
  sm: { ...iosShadow(14, 0.08, 4), elevation: 2 },
  md: { ...iosShadow(18, 0.10, 6), elevation: 3 },
  lg: { ...iosShadow(24, 0.12, 10), elevation: 4 },
} as const

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 }
export const minTouch = 44

export const chartColors = [
  palette.navy,
  palette.coral,
  palette.orange,
  palette.yellow,
] as const

export const fontStack =
  Platform.select({
    web: '"Poppins", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    default: undefined,
  })
