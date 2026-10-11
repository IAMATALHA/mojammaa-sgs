import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

// Réparation d'un lien élève → compte parent supprimé (scripts/unlinkOrphanParent.js).
// La base et Auth sont simulées en mémoire : rien ne touche à la production.
const require = createRequire(import.meta.url)
const { phoneDigits, planOrphanUnlink, runUnlinkOrphanParent } = require('../../scripts/lib/orphanParent')

const DELETE = Symbol('delete')
const FieldValue = { delete: () => DELETE, serverTimestamp: () => 'maintenant' }

function world({ docs = {}, logins = {} } = {}) {
  const store = new Map(Object.entries(docs))
  const users = new Map(Object.entries(logins))
  const snap = path => {
    const data = store.get(path)
    return { id: path.split('/').pop(), exists: data !== undefined, data: () => ({ ...data }), get: field => data?.[field] }
  }
  const lines = []
  const state = {
    store, users, lines, deletedLogins: [], backups: [], beforeWrite: null,
    out: { log: text => lines.push(text), error: text => lines.push(text) },
    db: {
      doc: path => ({ path, id: path.split('/').pop(), get: async () => snap(path) }),
      getAll: async (...refs) => refs.map(ref => snap(ref.path)),
      collection: name => ({
        where: (field, op, value) => ({
          select: () => ({
            get: async () => {
              const found = [...store.keys()].filter(key => key.startsWith(`${name}/`)).filter(key => {
                const actual = store.get(key)[field]
                return op === '>' ? typeof actual === 'string' && actual > value : actual === value
              }).map(snap)
              return { docs: found, size: found.length }
            },
          }),
        }),
      }),
      runTransaction: async work => {
        const pending = []
        await work({ get: async ref => snap(ref.path), update: (ref, data) => pending.push([ref.path, data]) })
        for (const [path, data] of pending) {
          const next = { ...store.get(path) }
          for (const [field, value] of Object.entries(data)) {
            if (value === DELETE) delete next[field]
            else next[field] = value
          }
          store.set(path, next)
        }
      },
    },
    auth: {
      getUser: async uid => {
        if (!users.has(uid)) throw Object.assign(new Error('absent'), { code: 'auth/user-not-found' })
        return { uid, metadata: {}, ...users.get(uid) }
      },
      deleteUser: async uid => {
        if (state.failDelete) throw new Error('réseau')
        users.delete(uid)
        state.deletedLogins.push(uid)
      },
    },
  }
  state.run = (...args) => runUnlinkOrphanParent({
    db: state.db, auth: state.auth, FieldValue, args, out: state.out,
    saveBackup: (id, content) => { state.backups.push(content); state.beforeWrite?.(); return `backups/test/${id}.json` },
  })
  state.text = () => lines.join('\n')
  return state
}

const orphan = (extra = {}) => world({
  docs: {
    'eleves/A1': { prenom: 'Élève', nom: 'Test', classe: '2APIC-4', parentUid: 'gone', parentNom: 'Compte Supprimé', parentTel: '0612345678', parentEmail: 'ecole@example.test', ...extra.student },
    'eleves/B2': { prenom: 'Autre', nom: 'Élève', classe: '1APIC-1', parentUid: 'alive', parentNom: 'Parent Actif' },
    'users/alive': { role: 'parent' },
    ...extra.docs,
  },
  logins: { gone: { email: 'supprime@example.test', phoneNumber: '+212612345678' }, alive: { email: 'actif@example.test' }, ...extra.logins },
})

test('numéros comparés sans tenir compte de l’écriture', () => {
  assert.equal(phoneDigits('06 12 34 56 78'), '212612345678')
  assert.equal(phoneDigits('+212 6 12-34-56-78'), '212612345678')
  assert.equal(phoneDigits('00212612345678'), '212612345678')
  assert.equal(phoneDigits(''), '')
})

test('plan : refus quand il n’y a rien à détacher ou que le compte existe', () => {
  assert.equal(planOrphanUnlink({ student: null, profileExists: false }).ok, false)
  assert.equal(planOrphanUnlink({ student: { nom: 'X' }, profileExists: false }).ok, false)
  const kept = planOrphanUnlink({ student: { parentUid: 'u' }, profileExists: true })
  assert.equal(kept.ok, false)
  assert.match(kept.refusal, /existe encore/)
  assert.equal(planOrphanUnlink({ student: { parentUid: 'u' }, profileExists: false, options: { clearContact: true, keepContact: true } }).ok, false)
})

test('plan : seule une coordonnée prouvée être celle du compte supprimé est retirée d’office', () => {
  const student = { parentUid: 'u', parentNom: 'N', parentTel: '0612345678', parentEmail: 'ecole@example.test' }
  const login = { email: 'supprime@example.test', phoneNumber: '+212612345678' }
  const plan = planOrphanUnlink({ student, profileExists: false, login })
  assert.deepEqual(plan.clearFields, ['parentUid', 'parentNom', 'parentTel'])
  assert.deepEqual(plan.keptContact, { parentEmail: 'ecole@example.test' })
  assert.equal(plan.deleteLogin, true)
  // Identifiant déjà supprimé : plus de preuve, les coordonnées restent sauf demande.
  assert.deepEqual(planOrphanUnlink({ student, profileExists: false }).clearFields, ['parentUid', 'parentNom'])
  assert.deepEqual(planOrphanUnlink({ student, profileExists: false, options: { clearContact: true } }).clearFields, ['parentUid', 'parentNom', 'parentTel', 'parentEmail'])
  assert.deepEqual(planOrphanUnlink({ student, profileExists: false, login, options: { keepContact: true } }).clearFields, ['parentUid', 'parentNom'])
})

