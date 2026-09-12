import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { validateTargets } = createRequire(import.meta.url)('../../scripts/repairTestTeacherSchedule.js')
const profile = { role: 'professeur', classes: ['1APIC-1', '2APIC-1', '3APIC-3'] }
const slots = [
  { day: 'friday', startTime: '08:15', classe: '1APIC-4' },
  { day: 'friday', startTime: '09:15', classe: '1APIC-3' },
  { day: 'friday', startTime: '10:30', classe: '1APIC-3' },
]
const schedule = { teacherUid: 'test', weeklySlots: slots }
const flat = slots.map(s => ({ ...s, classeId: s.classe, teacherUid: 'test' }))
test('accepts only the confirmed three invalid test slots', () => {
  assert.doesNotThrow(() => validateTargets(profile, schedule, flat, 'test'))
})
test('refuses newly assigned or replaced classes', () => {
  assert.throws(() => validateTargets({ ...profile, classes: [...profile.classes, '1APIC-4'] }, schedule, flat, 'test'))
  assert.throws(() => validateTargets(profile, { ...schedule, weeklySlots: [slots[0], slots[1], { ...slots[2], classe: '1APIC-1' }] }, flat, 'test'))
})
test('refuses another owner and changed flattened data', () => {
  assert.throws(() => validateTargets(profile, { ...schedule, teacherUid: 'other' }, flat, 'test'))
  assert.throws(() => validateTargets(profile, schedule, flat.map(s => ({ ...s, teacherUid: 'other' })), 'test'))
  assert.throws(() => validateTargets(profile, schedule, flat.slice(1), 'test'))
})
test('refuses changed role or extra slots instead of expanding deletion', () => {
  assert.throws(() => validateTargets({ ...profile, role: 'admin' }, schedule, flat, 'test'))
  assert.throws(() => validateTargets(profile, { ...schedule, weeklySlots: [...slots, slots[0]] }, flat, 'test'))
})
