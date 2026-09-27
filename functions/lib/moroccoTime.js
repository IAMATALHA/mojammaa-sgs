'use strict'

// Heure légale du Maroc, partagée par toutes les fonctions.
// Décret 2.26.530 : le 20/09/2026 à 02:00 GMT+1, retour définitif à GMT.
// L'ICU du runtime Node 22 (tzdata 2025b) applique encore GMT+1 à
// Africa/Casablanca : après cette date on formate en UTC ; avant, on garde
// les règles historiques de Casablanca (GMT+1, GMT pendant Ramadan).
// Source : https://bdj.mmsp.gov.ma/Ar/Document/10664-D%C3%A9cret-n-2-26-530du-9-moharrem-1448-25-juin-2026.aspx
const GMT_EFFECTIVE_AT = Date.parse('2026-09-20T01:00:00.000Z')

const OPTIONS = {
  weekday: 'long',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}
const HISTORIC_FORMATTER = new Intl.DateTimeFormat('en-CA', { ...OPTIONS, timeZone: 'Africa/Casablanca' })
const GMT_FORMATTER = new Intl.DateTimeFormat('en-CA', { ...OPTIONS, timeZone: 'UTC' })

/** { weekday, year, month, day, hour, minute } à l'heure légale marocaine (chaînes). */
function moroccoParts(date = new Date()) {
  const formatter = date.getTime() >= GMT_EFFECTIVE_AT ? GMT_FORMATTER : HISTORIC_FORMATTER
  return Object.fromEntries(formatter.formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]))
}

/** Date du jour au Maroc, AAAA-MM-JJ. */
function moroccoDate(date = new Date()) {
  const parts = moroccoParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

module.exports = { GMT_EFFECTIVE_AT, moroccoParts, moroccoDate }
