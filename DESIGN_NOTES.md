# Mojammaa SGS Design Notes

## Direction

The dashboard visual language now follows the Arabic poster inspiration through an iOS lens: warm cream canvas, navy structure, coral emphasis, and very small orange/yellow status points. The goal is school-friendly warmth without turning the app into a decorative poster.

## Color

The core palette is `#F5F1E8` cream, `#1D3557` navy, `#E63946` coral, `#F77F00` orange, and `#FCBF49` yellow. Navy is used for text and primary action structure, coral for urgent/emphasis moments, and orange/yellow for small status indicators only.

## Type And Shape

Poppins remains the app font as the closest loaded match to a San Francisco-style hierarchy. Weight does most of the work: 400 body, 500 secondary emphasis, 600 titles, 700/800 numbers and initials. Cards now sit closer to a consistent 12px radius with soft floating depth.

## Motion

Dashboard press states use Moti timing transitions at 200ms with a small `0.98` scale and light opacity change. Bottom tabs use a subtle navy/coral active capsule and orange/yellow dots as status accents.

## Dark Mode

`src/theme/designTokens.ts` now exposes semantic groups (`text`, `surface`, `separator`, `accent`, `status`) under `colors.light`. A dark theme can mirror that shape without changing the existing `Theme` interface.
