import assert from 'node:assert/strict'
import cache from '../../functions/lib/ttlCache.js'

const { createTtlCache } = cache

// Une horloge pilotée : le test ne dépend d'aucune attente réelle.
function setup(options = {}) {
  let time = 1_000
  const calls = []
  const cached = createTtlCache({ ttlMs: 60_000, now: () => time, ...options })
  const load = key => cached(key, async () => { calls.push(key); return `${key}#${calls.length}` })
  return { load, calls, advance: ms => { time += ms } }
}

// Dans la durée de vie : une seule lecture, même pour des appels simultanés.
{
  const { load, calls, advance } = setup()
  const [a, b] = await Promise.all([load('notes|2026-2027'), load('notes|2026-2027')])
  assert.equal(a, b)
  advance(59_999)
  assert.equal(await load('notes|2026-2027'), a)
  assert.equal(calls.length, 1)
}

// Passé le délai : la donnée est relue.
{
  const { load, calls, advance } = setup()
  const first = await load('eleves')
  advance(60_000)
  assert.notEqual(await load('eleves'), first)
  assert.equal(calls.length, 2)
}

// Des clés différentes ne se partagent rien.
{
  const { load, calls } = setup()
  assert.notEqual(await load('absences|a|b'), await load('absences|a|c'))
  assert.equal(calls.length, 2)
}

// Un échec n'est pas gardé : l'appel suivant relit.
{
  let time = 0
  let attempts = 0
  const cached = createTtlCache({ ttlMs: 60_000, now: () => time })
  const flaky = () => cached('users', async () => { attempts++; if (attempts === 1) throw new Error('indisponible'); return 'ok' })
  await assert.rejects(flaky(), /indisponible/)
  assert.equal(await flaky(), 'ok')
  assert.equal(attempts, 2)
}

// Borne : la plus ancienne entrée sort, les plus récentes restent en cache.
{
  const { load, calls } = setup({ maxEntries: 2 })
  await load('a'); await load('b'); await load('c')
  await load('b'); await load('c')
  assert.equal(calls.length, 3)
  await load('a')
  assert.equal(calls.length, 4)
}

console.log('✅ ttlCache — partage, expiration, échec non gardé, borne')
