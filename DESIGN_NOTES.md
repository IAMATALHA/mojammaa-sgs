# Mojammaa SGS Design Notes

## Direction

The dashboard visual language now follows a restrained iOS-style system: white as the primary canvas, grouped gray surfaces for secondary areas, hairline separators, and very soft shadows only where depth helps scanning.

## Color

The single accent is the existing Mojammaa red, `#E53935`. It stays reserved for primary actions, active/current states, urgent indicators, and small brand moments. Former blue, green, and gold dashboard tints now resolve to neutral grays so the interface feels calmer and more native.

## Type And Shape

Poppins remains the app font. Hierarchy comes mostly from weight: 400 for body, 500 for secondary emphasis, 600 for titles, 700/800 for numbers and initials. Corners follow the stepped 12/16/22/28 scale, with larger cards using 22px and compact controls using 12-16px.

## Motion

Dashboard press states use Moti timing transitions at 200ms with a small `0.98` scale and light opacity change. Loading and entry motion stays quiet and linear.

## Dark Mode

`src/theme/designTokens.ts` now exposes semantic groups (`text`, `surface`, `separator`, `accent`, `status`) under `colors.light`. A dark theme can mirror that shape without changing the existing `Theme` interface.
