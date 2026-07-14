/**
 * ThemeContext — identité unifiée dérivée du logo Mojammaa.
 *
 * Tous les rôles partagent le rouge, l'or, l'orange et les surfaces crème du
 * logo. Les rôles restent différenciés par leurs icônes, contenus et statuts.
 *
 * Public shape is preserved (`primary`, `primarySurface`, spacing,
 * radius, fonts) so every existing screen keeps compiling — they
 * just inherit the new look automatically.
 */

import React, { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { palette, spacing, radius, fonts, shadows, fontSize } from '../theme/designTokens'

export interface Theme {
  // Brand
  primary:         string
  primarySurface:  string
  primaryBorder:   string
  primaryDark:     string
  accent:          string
  accentSurface:   string
  green:           string
  greenSurface:    string
  rose:            string
  roseSurface:     string
  violet:          string
  violetSurface:   string
  cream:           string
  watercolorA:     string
  watercolorB:     string
  watercolorC:     string

  // Surfaces
  bg:              string
  surface:         string
  surfaceAlt:      string
  card:            string
  border:          string
  borderStrong:    string
  white:           string

  // Text
  text:            string
  textSoft:        string
  textMuted:       string

  // Semantic
  danger:          string
  dangerSurface:   string
  warning:         string
  warningSurface:  string
  success:         string
  successSurface:  string
  info:            string
  infoSurface:     string

  // Typography
  fonts: typeof fonts
  fontSize: typeof fontSize

  // Layout primitives
  spacing: typeof spacing
  radius:  typeof radius
  shadows: typeof shadows
}

const THEME: Theme = {
  primary:        palette.brandRed,
  primarySurface: palette.brandRedSoft,
  primaryBorder:  palette.brandRedBorder,
  primaryDark:    palette.brandRedDark,
  accent:         palette.accent,
  accentSurface:  palette.accentSoft,
  green:          palette.green,
  greenSurface:   palette.greenSoft,
  rose:           palette.rose,
  roseSurface:    palette.roseSoft,
  violet:         palette.violet,
  violetSurface:  palette.violetSoft,
  cream:          palette.cream,
  watercolorA:    palette.watercolorA,
  watercolorB:    palette.watercolorB,
  watercolorC:    palette.watercolorC,

  bg:             palette.bg,
  surface:        palette.surface,
  surfaceAlt:     palette.surfaceAlt,
  card:           palette.elevated,
  border:         palette.border,
  borderStrong:   palette.borderStrong,
  white:          palette.white,

  text:           palette.text,
  textSoft:       palette.textSoft,
  textMuted:      palette.textMuted,

  danger:         palette.danger,
  dangerSurface:  palette.dangerSoft,
  warning:        palette.warning,
  warningSurface: palette.warningSoft,
  success:        palette.success,
  successSurface: palette.successSoft,
  info:           palette.info,
  infoSurface:    palette.infoSoft,

  fonts,
  fontSize,
  spacing,
  radius,
  shadows,
}

const ThemeContext = createContext<Theme>(THEME)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => THEME, [])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