test('plan : l’identifiant de connexion n’est supprimé que s’il ne sert plus à rien d’autre', () => {
  const student = { parentUid: 'u' }
  const login = { email: 'x@example.test' }
  assert.equal(planOrphanUnlink({ student, profileExists: false, login }).deleteLogin, true)
  assert.equal(planOrphanUnlink({ student, profileExists: false, login, otherLinkedCount: 1 }).deleteLogin, false)
  assert.equal(planOrphanUnlink({ student, profileExists: false, login: { ...login, customClaims: { admin: true } } }).deleteLogin, false)
  assert.equal(planOrphanUnlink({ student, profileExists: false, login, options: { keepLogin: true } }).deleteLogin, false)
  assert.equal(planOrphanUnlink({ student, profileExists: false }).deleteLogin, false)
})

test('sans argument : liste les seuls élèves liés à un compte sans profil, n’écrit rien', async () => {
  const w = orphan()
  const before = JSON.stringify([...w.store])
  assert.equal(await w.run(), 0)
  assert.match(w.text(), /A1 {2}Élève Test · 2APIC-4/)
  assert.doesNotMatch(w.text(), /B2/)
  assert.equal(JSON.stringify([...w.store]), before)
  assert.deepEqual(w.deletedLogins, [])
})

test('sans --commit : le plan est affiché, rien n’est écrit ni supprimé', async () => {
  const w = orphan()
  const before = JSON.stringify([...w.store])
  assert.equal(await w.run('A1'), 0)
  assert.match(w.text(), /Rien n’a été écrit/)
  assert.match(w.text(), /node scripts\/unlinkOrphanParent\.js A1 --commit/)
  assert.equal(JSON.stringify([...w.store]), before)
  assert.deepEqual(w.deletedLogins, [])
  assert.deepEqual(w.backups, [])
})

test('--commit : lien retiré, coordonnée du compte retirée, e-mail de l’établissement gardé, identifiant supprimé', async () => {
  const w = orphan()
  assert.equal(await w.run('A1', '--commit'), 0)
  assert.deepEqual(w.store.get('eleves/A1'), { prenom: 'Élève', nom: 'Test', classe: '2APIC-4', parentEmail: 'ecole@example.test', updatedAt: 'maintenant' })
  assert.deepEqual(w.deletedLogins, ['gone'])
  assert.deepEqual(w.backups[0].removed, { parentUid: 'gone', parentNom: 'Compte Supprimé', parentTel: '0612345678' })
  // L'autre élève et son compte ne sont pas touchés.
  assert.equal(w.store.get('eleves/B2').parentUid, 'alive')
  assert.ok(w.users.has('alive'))
})

test('--commit refusé si le compte existe encore : aucune écriture', async () => {
  const w = orphan()
  const before = JSON.stringify([...w.store])
  assert.equal(await w.run('B2', '--commit'), 1)
  assert.match(w.text(), /existe encore/)
  assert.equal(JSON.stringify([...w.store]), before)
  assert.deepEqual(w.deletedLogins, [])
})

test('--commit : un autre élève encore lié au même compte → identifiant gardé', async () => {
  const w = orphan({ docs: { 'eleves/C3': { prenom: 'Frère', nom: 'Test', classe: '1APIC-2', parentUid: 'gone' } } })
  assert.equal(await w.run('A1', '--commit'), 0)
  assert.equal(w.store.get('eleves/A1').parentUid, undefined)
  assert.equal(w.store.get('eleves/C3').parentUid, 'gone')
  assert.deepEqual(w.deletedLogins, [])
})

test('--commit : fiche modifiée ou compte recréé entre la lecture et l’écriture → rien n’est écrit', async () => {
  const relinked = orphan()
  relinked.beforeWrite = () => relinked.store.set('eleves/A1', { ...relinked.store.get('eleves/A1'), parentUid: 'nouveau-parent' })
  assert.equal(await relinked.run('A1', '--commit'), 1)
  assert.equal(relinked.store.get('eleves/A1').parentUid, 'nouveau-parent')
  assert.deepEqual(relinked.deletedLogins, [])

  const restored = orphan()
  restored.beforeWrite = () => restored.store.set('users/gone', { role: 'parent' })
  assert.equal(await restored.run('A1', '--commit'), 1)
  assert.equal(restored.store.get('eleves/A1').parentUid, 'gone')
  assert.deepEqual(restored.deletedLogins, [])
})

test('--commit : suppression de l’identifiant impossible → signalée, avec l’identifiant à traiter à la main', async () => {
  const w = orphan()
  w.failDelete = true
  assert.equal(await w.run('A1', '--commit'), 1)
  assert.equal(w.store.get('eleves/A1').parentUid, undefined)
  assert.match(w.text(), /NON supprimé/)
  assert.match(w.text(), /Authentication : gone/)
})

test('garde-fous de la ligne de commande', async () => {
  assert.equal(await orphan().run('--commit'), 1)
  assert.equal(await orphan().run('A1', '--force'), 1)
  assert.equal(await orphan().run('INCONNU', '--commit'), 1)
  const options = orphan()
  assert.equal(await options.run('A1', '--commit', '--keep-login', '--clear-contact'), 0)
  assert.deepEqual(options.deletedLogins, [])
  assert.equal(options.store.get('eleves/A1').parentEmail, undefined)
})
