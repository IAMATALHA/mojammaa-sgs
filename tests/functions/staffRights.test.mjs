import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { STAFF_RIGHTS, EXPLICIT_RIGHTS, hasRight } = require('../../functions/staffRights')
const root = fileURLToPath(new URL('../..', import.meta.url))
// Les commentaires citent des clés et des apostrophes : on ne lit que le code.
const withoutComments = text => text.replace(/\/\/.*$/gm, '')

test('admin : tous les droits ; staff : ceux de sa fiche ; les autres rôles : aucun', () => {
  const staff = { role: 'staff', droits: ['absences.voir', 'sortie'] }
  assert.equal(hasRight({ role: 'admin' }, 'notes.voir'), true)
  // Droits qui touchent aux accès : portés, même par un admin.
  assert.equal(hasRight({ role: 'admin' }, 'codes.professeurs'), false)
  assert.equal(hasRight({ role: 'admin', droits: ['codes.professeurs'] }, 'codes.professeurs'), true)
  assert.equal(hasRight(staff, 'absences.voir'), true)
  assert.equal(hasRight(staff, 'absences.saisir'), false)
  assert.equal(hasRight({ role: 'staff' }, 'absences.voir'), false)
  assert.equal(hasRight({ role: 'staff', droits: 'absences.voir sortie' }, 'sortie'), false, 'un texte n’est pas une liste')
  assert.equal(hasRight({ role: 'professeur', droits: ['absences.voir'] }, 'absences.voir'), false)
  assert.equal(hasRight({ role: 'parent', droits: STAFF_RIGHTS }, 'eleves.voir'), false)
  assert.equal(hasRight(undefined, 'eleves.voir'), false)
})

test('une clé inconnue n’ouvre rien, même à un admin : elle signale une faute de frappe', () => {
  assert.equal(hasRight({ role: 'admin' }, 'absences.modifier'), false)
  assert.equal(hasRight({ role: 'staff', droits: ['tout'] }, 'tout'), false)
})

test('les règles Firestore n’emploient que des clés de la liste', () => {
  const rules = withoutComments(readFileSync(`${root}firestore.rules`, 'utf8'))
  const used = [...new Set([...rules.matchAll(/\bcan\('([^']*)'\)/g)].map(match => match[1]))]
  assert.ok(used.length > 0, 'les règles ouvrent au moins une porte au personnel')
  assert.deepEqual(used.filter(key => !STAFF_RIGHTS.includes(key)), [])
  // can() donne tout à l'admin : un droit à porter explicitement n'y a pas sa place.
  assert.deepEqual(used.filter(key => EXPLICIT_RIGHTS.includes(key)), [])
  // Aucun appel avec autre chose qu'une clé écrite en toutes lettres.
  assert.equal((rules.match(/\bcan\(/g) ?? []).length, [...rules.matchAll(/\bcan\('[^']*'\)/g)].length + 1, 'seule la définition de can() prend un paramètre libre')
})

// La liste qui fait foi vit dans le dépôt du back-office. Présent à côté de
// celui-ci (dossier de travail ou dépôt principal), on compare ; sinon le test
// le dit au lieu de passer en silence.
const sources = ['../mojammaa-admin-staff', '../mojammaa-admin'].map(dir => `${root}${dir}/functions/src/staffRights.ts`)
const source = sources.find(path => existsSync(path) && readFileSync(path, 'utf8').includes('STAFF_RIGHTS'))
test('même liste de clés que mojammaa-admin (staffRights.ts)', { skip: source ? false : 'dépôt mojammaa-admin absent à côté de celui-ci' }, () => {
  const block = readFileSync(source, 'utf8').match(/export const STAFF_RIGHTS = \[([\s\S]*?)\] as const/)
  assert.ok(block, 'liste introuvable dans staffRights.ts')
  assert.deepEqual([...withoutComments(block[1]).matchAll(/'([^']+)'/g)].map(match => match[1]), STAFF_RIGHTS)
  const text = withoutComments(readFileSync(source, 'utf8'))
  assert.match(text, /MANAGE_RIGHT: StaffRight = 'comptes\.gerer'/)
  assert.match(text, /EXPLICIT_RIGHTS: readonly StaffRight\[\] = \[MANAGE_RIGHT, 'codes\.professeurs'\]/)
  assert.deepEqual(EXPLICIT_RIGHTS, ['comptes.gerer', 'codes.professeurs'])
})
