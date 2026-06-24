/**
 * Shared formatting helpers.
 *
 * Dates/times are formatted against the *active* app language so the UI no
 * longer leaks French (`fr-FR`) into Arabic / English sessions. Functions read
 * `i18n.language` at call time; since screens re-render through `useTranslation`
 * when the language changes, the displayed values update automatically.
 *
 * `lang` can be passed explicitly (tests, edge cases); otherwise it defaults to
 * the current i18n language.
 */

import i18n from '../i18n'

// Morocco-flavoured locales: Arabic → Moroccan, English → day/month ordering
// that matches the French layout the rest of the UI assumes.
const LOCALE: Record<string, string> = {
  fr: 'fr-FR',
  ar: 'ar-MA',
  en: 'en-GB',
}

export function localeFor(lang?: string): string {
  const key = lang ?? i18n.language ?? 'fr'
  return LOCALE[key] ?? 'fr-FR'
}

/** Normalises Firestore Timestamps, Date, ISO strings and epoch numbers. */
export function toDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const d = (value as { toDate: () => unknown }).toDate()
    return d instanceof Date && !isNaN(d.getTime()) ? d : null
  }
  if (typeof value === 'number') {
    // 0 (and other falsy epochs) come from legacy/unset records — treat as
    // missing rather than rendering 1 Jan 1970.
    if (!value) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    if (!value.trim()) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

// ── Greeting ──────────────────────────────────────────────────────────────
export function greetingKey(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'greeting.morning'
  if (h < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

// ── Colour ────────────────────────────────────────────────────────────────
export function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Dates ─────────────────────────────────────────────────────────────────

/**
 * Message-list timestamp: shows the time for today's items, otherwise a short
 * `day month` label. Accepts Firestore Timestamps and plain dates.
 */
export function formatTimestamp(value: unknown, lang?: string): string {
  const d = toDate(value)
  if (!d) return ''
  const locale = localeFor(lang)
  if (isSameDay(d, new Date())) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** Short `day month` label (e.g. announcement meta). */
export function formatDayMonth(value: unknown, lang?: string): string {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short' })
}

/** Full `weekday day month [year]` label for detail sheets. */
export function formatLongDate(value: unknown, lang?: string, withYear = false): string {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleDateString(localeFor(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/** Two-line date chip used by EventCard: `{ day: "12", month: "MAI" }`. */
export function formatDateChip(value: unknown, lang?: string): { day: string; month: string } {
  const d = toDate(value)
  if (!d) return { day: '--', month: '' }
  const locale = localeFor(lang)
  return {
    day: d.toLocaleDateString(locale, { day: '2-digit' }),
    month: d.toLocaleDateString(locale, { month: 'short' }).toUpperCase().replace('.', ''),
  }
}

/**
 * Relative time ("just now", "5 min ago", …) falling back to a short date past
 * a week. Relative strings come from the `time.*` i18n keys.
 */
export function formatRelative(value: unknown, lang?: string): string {
  const d = toDate(value)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return i18n.t('time.justNow')
  if (mins < 60) return i18n.t('time.minutesAgo', { count: mins })
  if (hours < 24) return i18n.t('time.hoursAgo', { count: hours })
  if (days < 7) return i18n.t('time.daysAgo', { count: days })
  return formatDayMonth(d, lang)
}

/** Initiales (2 max) d'un nom complet — pour les avatars de la messagerie. */
export function initialsOf(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}
