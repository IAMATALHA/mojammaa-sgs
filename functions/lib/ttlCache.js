/**
 * Petit cache en mémoire à durée de vie courte, propre à une instance.
 *
 * `cached(clé, charger)` rend la même promesse tant que l'entrée a moins de
 * `ttlMs` : les appels rapprochés — et les appels simultanés — partagent une
 * seule lecture. Un chargement en échec n'est pas gardé. Le nombre d'entrées
 * est borné : la plus ancienne sort.
 */
function createTtlCache({ ttlMs, maxEntries = 16, now = Date.now }) {
  const entries = new Map()
  return function cached(key, load) {
    const hit = entries.get(key)
    if (hit && now() - hit.at < ttlMs) return hit.value
    const value = Promise.resolve().then(load)
    entries.delete(key) // remis en fin de file : l'ordre de la Map suit l'âge
    entries.set(key, { at: now(), value })
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key) })
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    return value
  }
}

module.exports = { createTtlCache }
