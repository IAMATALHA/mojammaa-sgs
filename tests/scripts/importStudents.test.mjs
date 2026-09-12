import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { parseRows } = require('../../scripts/importStudents.js')

test('listes annuelles : toutes les lettres de préfixe, identité et classe conservées', () => {
  const codes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => `${letter}123456789`)
  const rows = codes.map((code, i) => [i + 1, code, 'Nom Test', 'Prénom Test', '', '2012-01-02'])
  const parsed = parseRows(rows, 'ListEleve_test.xlsx', '3APIC-2')
  assert.deepEqual(parsed.map(s => s.codeMassar), codes)
  assert.ok(parsed.every(s => s.nom === 'Nom Test' && s.prenom === 'Prénom Test'
    && s.classe === '3APIC-2' && s.dateNaissance === '2012-01-02'))
})

test('anciens exports notes : préfixe autre que A et date historique', () => {
  const parsed = parseRows([[1, 'K123456789', 'Nom Prénom', '02-01-2012']],
    'export_notesCC_2APIC-4_0019.xlsx', 'NotesCC')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].codeMassar, 'K123456789')
  assert.equal(parsed[0].dateNaissance, '2012-01-02')
  assert.equal(parsed[0].classe, '2APIC-4')
})

test('une ligne élève invalide bloque la liste au lieu de disparaître silencieusement', () => {
  for (const code of ['', 'INVALID', '123456789', 'AA123456789', 'A12']) {
    assert.throws(() => parseRows([[1, code, 'Nom', 'Prénom', '', '2012-01-02']],
      'ListEleve_test.xlsx', '1APIC-1'), /Code MASSAR invalide/)
  }
  assert.throws(() => parseRows([[1, 'B123456789', 'Nom', '', '', '2012-01-02']],
    'ListEleve_test.xlsx', '1APIC-1'), /Identité incomplète/)
})
