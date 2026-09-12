import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildSchedule,
  parseArgs,
  publicSummary,
  validateManifest,
  validatePasswords,
} = require('../../scripts/provisionStaffPilot.js')

function manifest() {
  return {
    projectId: 'mojammaa-sgs',
    provisioningTag: 'staff-pilot-2026-09-01',
    provisionalFor: '2026-09-01',
    cleanupAfter: '2026-09-02T18:00:00+01:00',
    users: [
      {
        email: 'teacher1@example.test', nom: 'Prof', prenom: 'Un',
        role: 'professeur', matiere: 'Mathématiques', cycle: 'college',
        testClass: 'TEST-2026-09-01-P01',
      },
      {
        email: 'teacher2@example.test', nom: 'Prof', prenom: 'Deux',
        role: 'professeur', matiere: '', cycle: 'primaire',
        testClass: 'TEST-2026-09-01-P02',
      },
      { email: 'admin@example.test', nom: 'Direction', prenom: 'Test', role: 'admin' },
    ],
  }
}

test('normalise le manifeste et génère trois créneaux mardi par professeur', () => {
  const value = validateManifest(manifest())
  assert.equal(value.users.length, 3)
  assert.equal(value.users[0].weeklySlots.length, 3)
  assert.equal(value.users[0].weeklySlots.every(slot => slot.day === 'tuesday'), true)
  assert.equal(value.users[0].weeklySlots.every(slot => slot.classe === 'TEST-2026-09-01-P01'), true)
  assert.deepEqual(value.users[2].weeklySlots, [])
})

test('refuse les emails et classes synthétiques dupliqués', () => {
  const duplicateEmail = manifest()
  duplicateEmail.users[1].email = duplicateEmail.users[0].email
  assert.throws(() => validateManifest(duplicateEmail), /dupliquée/)

  const duplicateClass = manifest()
  duplicateClass.users[1].testClass = duplicateClass.users[0].testClass
  assert.throws(() => validateManifest(duplicateClass), /Classe test dupliquée/)
})

test('refuse toute classe réelle et tout EDT admin', () => {
  const realClass = manifest()
  realClass.users[0].testClass = '1APIC-3'
  assert.throws(() => validateManifest(realClass), /Classe test invalide/)

  const adminSchedule = manifest()
  adminSchedule.users[2].testClass = 'TEST-2026-09-01-ADMIN'
  assert.throws(() => validateManifest(adminSchedule), /admin ne doit pas recevoir/)
})

test('la sortie publique ne contient aucune PII ni mot de passe', () => {
  const value = validateManifest(manifest())
  const output = JSON.stringify(publicSummary(value, 'DRY_RUN', { status: 'PASS' }))
  assert.equal(output.includes('@'), false)
  assert.equal(output.includes('teacher1'), false)
  assert.equal(output.includes('password'), false)
  assert.deepEqual(JSON.parse(output), {
    mode: 'DRY_RUN', project: 'mojammaa-sgs', accounts: 3,
    teachers: 2, admins: 1, schedules: 2, slots: 6,
    realClassesReferenced: 0, status: 'PASS',
  })
})

test('parse les confirmations explicites', () => {
  assert.deepEqual(parseArgs([
    '--manifest', '.secrets/pilot.json', '--password-file=.secrets/pilot.password',
    '--commit', '--confirm-project', 'mojammaa-sgs', '--confirm-create=11',
  ]), {
    manifest: '.secrets/pilot.json',
    passwordFile: '.secrets/pilot.password',
    commit: true,
    cleanup: false,
    confirmProject: 'mojammaa-sgs',
    confirmCreate: 11,
  })
})

test('buildSchedule conserve une matière vide comme libellé de test neutre', () => {
  const slots = buildSchedule({ role: 'professeur', matiere: '', testClass: 'TEST-2026-09-01-P08' })
  assert.equal(slots.length, 3)
  assert.equal(slots.every(slot => slot.subject === 'Test provisoire'), true)
})

test('exige un mot de passe fort et unique par compte', () => {
  const value = validateManifest(manifest())
  const credentials = {
    passwords: {
      'teacher1@example.test': 'Unique-Teacher-1!2026',
      'teacher2@example.test': 'Unique-Teacher-2!2026',
      'admin@example.test': 'Unique-Admin-3!2026',
    },
  }
  assert.equal(validatePasswords(credentials, value).size, 3)

  credentials.passwords['admin@example.test'] = credentials.passwords['teacher1@example.test']
  assert.throws(() => validatePasswords(credentials, value), /unique/)
})
