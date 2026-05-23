/**
 * Apple-style design tokens for Mojammaa SGS.
 *
 * The light theme intentionally uses one brand accent and layered iOS-like
 * grays. The shape below is semantic so a dark theme can mirror it later.
 */

import { Platform } from 'react-native'

export const colors = {
  light: {
    text: {
      primary: '#000000',
      secondary: 'rgba(60, 60, 67, 0.72)',
      tertiary: 'rgba(60, 60, 67, 0.42)',
      inverse: '#FFFFFF',
    },
    surface: {
      primary: '#FFFFFF',
      secondary: '#F2F2F7',
      tertiary: '#E5E5EA',
      elevated: '#FFFFFF',
      grouped: '#F9F9FB',
    },
    separator: 'rgba(0, 0, 0, 0.06)',
    separatorStrong: 'rgba(60, 60, 67, 0.18)',
    accent: {
      primary: '#E53935',
      pressed: '#C62828',
      surface: 'rgba(229, 57, 53, 0.10)',
      surfaceStrong: 'rgba(229, 57, 53, 0.16)',
      border: 'rgba(229, 57, 53, 0.24)',
    },
    status: {
      success: '#3C3C43',
      successSurface: '#F2F2F7',
      warning: '#636366',
      warningSurface: '#F2F2F7',
      danger: '#E53935',
      dangerSurface: 'rgba(229, 57, 53, 0.10)',
      info: '#636366',
      infoSurface: '#F2F2F7',
    },
  },
} as const

const light = colors.light

// Flat aliases preserve the current app contract while the semantic tokens
// above become the source of truth for new work.
export const palette = {
  brandRed: light.accent.primary,
  brandRedDark: light.accent.pressed,
  brandRedSoft: light.accent.surface,

  accent: light.accent.primary,
  accentDark: light.accent.pressed,
  accentSoft: light.accent.surface,
  accentSoftStrong: light.accent.surfaceStrong,
  accentBorder: light.accent.border,

  white: light.surface.primary,
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
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
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
  xs: { ...iosShadow(4, 0.03, 1), elevation: 0 },
  sm: { ...iosShadow(8, 0.04, 2), elevation: 1 },
  md: { ...iosShadow(12, 0.05, 3), elevation: 2 },
  lg: { ...iosShadow(16, 0.06, 4), elevation: 2 },
} as const

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 }
export const minTouch = 44

export const chartColors = [
  palette.accent,
  palette.textSoft,
  palette.textMuted,
  palette.borderStrong,
] as const

export const fontStack =
  Platform.select({
    web: '"Poppins", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    default: undefined,
  })
