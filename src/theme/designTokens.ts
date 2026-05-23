/**
 * Design tokens — SaaS brand identity for the Mojammaa mobile app.
 *
 * 90/10 rule: ~90% neutral whites/grays, ~10% brand accents.
 *   - Red  (#E53935) → primary actions, active nav, alerts, badges
 *   - Gold (#FFC107) → progress, stats highlights, micro accents
 *
 * Everything in this file is JS-serializable and dark-mode-ready
 * (we expose `light` for now; a `dark` palette can be added later
 * with the same shape).
 */

import { Platform } from 'react-native'

// ── Palette ───────────────────────────────────────────────────────────────
export const palette = {
  // Brand
  brandRed:    '#E53935',
  brandRedDark:'#C62828',
  brandRedSoft:'#FDECEA',
  gold:        '#FFC107',
  goldSoft:    '#FFF6DA',

  // Neutrals
  white:       '#FFFFFF',
  surface:     '#F8F9FB',
  surfaceAlt:  '#F1F3F7',
  border:      '#ECEEF2',
  borderStrong:'#DDE1E8',

  // Text
  text:        '#1A1D2D',
  textSoft:    '#6B7280',
  textMuted:   '#9AA0AB',

  // Semantic
  success:     '#22C55E',
  successSoft: '#E7F8EE',
  warning:     '#F59E0B',
  warningSoft: '#FEF3DA',
  danger:      '#E53935',
  dangerSoft:  '#FDECEA',
  info:        '#3B82F6',
  infoSoft:    '#E6EEFB',
} as const

// ── Spacing (8pt grid) ────────────────────────────────────────────────────
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  huge: 48,
} as const

// ── Radius scale ──────────────────────────────────────────────────────────
export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  pill: 999,
} as const

// ── Typography ────────────────────────────────────────────────────────────
//
// We assume Poppins is loaded (see App.tsx). On platforms / builds where
// Poppins is not available the system fallback (`System`) keeps the app
// readable instead of crashing.
export const fonts = {
  regular:  'Poppins_400Regular',
  medium:   'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold:     'Poppins_700Bold',
  black:    'Poppins_800ExtraBold',
} as const

export const fontSize = {
  caption: 11,
  small:   12,
  body:    14,
  bodyLg:  15,
  title:   17,
  h3:      20,
  h2:      24,
  h1:      28,
  display: 32,
} as const

// ── Elevation (subtle, premium) ───────────────────────────────────────────
// iOS uses shadow*, Android uses elevation. Keep both in sync.
const ios = (radius: number, opacity: number, y = 4) => ({
  shadowColor:   '#0F172A',
  shadowOpacity: opacity,
  shadowRadius:  radius,
  shadowOffset:  { width: 0, height: y },
})

export const shadows = {
  none:  { ...ios(0, 0, 0), elevation: 0 },
  xs:    { ...ios(4, 0.04, 2), elevation: 1 },
  sm:    { ...ios(8, 0.06, 3), elevation: 2 },
  md:    { ...ios(14, 0.08, 6), elevation: 4 },
  lg:    { ...ios(22, 0.10, 10), elevation: 8 },
} as const

// ── Hit targets (a11y) ────────────────────────────────────────────────────
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 }
export const minTouch = 44

// ── Charts / progress palette ─────────────────────────────────────────────
export const chartColors = [
  palette.brandRed,
  palette.gold,
  palette.info,
  palette.success,
  palette.warning,
] as const

// ── Web fallback for fontFamily on RN-web (if ever used) ──────────────────
export const fontStack =
  Platform.select({
    web: '"Poppins", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    default: undefined,
  })
