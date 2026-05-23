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
    text: {
      primary: '#1D3557',
      secondary: 'rgba(29, 53, 87, 0.72)',
      tertiary: 'rgba(29, 53, 87, 0.44)',
      inverse: '#FFFFFF',
    },
    surface: {
      primary: '#F5F1E8',
      secondary: 'rgba(255, 252, 247, 0.76)',
      tertiary: 'rgba(29, 53, 87, 0.08)',
      elevated: 'rgba(255, 252, 247, 0.94)',
      grouped: '#EFE8DA',
    },
    separator: 'rgba(29, 53, 87, 0.10)',
    separatorStrong: 'rgba(29, 53, 87, 0.20)',
    primary: {
      value: '#1D3557',
      pressed: '#14243D',
      surface: 'rgba(29, 53, 87, 0.10)',
      surfaceStrong: 'rgba(29, 53, 87, 0.16)',
      border: 'rgba(29, 53, 87, 0.22)',
    },
    accent: {
      primary: '#E63946',
      pressed: '#C92F3B',
      surface: 'rgba(230, 57, 70, 0.10)',
      surfaceStrong: 'rgba(230, 57, 70, 0.16)',
      border: 'rgba(230, 57, 70, 0.24)',
    },
    status: {
      success: '#FCBF49',
      successSurface: 'rgba(252, 191, 73, 0.18)',
      warning: '#F77F00',
      warningSurface: 'rgba(247, 127, 0, 0.14)',
      danger: '#E63946',
      dangerSurface: 'rgba(230, 57, 70, 0.10)',
      info: '#457B9D',
      infoSurface: 'rgba(69, 123, 157, 0.12)',
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
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  black: 'Poppins_800ExtraBold',
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
